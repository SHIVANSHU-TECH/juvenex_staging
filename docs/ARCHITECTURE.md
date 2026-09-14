# Architecture

How the Juvenex application is put together: what handles a request, where the
trust boundaries are, and which of the several parallel systems in this tree is
the live one.

Companion docs: `DATA_MODEL.md` (tables), `API_REFERENCE.md` (every route),
`OPERATIONS.md` (deploy and runbook).

---

## 1. The shape of the thing

One Next.js 16 App Router application. No separate backend service — every
server-side concern is a route handler or a Server Component in the same tree.
It talks to four external systems:

| External system | Purpose | Boundary in code |
|---|---|---|
| **Supabase** | Postgres + Auth + Storage | `src/lib/supabase/*` |
| **WhiteLabelMD** | Product catalogue, orders, patient portal | `src/lib/juvenex/client.ts` |
| **Stripe** | Card authorization for the store | `src/lib/juvenex/stripe.ts` |
| **Kurv** | Recurring membership billing | `src/lib/payments/kurv-provider.ts` |

Plus smaller ones: Resend (transactional email), PrescribeRx (telehealth intake
embeds), RevenueCat (native IAP), Tapfiliate (affiliate tracking), xAI/Anthropic
(AI chat), USDA FoodData Central (nutrition lookup).

### The most important structural fact

**There are two complete, parallel storefronts in this tree.**

| | Legacy | Current |
|---|---|---|
| Routes | `/checkout` (`/shop` is now a 308 to `/store`) | `/` and `/store/**` (the `(jx)` route group) |
| Catalogue | PrescribeRx, seeded into `shop_products` | WhiteLabelMD, fetched live |
| Payment | Kurv hosted page | Stripe PaymentElement → vendor `payment_token` |
| Gate | Membership-gated | Auth-gated |

The `(jx)` tree is the live storefront. `src/app/shop/` has been deleted and
`/shop` now 308s to `/store` (`next.config.ts`), but `src/app/checkout/` is still
mounted, because `/checkout/membership` remains the **membership** purchase path
— memberships never moved to the new storefront. So "legacy" here means *legacy
product checkout*, not dead code. Check git history before deleting anything
under `src/app/checkout/`; `/api/shop/products` is still served too.

---

## 2. Request lifecycle

```
request
  │
  ├─ src/proxy.ts  (Next 16's middleware; renamed from middleware.ts)
  │     • resolves a tenant from the subdomain (<slug>.juvenex.space / .app)
  │     • sets the CSP and security headers on every response
  │
  ├─ Server Component  ──────────────►  src/lib/jx/server.ts
  │     (page render)                     unstable_cache, 300 s, tag juvenex-catalog
  │                                        └─► juvenexClient  ──► WhiteLabelMD
  │
  └─ Route handler (src/app/api/**)
        • rateLimit(key, limit, windowMs)     in-memory, per process
        • getAuthUser() or requireUser()      JWT → profile row → ban check
        • tenant guard                        cross-org check, in code not RLS
        • zod schema parse                    .strict() on every input envelope
        • createAdminClient()                 service-role Supabase (bypasses RLS)
```

### Middleware is named `proxy.ts`

Next 16 renamed `middleware.ts` → `proxy.ts`. This trips people up constantly:
a file called `middleware.ts` in this repo would simply never run. It does two
jobs — subdomain tenant resolution and the Content-Security-Policy — and both
domains (`juvenex.space` primary, `juvenex.app` legacy) are accepted.

