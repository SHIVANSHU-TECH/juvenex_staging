# Data model

Postgres on Supabase, 51 numbered migrations in `supabase/migrations/`. This
document is a map of what is stored where and the conventions that are easy to
break. It is not a generated schema dump — for exact column types, read the
migration.

Companion docs: `ARCHITECTURE.md` (how the app uses this), `OPERATIONS.md` (how
migrations get applied).

---

## 1. Conventions

- **`uuid` primary keys**, `gen_random_uuid()` defaults.
- **Money is always integer cents** (`total_cents`, `price_cents`,
  `discount_cents`). Never a float, never dollars.
- **Timestamps are `timestamptz`**, defaulting to `now()`.
- **Migrations are idempotent** — `IF NOT EXISTS` / `IF EXISTS` / `DO` blocks —
  and the security ones are wrapped in a single transaction so a partial apply
  rolls back. Follow that pattern: they are applied by hand and re-running one
  must be safe.
- **Numbering is sequential and there is a collision**: both `046_likes_post_index.sql`
  and `046_notifications.sql` exist. Applied fine, but check the highest number
  *and* for a duplicate before you name a new one.

---

## 2. Identity and tenancy

| Table | Notes |
|---|---|
| `auth.users` | Supabase-owned. Passwords live here; the app never stores one. |
| `profiles` | 1:1 with `auth.users` (`id` is the FK, `ON DELETE CASCADE`). The row every authenticated request re-reads. |
| `organizations` | Tenants. `slug` drives the subdomain; branding, referral code, fulfilment address. |

`profiles` is the centre of the system:

```
id uuid PK → auth.users(id)
name, email, phone, avatar_url
role text CHECK ('patient' | 'org_admin' | 'super_admin')
organization_id uuid        -- NULL for platform staff
referral_code text UNIQUE, referred_by uuid → profiles(id)
utm_source, utm_medium, utm_campaign
banned_at timestamptz       -- added later; enforced in getAuthUser(), not by RLS
```

`organization_id` is the tenant key on nearly every other table. `super_admin`
with `organization_id NULL` is platform staff and crosses tenants by design.

---

## 3. Orders and money

### `orders` — dual-purpose, read this before querying it

One table serves **two** unrelated kinds of purchase:

1. **Membership orders** — a Kurv membership. The tier lives inside the `items`
   JSONB and is read back by `parseMembershipFromItems()`.
2. **Vendor product orders** — one row per WhiteLabelMD order, written by
   `persistJuvenexOrder()` (migration 050).

Filter on `vendor` / `items` accordingly; a naive `SELECT * FROM orders` mixes
memberships and prescriptions.

Columns, by the migration that added them:

| Migration | Columns |
|---|---|
| 013 | `id, user_id, total_cents, currency, status, items jsonb, created_at` |
| 022 | `shipping_address, billing_address, intake_answers` (jsonb), `contact_email`, `contact_phone`, `payment_provider`, `payment_reference`, `payment_status`, `prescriberx_status`, `prescriberx_reference`, `prescriberx_sent_at`, `fulfilled_by`, `fulfilled_at`, `admin_notes` |
| 025 | `intake_answers_enc`, `shipping_address_enc`, `billing_address_enc` |
| 050 | `vendor`, `vendor_order_id`, `vendor_status`, `vendor_synced_at` |

`status` ∈ `pending | paid | shipped | refunded | cancelled`.
`orders_vendor_order_id_uidx` makes vendor writes idempotent — a duplicate raises
Postgres `23505`, which `persist-order.ts` swallows deliberately.

**`orders.user_id` is `ON DELETE RESTRICT`, not CASCADE** (migration 024,
DB-C-3): HIPAA six-year retention. Deleting a user with orders fails on purpose.
See `RETENTION.md`.

### PHI columns

`intake_answers_enc`, `shipping_address_enc`, `billing_address_enc` hold
AES-256-GCM ciphertext (`src/lib/encryption.ts`), envelope
`v1:<iv>:<tag>:<ciphertext>`. Migration 024 column-REVOKEs them from the
`authenticated` role: even a client holding a valid anon-key session cannot
select them.

The plaintext `shipping_address` / `billing_address` / `intake_answers` columns
from migration 022 are the pre-encryption originals. Write the `_enc` ones.

### `subscriptions`

```
user_id → profiles(id)
plan text        -- 'monthly','annual','base','tier_2','unlimited' (legacy)
                 -- + canonical tier slugs: metabolic_reset, optimization,
                 --   optimization_metabolic, completely_optimized  (mig 037)
status text      -- 'active' | 'canceled' | 'past_due' | 'trialing'
stripe_subscription_id text UNIQUE
current_period_end timestamptz
selected_protocols jsonb   -- chosen peptide slugs           (mig 036)
trial_started_at timestamptz                                 (mig 049)
organization_id uuid
```

**`stripe_subscription_id` has nothing to do with Stripe.** It is the generic
"externally-managed subscription id" and holds whatever the provider gave us —
a Kurv `payment_id`, or `revenuecat:<app_user_id>` for a native IAP. The name is
historical; renaming it would need a coordinated migration.

Whether a row grants access is decided **only** by
`subscriptionGrantsAccess()` (`src/lib/subscription-access.ts`) — never by
reading `status` directly. `pending` never grants access.

