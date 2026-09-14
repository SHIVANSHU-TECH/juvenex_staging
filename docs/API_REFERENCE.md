# API reference

Every route under `src/app/api/`. 130 route files, grouped by domain.

Companion docs: `ARCHITECTURE.md` (how auth and tenancy work),
`juvenex-api-integration.md` (the vendor endpoints behind `/api/juvenex/**`),
`STRIPE_CHECKOUT.md` (the store checkout flow).

---

## Conventions

**Authentication.** Send the login JWT as `Authorization: Bearer <token>`. There
is no cookie session. The **Auth** column below means:

| Value | Meaning |
|---|---|
| — | Public. No token needed. |
| user | Any signed-in, non-banned account (`getAuthUser()` or `requireUser()`). |
| super_admin | `profiles.role = 'super_admin'`. |
| org admin | `super_admin`, or `org_admin` of that organization (`authorizeOrgAdmin()`). |
| secret | Shared-secret header, not a user token. |
| signature | Provider webhook signature. |

**Rate limits** are `requests / window`, per IP for public routes and per user
for authenticated ones, held **in process memory** — they reset on a pm2
restart, by design (`src/lib/rate-limit.ts`). Unless stated, the window is 60 s.
Over the limit returns **429**.

**Request bodies** are zod-parsed. Most envelopes are `.strict()`, so an unknown
field is a **400**, not a silently ignored key. A validation failure never
reaches the database or the vendor.

**Status codes.** 400 validation · 401 missing/invalid token or banned account ·
403 wrong role or wrong tenant · 404 not found · 429 rate limited · 502 malformed
vendor response · 503 an integration is not configured · 504 vendor timeout.

**A 503 is usually deliberate**, not an outage: the Stripe checkout, the payment
provider factory and the vendor client all answer 503 when their credentials are
absent, so an unconfigured environment gives a clear message rather than a stack
trace.

---

## Auth

| Route | Methods | Auth | Limit | Notes |
|---|---|---|---|---|
| `/api/auth/register` | POST | — | 20/min | Creates the `auth.users` row (service-role) and its `profiles` row |
| `/api/auth/login` | POST | — | 5/min | Supabase verifies the password; we issue our own 7-day HS256 JWT. Audit-logged with a SHA-256 of the email |
| `/api/auth/forgot-password` | POST | — | 5/min | |
| `/api/auth/callback` | GET | — | | Supabase auth callback |
| `/api/auth/profile` | GET, PUT | user | 30/min | |
| `/api/auth/account` | DELETE | user | **1/min** | Account deletion. Orders are `ON DELETE RESTRICT` for retention — see `RETENTION.md` |

## Store — WhiteLabelMD (`/api/juvenex/**`)

The money path. Every route here is a thin, validated wrapper over
`src/lib/juvenex/client.ts`; the browser never calls the vendor directly.

### Catalogue

| Route | Methods | Auth | Limit | Vendor call |
|---|---|---|---|---|
| `/api/juvenex/products` | GET | — | 60/min | `Get_Products` |
| `/api/juvenex/products/[id]` | GET | — | 60/min | `Get_Product_Details` |
| `/api/juvenex/coupons` | POST | — | 30/min + per-code | `Check_Coupons` |
| `/api/juvenex/member` | POST | — | 20/min | `Member_View`. **Unauthenticated membership/pricing oracle** — arbitrary email in, `{data: 0|1, m_price}` out, with no caller in `src/`. Flagged for deletion, `STAGE1_DECISIONS.md` blocker #8 item 3 |

Public is correct for a catalogue. Responses pass through
`publicProductEnvelope` (`src/lib/juvenex/public-fields.ts`), an allow-list, so a
new vendor field cannot leak by default.

### Checkout