Everything third-party that loads a script or beacons out needs a CSP entry
there, and **a CSP block is silent** — no error, the feature just does nothing.
Current entries: PrescribeRx (intake resize), LeadConnector (chat widget),
Tapfiliate + `frstre.com` (its tracker's actual beacon host), Metricool,
`js.stripe.com` + `hooks.stripe.com` (PaymentElement and 3-D Secure), and an
explicit `media-src blob:` for the landing hero video.

---

## 3. Authentication

**Supabase Auth verifies the password; the application issues its own token.**

```
POST /api/auth/login
   supabase.auth.signInWithPassword(email, password)     ← Supabase verifies
   → signToken(userId)                                    ← our own HS256 JWT, 7 d
   → browser stores it in localStorage as `auth_token`
   → every subsequent request: Authorization: Bearer <jwt>
```

Server-side, `getAuthUser()` (`src/lib/supabase/server.ts`) runs on **every**
authenticated request and does four things:

1. Verifies the JWT signature (`JWT_SECRET`).
2. Re-reads the `profiles` row from the database — no user data is trusted from
   the token beyond the id.
3. **zod-validates that row and fails closed.** A schema drift that turned
   `banned_at` into `undefined` would make `!== null` truthy and let a banned
   account through; `safeParse` failing returns null → 401 instead.
4. Hard-blocks `banned_at !== null`. The token stays technically valid, but a
   banned user is refused on every request.

`requireUser()` in `src/lib/juvenex/route-utils.ts` is the storefront's wrapper:
rate limit + `getAuthUser()` + a typed `{ user }` or `{ response }` result.

### Consequences you must design around

- **There is no cookie session.** Server Components cannot read the token, so
  server-side route gating is not possible the way it is in a cookie-based app.
  Gating happens either client-side or inside route handlers.
- **A JWT is valid for 7 days and cannot be revoked**, other than by banning the
  account (checked per request) or rotating `JWT_SECRET` (logs everyone out).
- Rotating `JWT_SECRET` is therefore the emergency "log everyone out" lever.

### Roles

Three, in `profiles.role` (`src/lib/types/roles.ts`): `patient`, `org_admin`,
`super_admin`. Platform staff are `super_admin` with `organization_id = NULL`.

---

## 4. Tenancy (white-label)

Organizations are tenants. A tenant gets a subdomain (`<slug>.juvenex.space`),
its own branding (`021_org_branding`), its own product price overrides
(`tenant_product_overrides`), and an `org_admin` who can manage only that org.

**RLS is not the enforcement mechanism at the API layer.** Every route handler
uses the service-role Supabase client, which bypasses RLS entirely. Tenant
isolation is therefore *code*, and it lives in two helpers:

| Helper | Used by |
|---|---|
| `authorizeOrgAdmin()` (`src/lib/org-admin-auth.ts`) | `/api/org/[slug]/admin/**` |
| `canAccessUserTenant()` / `canAccessPostTenant()` (`src/lib/tenant-guard.ts`) | social + messaging routes |

If you add a route that reads another user's data, it must call one of these.
Forgetting is not caught by the database.

One deliberate exception: `canMessageUserTenant()` relaxes the rule so platform
staff (`super_admin`, `organization_id NULL`) are messageable from inside any
tenant — they are the support team, and the strict rule made "Message support"
lead to an inbox the user could never start a thread from. **Messaging only**;
social surfaces keep the strict rule.

RLS policies do exist in the migrations and matter for any client that connects
with the anon key rather than through the API.

---

## 5. The vendor boundary (WhiteLabelMD)

`src/lib/juvenex/client.ts` is the **only** file in the repository that makes an
outbound HTTP call to the vendor. It is `import 'server-only'` on line 1, which
makes it a compile error for the API key to end up in a browser bundle.

Everything else goes through it:

```
Server Components ──► src/lib/jx/server.ts ──┐
                                              ├──► juvenexClient ──► panel.whitelabelmd.com
API routes /api/juvenex/** ───────────────────┘
Browser ──► /api/juvenex/** (our origin only; never the vendor directly)
```

The client validates every response envelope: it must parse as JSON, be HTTP-OK,
and carry a numeric `status`. Anything else becomes a `JuvenexApiError` — 502 for
a malformed response, 504 on the 15 s timeout, 503 when the key is unconfigured.

### Two vendor quirks that shape the whole design

1. **`Create_Order` takes one `product_id` and has no quantity field.** A bag of
   N items is N calls, N charges and N order ids. This is why the cart has no
   quantity stepper (`JxStore.tsx`), why order persistence writes one row per
   vendor order, and why the Stripe flow needs manual capture.
2. **Upstream status codes ride inside HTTP 200.** `status: 1` is success,
   `5` is declined, `0` is a validation error. Checking the HTTP code alone will
   read a declined card as a successful order.

The catalogue arrives as flat rows where all structure is buried in free-text
`product_name` (`"Compounded Tirzepatide (7.5 mg/week) - 6 month supply"`).
`src/lib/jx/catalog.ts` is a pure, tested parser that extracts molecule, dose,
schedule, supply months and product kind, and computes price-per-month. It is
the one piece of storefront logic with real unit tests
(`src/lib/jx/catalog.test.mts` against `fixtures/products.json`).

Catalogue fetches are wrapped in `unstable_cache` — 300 s, tag `juvenex-catalog`
— shared across every request and route. A catalogue failure never throws: the
store renders an honest "the catalogue is not loading" card rather than a blank
grid or a 500.

---

## 6. Money

There are **four** payment paths in this codebase. Knowing which is which is the
single most confusing thing about the repo.

| Path | Provider | What it buys | Entry point |
|---|---|---|---|
| **Store checkout** | Stripe (direct SDK) | Products from WhiteLabelMD | `/api/juvenex/orders/create-intent` → `/finalize` |
| **Membership** | Kurv (via the provider abstraction) | Recurring membership | `/api/payments/membership/checkout` |
| **Native IAP** | RevenueCat → App Store / Play | Membership, in the mobile app | `/api/payments/revenuecat/webhook` |
| **Legacy product checkout** | provider abstraction | Superseded | `/api/payments/checkout` |

### Store checkout — Stripe, manual capture

Full detail in `STRIPE_CHECKOUT.md`. The shape: one manual-capture PaymentIntent
covers the whole bag; `finalize` calls the vendor once per line with that same
intent id as `payment_token`, then captures on total success or cancels the
authorization on any failure. The customer is charged with a full set of orders,
or not charged at all.

**It is merged but inert.** No Stripe keys are provisioned, so both routes
answer `503 payment_not_configured`. Placeholder-shaped keys (`your_…`,
`…placeholder…`) are treated as absent, so a copied `.env.example` cannot be
mistaken for a working configuration.

### Membership — Kurv, through the provider abstraction

`src/lib/payments/` is an interface (`PaymentProvider`) plus four
implementations (Kurv, Stripe, Authorize.net, Stub) chosen by `PAYMENT_PROVIDER`.
Callers only ever see `getPaymentProvider()`. In production the stub is
hard-disabled — `isPaymentConfigured()` returns false so a route can serve a
graceful 503 instead of the app failing to boot without a processor.

Kurv memberships are **monthly recurring**: an initial charge now, a
`payment_start_date` one month out, and 120 scheduled payments — effectively
active-until-cancelled. Only coupon/comp orders are one-time.

Kurv's renewal and failure webhooks are undocumented, so
`/api/cron/reconcile-subscriptions` is the authoritative backstop: it asks the
provider for the real status of every active recurring subscription, lapses the
ones that ended, rescues orders stuck in `pending` from a garbled webhook, and
runs the day-7 trial conversion pass. It runs every 6 hours (`OPERATIONS.md`).

### Access is decided in one place

`subscriptionGrantsAccess()` (`src/lib/subscription-access.ts`) is the canonical
gate. Every surface that asks "does this subscription unlock paid access?" must
go through it — the rules had previously drifted across four routes. The rule:

- status must be `active` or `trialing` (`pending` deliberately does **not**
  grant access, or signup would bypass the paywall);
- an `active` row **with** an external subscription id is genuinely recurring →
  active until cancelled, not expired at `current_period_end`;
- a `trialing` row is **always** period-bound, even with a captured card — no
  money has moved, so a lapsed trial drops access;
- a one-time grant (no provider handle) is period-bound.

`src/lib/marketplace-access.ts` is the authoritative source of tier pricing and
what each tier unlocks. `priceCents` there — never a client-supplied amount — is
what the membership checkout charges and what the webhook amount-integrity check
compares against. Access is granted per **peptide**, not per group: a tier allows
up to N peptides from any group, stored in `subscriptions.selected_protocols`.

---

## 7. Client-side state

There is **no state management library** — no Redux, Zustand, Jotai or React
Query. Deliberately.

- **Server state** is Server Components. Filters, search and sort on `/store`
  live entirely in the URL and every control is a `<Link>`, so the back button
  works and a filtered view is shareable.
- **The cart** is `localStorage` (key `jx.bag.v1`) read through
  `useSyncExternalStore` with a raw-string-keyed parse cache, so snapshots are
  referentially stable and hydration never mismatches (the server always renders
  an empty bag). Cross-tab sync via the `storage` event. Corrupt storage is
  filtered per line; every access is try/catch'd for private mode.
- **Auth** is `src/lib/auth-context.tsx` over the same `localStorage` token.

The cart is per-browser: it does not sync across devices and is lost when the
user clears storage.

---

## 8. PHI, encryption, and AI

Patient data is PHI, and two mechanisms protect it.

**At rest:** `src/lib/encryption.ts` — AES-256-GCM with an scrypt KDF, envelope
format `v1:<iv>:<tag>:<ciphertext>`. Applied to `orders.intake_answers_enc`,
`shipping_address_enc` and `billing_address_enc` (migrations 008, 025). A legacy
SHA-256-KDF envelope is still readable. **`ENCRYPTION_KEY_SALT` must never change
without re-encrypting every row written under the old salt** — doing so breaks
decryption permanently, which is also why that key cannot simply be rotated.

**On the way to an AI provider:** `src/lib/phi-sanitizer.ts` strips the HIPAA
Safe Harbor identifiers before any payload reaches xAI or Anthropic. Read its
header before trusting it: personal names in free text, sub-state geography,
biometric fields and face photographs are **not** removed by regex, and callers
must keep them out of prompts. It is a last line of defence, not a complete
de-identification solution.

AI chat is quota'd in two layers (`src/lib/rate-limit.ts`): a per-minute burst
limit in process memory, and a Postgres-backed daily counter
(`ai_usage_daily`) that survives restarts and is the authoritative free-tier gate.

---

## 9. Observability

- `src/lib/logger.ts` — structured server logging.
- `src/lib/audit.ts` — `audit_logs`, with a dead-letter queue (`audit_log_dlq`)
  so an audit insert failure is recoverable rather than lost. Sensitive
  identifiers are hashed (login audits store a SHA-256 of the email, not the
  address).
- `client_errors` + `ClientErrorReporter` + `global-error.tsx` — because auth is
  a localStorage JWT and rendering is client-heavy, a browser-side crash leaves
  no trace in the server logs. Without this, "it's broken on my phone" is
  unfalsifiable.
- `webhook_events` / `webhook_events_seen` — inbound webhook idempotency.

---

## 10. Known rough edges

Documented so nobody rediscovers them as bugs:

- **`src/lib/config.ts` is half-dead.** Only `config.app` and `config.features`
  are read anywhere. `config.auth` (Clerk), `config.telehealth` (Daily.co),
  `config.database`, `config.ai` and `config.payments` are consumed by nothing —
  leftovers from an earlier plan. Do not configure `AUTH_PROVIDER`,
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `SENDGRID_API_KEY`, `TWILIO_*` or
  `DAILY_CO_*` expecting an effect. Email is Resend; auth is Supabase.
- **Soft-404 on three dynamic routes.** `/store/[id]`, `/blog/[slug]` and
  `/org/[slug]` return HTTP 200 with `robots: noindex` instead of a 404, because
  streaming has begun before `notFound()` runs. Framework behaviour, analysed
  and closed in `STAGE1_DECISIONS.md` blocker #9. Unmatched routes 404 correctly.
- **Three deploy targets' config coexist**; two (`.netlify/`, `.vercel/`) are
  dead. The real deploy is a build plus a pm2 restart.
- **Migrations are applied by hand.** There is no migration runner in the deploy
  path — see `OPERATIONS.md`.