### `coupons` / `coupon_redemptions` (migration 047)

```
coupons: code, discount_type ('percent'|'fixed'), discount_value,
         applies_to (default 'membership'), max_redemptions, per_user_limit,
         redeemed_count, expires_at, active, organization_id, created_by
coupon_redemptions: coupon_id, user_id, order_id, discount_cents
```

`redeemed_count` is maintained by a trigger on `coupon_redemptions`
(insert *and* delete) — do not increment it by hand.

Uniqueness on the code is a **partial/expression index** on `upper(code)`, not a
table constraint. `ON CONFLICT` targeting the column will not match it; write
the conflict target to match the index or the upsert errors at runtime.

### Other commerce tables

| Table | Migration | Purpose |
|---|---|---|
| `shop_products` | 001, seeded 023 | Legacy PrescribeRx catalogue. The jx storefront does **not** read this — it fetches WhiteLabelMD live. |
| `packages`, `product_packages` | 026 | Package/bundle definitions |
| `tenant_product_overrides` | 026 | Per-organization price overrides |
| `prescription_unlocks` | 026 | Which prescriptions a member has unlocked |
| `marketing_leads` | 026 | Lead capture |
| `prescriberx_product_mappings` | 035 | Local product ↔ PrescribeRx product |
| `shop_quiz_responses` | 048 | Storefront funnel quiz answers |
| `affiliate_referrals` | 001 | Referral attribution |

---

## 4. Patient data

| Table | Migration | Contents |
|---|---|---|
| `patient_profiles` | 001, 042 | Weight, height, age, goals, allergies, restrictions, conditions, medications, `starting_weight` |
| `weight_entries` | 040 | Time series, `weight_lbs` with a sanity CHECK (>0, <2000) |
| `progress_photos` | 001 | Storage references |
| `food_logs`, `meal_plans` | 001 | Nutrition logging and generated plans |
| `appointments` | 002, 009, 027, 045 | Telehealth appointments; unified provider refs, status + intake states |

**Progress baseline gotcha:** progress is measured from the first
`weight_entries` row, *not* `patient_profiles.starting_weight`. Using the latter
produced an off-by-one-entry delta (fixed Sep 2026). Keep the two straight.

---

## 5. Community and messaging

| Table | Migration | Notes |
|---|---|---|
| `posts`, `comments`, `likes`, `follows`, `groups`, `group_members` | 001 | Core social graph |
| `post_reports` | 010 | Moderation |
| `comment_likes` | 041 | Likes on comments |
| `notifications` | 046 | `type` ∈ `post_like | post_comment | comment_like`. Follows are deliberately **not** notified. |
| `messages` | 012 | Direct messages |
| `blogs`, blog sections | 011, 043 | CMS content |
| `knowledge_entries` | 038, 039 | Peptide/"pep-pedia" reference content |

Migration 030 added `organization_id` to the community tables — this is what
`canAccessPostTenant()` checks. A social row without a tenant column cannot be
guarded, so any new social table needs one.

---

## 6. AI, audit, and operational tables

| Table | Migration | Purpose |
|---|---|---|
| `ai_conversations` | 001 | Legacy chat storage |
| `chat_conversations`, `chat_messages` | 032 | Current chat storage |
| `ai_usage_daily` | 020 | **Authoritative free-tier AI quota.** Postgres-backed so it survives a pm2 restart, unlike the in-memory burst limiter. |
| `audit_logs` | 002 | Security-relevant actions. Identifiers are hashed — login audits store a SHA-256 of the email, not the address. |
| `audit_log_dlq` | 020 | Dead-letter queue for failed audit inserts, so an audit failure is recoverable rather than silently dropped. Drained by a replay job. |
| `webhook_events` | 002 | Inbound webhook log |
| `webhook_events_seen` | 028 | Idempotency keys — replayed webhooks must not double-process |
| `provider_webhook_events` | 035 | PrescribeRx webhook events |
| `client_errors` | 044 | Browser-side crash reports from `ClientErrorReporter` |

---

## 7. RLS and the service-role bypass

RLS policies exist and are meaningful for any client connecting with the **anon
key** (and for Supabase Storage). But every API route handler uses
`createAdminClient()` — the **service-role** key — which bypasses RLS entirely.

**So RLS is not what protects one tenant from another at the API layer.** That is
`src/lib/tenant-guard.ts` and `src/lib/org-admin-auth.ts`, in application code.
A new route that reads another user's row and forgets the guard has a
cross-tenant leak that the database will not catch. See `ARCHITECTURE.md` §4.

Migration 024 is worth reading in full before touching `orders`: it REVOKEs
public privileges, column-REVOKEs the PHI columns, fixes FK delete behaviour for
retention, and adds `SECURITY DEFINER` to `set_updated_at()`.

---

## 8. Adding a migration

1. Next sequential number, `NNN_short_snake_case.sql` (check for a duplicate
   number as well as the highest one).
2. Idempotent statements; wrap anything multi-step in `BEGIN; … COMMIT;`.
3. Header comment saying what it does and why — the existing files do this well;
   024 and 025 are good models.
4. Apply it by hand against production (`OPERATIONS.md` §Migrations) and commit
   the file. There is no migration runner in the deploy path, so **an applied
   migration and a committed migration are two separate acts** — doing one
   without the other is how the tree drifts from the database.