| Route | Methods | Auth | Limit | Notes |
|---|---|---|---|---|
| `/api/juvenex/orders/create-intent` | POST | user | 20/min | Prices the bag **server-side** and opens one manual-capture PaymentIntent. Body carries product ids and coupon codes only — never an amount. 503 when Stripe is unconfigured |
| `/api/juvenex/orders/finalize` | POST | user | 5/min | `Create_Order_Offline` once per line with the same `payment_token`, then capture on total success / cancel on any failure |
| `/api/juvenex/orders` | POST | user | 10/min | Legacy card-forwarding path. `@deprecated` |
| `/api/juvenex/orders/offline` | POST | user | 10/min | Legacy token path. `@deprecated` |
| `/api/juvenex/orders/custom-price-offline` | POST | **super_admin** | 5/min | Arbitrary price. Staff only, for obvious reasons |
| `/api/juvenex/orders/confirm` | POST | user | 5/min | |
| `/api/juvenex/intake/pending-forms` | POST | user | 60/min | Stage 2 scaffolding, inert behind `NEXT_PUBLIC_INTAKE_ENABLED` |

### Patient portal (`/api/juvenex/portal/*`)

All **POST**, all `user`. Every one verifies that the upstream record belongs to
the signed-in profile (`_utils.ts`) — a caller cannot name another member's
email or order id.

| Route | Limit |
|---|---|
| `get-order`, `list-orders`, `list-orders-updated-since`, `get-order-history`, `get-customer`, `customer-view`, `get-enrollment`, `patient-message`, `local-orders` | 60/min |
| `send-patient-message` | 10/min (multipart; attachments) |
| `get-order-by-payment-token`, `update-shipping-address` | 5/min |
| `update-order`, `cancel-enrollment` | 3/min |

## Payments and membership

| Route | Methods | Auth | Limit | Notes |
|---|---|---|---|---|
| `/api/payments/membership/checkout` | POST | user | 20/min | Kurv hosted session. The amount comes from `marketplace-access.ts`, never the client |
| `/api/payments/membership/select` | POST | user | 20/min | Choose tier / peptides → `subscriptions.selected_protocols` |
| `/api/payments/membership/coupon-preview` | POST | user | 20/min | Discounted total before the money path runs |
| `/api/payments/checkout` | POST | user | 10/min | Legacy product checkout via the provider abstraction |
| `/api/payments/confirm` | POST | user | 30/min | |
| `/api/payments/verify` | POST | user | 30/min | Amount-integrity check against the expected tier price |
| `/api/payments/subscription` | GET | user | | Current subscription |
| `/api/payments/subscription/cancel` | POST | user | 10/min | |
| `/api/payments/availability` | GET | — | | Whether a processor is configured |
| `/api/payments/authnet/redirect` | GET | — | | Authorize.net return URL |
| `/api/payments/webhook` | POST | signature | 60/min | Kurv posts **form-encoded** `response=<json>` — not a JSON body. Idempotency via `webhook_events_seen` |
| `/api/payments/revenuecat/webhook` | POST | secret | | `REVENUECAT_WEBHOOK_TOKEN`. Native IAP → the same `subscriptions` table |
| `/api/webhooks/prescriberx` | POST | signature | | `PRESCRIBERX_WEBHOOK_SECRET` |

Always return 200 to a provider webhook, even on a rejected event — a non-200
triggers retries that make idempotency bugs worse.

## Orders (local)

| Route | Methods | Auth | Limit |
|---|---|---|---|
| `/api/orders` | GET | user | 60/min |
| `/api/orders/[id]` | GET | user | 120/min |

Reads the local `orders` table (memberships *and* persisted vendor orders — see
`DATA_MODEL.md` §3). Live vendor state comes from the portal routes instead.

## Patient

| Route | Methods | Auth | Limit |
|---|---|---|---|
| `/api/patient/profile` | GET, POST, PUT | user | 30/min |
| `/api/patient/summary` | GET | user | 60/min |
| `/api/patient/weight` | GET, POST, DELETE | user | 30/min |
| `/api/patient/progress-photos` | GET, POST, PATCH, DELETE | user | 20–40/min |
| `/api/patient/membership/protocols` | POST | user | 20/min |
| `/api/food-log` | POST, GET, PUT, DELETE | user | 60–120/min |
| `/api/meals/generate` | POST, GET | user | 10/min |
| `/api/nutrition/search` | GET | user | 60/min |
| `/api/profile/avatar` | POST | user | 5/min |

## Social and community

Every route here goes through a tenant guard — `canAccessUserTenant()` or
`canAccessPostTenant()` — because the service-role client bypasses RLS.

| Route | Methods | Auth | Limit |
|---|---|---|---|
| `/api/social/feed` | GET | user | 60/min |
| `/api/social/posts` | GET, POST | user | 20/min |
| `/api/social/posts/[id]` | PATCH, DELETE | user | 30/min |
| `/api/social/posts/[id]/like` | POST | user | 60/min |
| `/api/social/posts/[id]/comments` | GET, POST | user | 30/min |
| `/api/social/posts/[id]/comments/[commentId]` | PATCH, DELETE | user | 30/min |
| `/api/social/posts/[id]/comments/[commentId]/like` | POST | user | 60/min |
| `/api/social/posts/[id]/report` | POST | user | **5 / 10 min** |
| `/api/social/posts/liked` | GET | user | |
| `/api/social/posts/upload` | POST | user | 10/min |
| `/api/social/notifications` | GET, PATCH | user | 120 / 60 per min |
| `/api/social/users`, `/[id]`, `/[id]/follow`, `/followers`, `/following` | GET / POST | user | 30–60/min |
| `/api/groups` | GET, POST | user | 10/min |
| `/api/groups/[id]`, `/members`, `/posts` | GET, POST, DELETE | user | 20/min |
| `/api/messages` | GET | user | 120/min |
| `/api/messages/[threadUserId]` | GET, POST | user | 120/min |
| `/api/messages/[threadUserId]/send` | POST | user | 60/min |
| `/api/messages/unread-count` | GET | user | 240/min |
| `/api/messages/support` | GET | user | 30/min |

Messaging uses `canMessageUserTenant()`, which deliberately allows any member to
reach platform staff (`super_admin`, `organization_id NULL`). Social surfaces
keep the strict same-org rule.

Notifications fire on `post_like`, `post_comment` and `comment_like`. **Follows
are deliberately not notified.** Inserts are best-effort: a notification failure
must never fail the underlying action.

## Admin (`super_admin`)

| Route | Methods | Limit |
|---|---|---|
| `/api/admin/overview` | GET | 60/min |
| `/api/admin/users` | GET | 60/min |
| `/api/admin/orders`, `/[id]` | GET, PATCH | 60–120/min |
| `/api/admin/orders/[id]/refund` | POST | 20/min |
| `/api/admin/coupons`, `/[id]`, `/[id]/send` | GET, POST, PATCH, DELETE | 30–60/min |
| `/api/admin/blogs`, `/[id]`, `/upload` | GET, POST, PATCH, DELETE | 20–60/min |
| `/api/admin/affiliates` | GET | 60/min |
| `/api/admin/reports`, `/[id]` | GET, POST | 60/min |
| `/api/admin/messages/[userId]` | GET, POST | 60–120/min |
| `/api/admin/organizations/[id]/branding` | PUT | 30/min |
| `/api/admin/organizations/[id]/integration` | GET, PUT, DELETE | 30/min |
| `/api/admin/organizations/[id]/product-overrides` (+ `/csv`) | GET, PUT, DELETE, POST | 10–30/min |
| `/api/admin/settings/health` | GET | 30/min |
| `/api/admin/settings/test-prescriberx` | POST | 10/min |
| `/api/admin/settings/webhooks` (+ `/[subscription]`, `/event-types`) | GET, POST, DELETE | 10–30/min |

## Organization / white-label

| Route | Methods | Auth | Limit |
|---|---|---|---|
| `/api/org/[slug]/admin` | GET, PUT | org admin | 20–60/min |
| `/api/org/[slug]/admin/members` (+ `/[userId]`) | GET, POST | org admin | 60/min |
| `/api/org/[slug]/admin/orders` | GET | org admin | 60/min |
| `/api/org/[slug]/admin/reports` (+ `/[id]`) | GET, POST | org admin | 60/min |
| `/api/organizations` | GET, POST | user | 10–60/min |
| `/api/organizations/[id]` | GET | user | |
| `/api/organizations/slug/[slug]` | GET | — | |
| `/api/organizations/referral/[code]` | GET | — | |
| `/api/white-label/signup` | POST | — | **8 / 10 min** |
| `/api/white-label/logo` | POST | — | **20 / 10 min** |

## Telehealth

| Route | Methods | Auth | Limit |
|---|---|---|---|
| `/api/telehealth/appointments` | POST, GET, PUT | user | 10–30/min |
| `/api/telehealth/encounter-types` (+ `/[id]/schema`) | GET | — | |
| `/api/intake-proxy/[...path]` | GET, POST, PUT, DELETE | — | |

`intake-proxy` serves the PrescribeRx intake first-party. It rewrites each
upstream `Set-Cookie` — stripping `Domain=prescribe-rx.com`, dropping `Secure`
only over http — and replays cookies individually. The generic header loop would
collapse them via `Headers.set` and the Livewire session would die with a 419
"Page Expired" on step 2. Do not fold `set-cookie` back into that loop.

## AI

| Route | Methods | Auth | Limit |
|---|---|---|---|
| `/api/ai/chat` | GET, POST | user | 60/min burst |
| `/api/ai/insights` | POST | user | 10/min |

Two quota layers: the in-memory burst limit above, plus a Postgres-backed daily
free-tier counter (`ai_usage_daily`) that survives restarts. Payloads pass
through `phi-sanitizer.ts` before leaving for xAI or Anthropic — read its header
for what it does **not** strip.

## Content, media, misc

| Route | Methods | Auth | Limit | Notes |
|---|---|---|---|---|
| `/api/blogs`, `/[slug]` | GET | — | 120/min | |
| `/api/shop/products`, `/[id]` | GET, POST | — / user | 20/min | Legacy PrescribeRx catalogue |
| `/api/packages` | GET | user | | |
| `/api/affiliate` | GET | user | 30/min | Tapfiliate stats |
| `/api/marketing/leads` | POST | user | 10/min | |
| `/api/client-error` | POST | user | 120/min | Browser crash reports → `client_errors` |
| `/api/img/[...path]` | GET, POST, PUT, PATCH, DELETE | — | | Image proxy for hosts the Next optimizer will not take. Allow-listed in `src/lib/url-allowlist.ts` |

## Cron

| Route | Methods | Auth |
|---|---|---|
| `/api/cron/reconcile-subscriptions` | POST | `CRON_SECRET` as `Authorization: Bearer` or `x-cron-secret` |

Without `CRON_SECRET` set the endpoint is **disabled** (503) rather than open.
It lapses subscriptions the provider reports as ended, rescues orders stuck
`pending` inside a 14-day window, and runs the day-7 trial conversion pass.
Batch cap 500. Schedule and operational detail in `OPERATIONS.md`.

---

## Adding a route

1. Rate limit first — before any I/O.
2. `requireUser()` (storefront) or `getAuthUser()`, and check the role if it
   matters.
3. If it touches another user's data, call a tenant guard. The database will not
   catch a missing one.
4. Parse the body with a `.strict()` zod schema from `src/lib/juvenex/schemas.ts`
   or a sibling module. **Never accept a price, an amount or a discount from the
   client** — look it up server-side.
5. Return a typed error shape, not a raw exception; `upstreamError()` maps vendor
   failures to the right status.
6. Add the route to this file.
