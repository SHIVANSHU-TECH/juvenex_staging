# Recon: `/root/GLP_assistant` — Stage 1

## 1. Is this the live source?

**Yes — this tree serves both staging AND production.** Confirmed via pm2 (read-only `pm2 jlist`):

| Process | cwd | Port | distDir | Status |
|---|---|---|---|---|
| `juvenex-staging` | `/root/GLP_assistant` | 3005 (127.0.0.1) | `.next-staging` | online |
| `juvenex-web` | `/root/GLP_assistant` | 3002 | `.next` (default) | online |

`next.config.ts:7` — `distDir: process.env.NEXT_DIST_DIR || '.next'`. Same source, two builds.

### 🚩 FLAG — the checked-in deploy config points somewhere that does not exist

`.netlify/netlify.toml:14`:
```toml
publish = "/root/.openclaw/workspace/GLP_assistant/.next"
```
`/root/.openclaw/workspace/GLP_assistant` **does not exist on this box**. This is a stale Netlify UI-generated config from 14 Apr. Netlify is not the deploy path — nothing here deploys to it.

`vercel.json` and root `netlify.toml`: **absent**. `.vercel/` exists (project `juvenex`, `prj_fIa8L6zG9470oZ8IlcBvryGdhbtt`, org `team_PN1eQJIj6wy04zEmyGffQvgC`) with a full `vercel build --prod` output from a past run. Also not the live path.

**Actual deploy = `npm run build` on this box + `pm2 restart`.** Three deploy targets' config coexist in the repo; two are dead.

### 🚩 FLAG — production is running older code than staging

- `.next/BUILD_ID` = `jC6HJl8bR-fpZVhBAIe52`, **10 Aug 21:46**
- `.next-staging/BUILD_ID` = `uSqgWmYdPOXqEy3zaRRMO`, **17 Aug 18:35**

20 source files are newer than the prod build, including `src/lib/juvenex/client.ts`, `src/lib/juvenex/schemas.ts`, `src/components/jx/checkout/CheckoutForm.tsx`, `src/app/api/juvenex/portal/_utils.ts`. Prod's route manifest lacks `/store/account/orders*`, which staging has. **Prod and staging are materially different applications right now.** Nothing in `src/` is newer than the staging build, so staging is current with the tree.

---

## 2. Directory tree

### Root
```
.agents/  .claude/  .codex/  .git/  .netlify/  .vercel/
.env.example  .env.local        docs/  node_modules/  public/
AGENTS.md  CLAUDE.md            scripts/  src/  supabase/
COST_MODEL.md  README.md
eslint.config.mjs  next.config.ts  package.json  package-lock.json
postcss.config.mjs  tsconfig.json  next-env.d.ts  tsconfig.tsbuildinfo
```

### Dead code / junk at root
| Path | Size / date | Note |
|---|---|---|
| `.next.backup-20260717-230636/` … ×5 | 5 build dirs | 17 Jul → 10 Aug snapshots |
| `.next-dev/`, `.next-staging-debug/`, `.next-staging-turbo/` | 3 more | one-off build dirs |
| `.netlify/functions/___netlify-server-handler.zip` | **21 MB, tracked in git** | Apr 14 build artifact. Scanned it — **no secrets inside** (`config.env` empty) |
| `.vercel/output/` | full build output | dead deploy target |
| `dist.key` (mode 0600) + `dist.csr` | 10 Jul | **TLS private key sitting in the project dir**. Untracked; not under `public/` so Next won't serve it |
| `b55acaf6-…JPG` | 127 KB | stray photo |
| `bug5-discovery-report.md` | 24 KB | old investigation notes |
| `public/updates/braeden.html`, `check4.html`, 2 PNGs | | **publicly served** internal client-update pages |

No `.v1/.v2/.v3` variants, no `.bak`/`.orig` in `src/` — `src/` itself is clean.

### `src/app/` (one level)
```
(jx)/          ← NEW WhiteLabelMD storefront: / and /store/**
shop/          ← LEGACY storefront (PrescribeRx)
checkout/      ← LEGACY checkout (Kurv)
api/           ← 28 route groups
admin/  affiliate/  blog/  community/  consult/  dashboard/  food-log/
intake/  landing/  learn/  legal/  login/  meals/  messages/  org/
organization/  profile/  provider/  register/  reset-password/  settings/
telehealth/  upgrade/  white-label/
layout.tsx  providers.tsx  error.tsx  global-error.tsx  loading.tsx
not-found.tsx  manifest.ts  sitemap.ts  globals.css
```

**`src/app/page.tsx` is deleted** (git `D`) — `/` is now served by the `(jx)` route group.

---

## 3. Stack

| Layer | Choice | Evidence |
|---|---|---|
| Framework | **Next.js 16.2.3**, App Router, React 19.2.4 | `package.json` |
| Build | `next build --webpack` (Turbopack opted out) | `package.json:7` |
| Package manager | **npm** (`package-lock.json` v3) | lockfile |
| Language | TypeScript 5, strict | `tsconfig.json` |
| Styling | Tailwind v4 (`@tailwindcss/postcss`) + CSS Modules + `src/styles/jx.css` | |
| Auth | **Supabase Auth** (`signInWithPassword`) → **own HS256 JWT** (`jsonwebtoken`, 7 d) + `bcryptjs` | `src/app/api/auth/login/route.ts`, `src/lib/jwt.ts` |
| Session transport | **localStorage `auth_token` → `Authorization: Bearer`** | `src/lib/auth-context.tsx:28` |
| State mgmt | **None** (no Redux/Zustand/Jotai/React Query). Cart = `useSyncExternalStore` over `localStorage`; server state = RSC | `src/components/jx/JxStore.tsx` |
| Data layer | `@supabase/supabase-js` 2.103 + `@supabase/ssr`; service-role admin client server-side | `src/lib/supabase/*` |
| Vendor caching | `unstable_cache`, 300 s, tag `juvenex-catalog` | `src/lib/jx/server.ts:28` |
| Payments | **Vendor-hosted (WhiteLabelMD `Create_Order`)** for Stage 1. Also present: `stripe@22`, Kurv (memberships), Authorize.net, RevenueCat IAP | |
| Validation | **zod 4.3.6** — shared client/server schemas | `src/lib/juvenex/schemas.ts` |
| Middleware | `src/proxy.ts` (Next 16 naming) — CSP + tenant resolution | |
| Deploy target | **pm2 + `next start` on this box** (Netlify/Vercel configs are dead) | |
| Tests | `node --test` + `tsx --test`; one Stage-1 test: `src/lib/jx/catalog.test.mts` | |

---

## 4. Vendor integration (WhiteLabelMD)

Grep for `whitelabelmd` (case-insensitive) across the tree hits exactly **3 files**:
- `.env.example:69`
- `docs/juvenex-api-integration.md:7`
- `src/lib/juvenex/client.ts:24`

**`src/lib/juvenex/client.ts` is the single and only place that makes an outbound HTTP call to the vendor.** Everything else goes through it. That is a genuinely good boundary.

### Every file that reaches the vendor API

**The wrapper**
- `src/lib/juvenex/client.ts` — the only `fetch()` to `panel.whitelabelmd.com`
- `src/lib/juvenex/schemas.ts` — zod contracts for every endpoint
- `src/lib/juvenex/public-fields.ts` — output allow-list
- `src/lib/juvenex/route-utils.ts` — auth/rate-limit/body-parse helpers

**Server-side callers (RSC)**
- `src/lib/jx/server.ts` — `getProducts` (cached 5 min), `getProductDetails`
- `src/lib/jx/catalog.ts` — pure normalization of vendor rows (no I/O)

**API routes — Stage 1**
- `src/app/api/juvenex/products/route.ts` → `Get_Products`
- `src/app/api/juvenex/products/[id]/route.ts` → `Get_Product_Details`
- `src/app/api/juvenex/coupons/route.ts` → `Check_Coupons`
- `src/app/api/juvenex/member/route.ts` → `Member_View`
- `src/app/api/juvenex/orders/route.ts` → **`Create_Order`** ← the money path
- `src/app/api/juvenex/orders/offline/route.ts` → `Create_Order_Offline`
- `src/app/api/juvenex/orders/custom-price-offline/route.ts` → `Create_Order_Custom_Price_Offline` (super_admin only)

**API routes — post-order portal (Stage 1f / bleeds into Stage 3)**
- `src/app/api/juvenex/portal/_utils.ts` — ownership checks
- `.../get-order`, `list-orders`, `list-orders-updated-since`, `get-order-history`, `get-order-by-payment-token`, `get-customer`, `customer-view`, `get-enrollment`, `cancel-enrollment`, `update-order`, `update-shipping-address` (11 routes)
- `.../patient-message`, `.../send-patient-message` — **Stage 3 territory, already built**

**Browser-side helper** (calls *our* API, never the vendor): `src/lib/api/juvenex-portal.ts`

### The primary client wrapper, in full

`src/lib/juvenex/client.ts` (325 lines) — printed in full above during recon. Structure:

- `import 'server-only'` at line 1 — compile-time guarantee the API key can never reach a client bundle.
- Base URL `https://panel.whitelabelmd.com/juvenex/api/v1`, overridable by `JUVENEX_API_BASE_URL`, trailing slashes stripped.
- Auth via `api-key` header; 15 s `AbortController` timeout; `cache: 'no-store'`.
- Two transports: `request()` (JSON) and `requestForm()` (multipart, for `send-patient-message` attachments).
- Every response is envelope-validated: must parse as JSON, must be HTTP-OK, must carry a numeric `status`. Anything else → `JuvenexApiError(502)`; timeout → 504; unconfigured key → 503.
- Typed interfaces for all 8 response shapes; 20 public methods mapping 1:1 onto vendor endpoints.
- Exports a module-level singleton `juvenexClient`.

Notable vendor quirks captured in the code: `Create_Order` takes **one** `product_id` with **no quantity field**; upstream status codes `1` (ok) / `5` (declined) / `0` (invalid) are returned **inside HTTP 200**.

---

## 5. Stage 1 user journey

> **Structural finding first:** there are **two complete, parallel storefronts** in this tree.
> - **Legacy:** `/shop` + `/checkout` → PrescribeRx catalog + Kurv payments, membership-gated, writes to a local `orders` table.
> - **Current (jx):** `/` + `/store/**` → **WhiteLabelMD**, auth-gated only, no local order table.
>
> The vendor named in the brief is WhiteLabelMD, so **the `(jx)` tree is Stage 1**. I assess it as such and note legacy overlap where it matters. `sitemap.ts` still advertises `/shop`, not `/store`.

### a. Signup / login — **REAL**

| | |
|---|---|
| Pages | `src/app/register/page.tsx`, `src/app/login/page.tsx`, `src/app/reset-password/page.tsx` |
| Routes | `src/app/api/auth/{register,login,callback,profile,account,forgot-password}/route.ts` |
| Provider | **Supabase Auth** — `supabase.auth.signInWithPassword` (login), `supabase.auth.admin.createUser` (register, service-role) |
| User records | Supabase `auth.users` + a `profiles` row (`id, email, name, phone, avatar_url, role, organization_id, banned_at`) |
| Session | Custom HS256 JWT `{userId}`, 7-day expiry, signed with `JWT_SECRET`; **stored in `localStorage`** |
| Server verification | `getAuthUser()` (`src/lib/supabase/server.ts`) — verifies JWT, re-reads the profile **on every request**, zod-validates the row (fail-closed), **hard-blocks `banned_at`** |

**It genuinely authenticates.** Quality is above average: login rate-limits 5/min/IP, audit-logs with a SHA-256 email hash rather than the address, fails closed on a profile-fetch error, and invalidates the just-issued Supabase session when it rejects a banned account.

Checkout links to `/login?next=/store/checkout` and `/register?next=/store/checkout` — the return path is wired.

### b. Product catalog — **REAL, live, not hardcoded**

- **Fetch:** `src/lib/jx/server.ts:28` — `loadRawProducts` wraps `juvenexClient.getProducts()` in `unstable_cache`, **300 s TTL**, tag `juvenex-catalog`, shared across all requests/routes.
- **Failure mode:** never throws. Logs and returns `{rows: [], error}`; `/store` renders an honest "The catalogue is not loading" card with a retry link rather than a blank grid or a 500.
- **Normalization:** `src/lib/jx/catalog.ts` (435 lines, pure) — the vendor returns flat rows where all structure is buried in free-text `product_name` (`"Compounded Tirzepatide (7.5 mg/week) - 6 month supply"`, `"3-mo, MAINT, Semaglutide injection 2.5mg/ml…"`). It parses out molecule, weekly dose, dose schedule, supply months, and product kind (`standard`/`maintenance`/`titration`/`starter`), computes `pricePerMonth`, and builds a `variantKey` for de-duping.
- **Rendering:** `src/app/(jx)/store/page.tsx` is a **pure Server Component**. Filters/search/sort live entirely in the URL and every control is a `<Link>` — no client state, correct back-button, shareable filtered views. Faceting via `src/components/jx/store/query.ts`.
- **Public API:** `GET /api/juvenex/products` — unauthenticated (correct for a catalog), 60/min/IP, output passed through `publicProductEnvelope`.
- **Not hardcoded.** `src/lib/jx/fixtures/products.json` is a **test fixture only** (60 real rows, consumed solely by `catalog.test.mts`).

### c. Product detail page — **EXISTS, and it's good**

`src/app/(jx)/store/[id]/page.tsx` (330 lines). Merges the list row with `Get_Product_Details` (the only source of `product_description` and payment brands), `react.cache` collapses the metadata + page fetches into one upstream call. Supply switcher, dose ladder, per-month savings vs monthly, related products derived from the catalog when the vendor sends none (it never does). Correctly distinguishes "product doesn't exist" (`notFound()`) from "catalog is down" (error card, because a 404 would be a lie).

One self-documented defect at `[id]/page.tsx:39` — the app-wide `src/app/loading.tsx` opens a Suspense boundary above every route, so the 200 is flushed before `notFound()` can set a 404. Mitigated with `robots: noindex`; **the root cause (app-wide soft-404) is unfixed.**

### d. Cart — **REAL, client-only**

`src/components/jx/JxStore.tsx` + `src/app/(jx)/store/cart/page.tsx`.

- **State location: browser `localStorage`**, key `jx.bag.v1`. Not server, not DB.
- Read through `useSyncExternalStore` with a raw-string-keyed parse cache → referentially stable snapshots, mismatch-free hydration (server always renders empty), cross-tab sync via the `storage` event.
- **add / remove / clear only — deliberately no quantity control.** Documented at `JxStore.tsx:8` and `AddToBag.tsx:11`: upstream `Create_Order` has no quantity field, so a stepper would promise what the pharmacy API cannot deliver. Bag holds ≤1 unit per product, capped at `MAX_LINES = 20`.
- Hostile/corrupt storage is filtered per-line on parse; all storage access is try/catch'd for private mode.
- **Persistence: per-browser only.** No cart sync across devices, and it's lost on storage clear.

### e. Checkout — **REAL and wired to `Create_Order`**

| | |
|---|---|
| Route | `src/app/(jx)/store/checkout/page.tsx` → `src/components/jx/checkout/CheckoutForm.tsx` (~700 lines) |
| Gates | not hydrated → skeleton; empty bag → CTA; **not authenticated → sign-in prompt**. No membership gate (unlike legacy `/shop`) |
| Payment step | **Raw PAN + CVV collected in our own form fields** and POSTed to our own API |
| Variant wired | **`Create_Order`** (card), via `POST /api/juvenex/orders` |
| Card source | Typed by the user into `CheckoutForm` inputs. **No tokenization, no iframe, no hosted field.** Luhn-checked client-side (`card-utils.ts`), then sent as `card_no`/`ex_month`/`ex_year`/`cvv_no`/`card_holder_name` |
| Coupons | `CouponControl.tsx` → `POST /api/juvenex/coupons` → `Check_Coupons`, validated **per product_id** |

**Multi-line orchestration (`CheckoutForm.tsx:226–335`)** is the most carefully built thing in the codebase. Because `Create_Order` is one-product-per-call, an N-line bag becomes N separate charges, submitted **strictly sequentially** (never `Promise.all`). Successful lines are removed from the bag *immediately, before navigation*, so a crash can't double-charge. HTTP 401/403/429 are treated as fatal and remaining lines are marked `skipped` rather than attempted. A `submittingRef` guards double-submit ahead of React's re-render. Retry only ever re-attempts what's left. The cart page warns the user up front that N items = N separate charges.

Validation shares one source of truth: `validateFields` literally runs the same `cardOrderSchema` the API route enforces, so client and server rules cannot drift.

**Server side** (`src/app/api/juvenex/orders/route.ts`, 21 lines): `requireUser()` → zod parse → **`parsed.data.email` must equal the signed-in user's email (403)** → forward. Price is never accepted from the client — only `product_id` — so **there is no price-tampering surface.**

### f. Post-order — **PARTIAL**

- **Confirmation page:** `src/app/(jx)/store/checkout/success/page.tsx` — real. Reads from `sessionStorage` (deliberately not the URL, so a shared link can't fabricate a confirmation), with a sane fallback for a direct visit.
- **Order persistence:** **none locally.** The jx path writes **nothing** to the local `orders` table (that table is used only by the legacy Kurv/PrescribeRx flows). Orders exist solely at WhiteLabelMD; order history is re-fetched live via `list-orders`.
- **Order history:** `src/app/(jx)/store/account/orders/` + `OrdersList.tsx` / `OrderDetail.tsx` — built, backed by the 11 portal routes. **Not in the prod build**, only staging.
- **Confirmation email: MISSING.** No send on order placement anywhere in the jx path. `SENDGRID_API_KEY` is referenced only in `src/lib/config.ts`. The success page tells the user to "look for a confirmation email" that this app never sends — the vendor may or may not send one; nothing in this codebase does.
- **Redirect:** `router.push('/store/checkout/success')`, only when every line succeeded.

---

## 6. Environment

`.env.example` exists (103 lines, well-annotated). **65 distinct `process.env` reads** in `src/`.

**Stage 1 relevant:**
| Var | Purpose |
|---|---|
| `JUVENEX_API_BASE_URL` | vendor base URL |
| `JUVENEX_API_KEY` | **vendor secret — server-only** |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | server admin client |
| `JWT_SECRET` | session signing (module-load assert in `jwt.ts:5`) |
| `NEXT_PUBLIC_APP_URL` | gates HSTS + `upgrade-insecure-requests` |
| `DEFAULT_ORGANIZATION_ID`, `NODE_ENV` | registration/tenant |

**Client-exposed vendor secrets: NONE.** The 15 `NEXT_PUBLIC_*` vars are Supabase URL/anon key, app URL, feature flags, Stripe *publishable* key, Tapfiliate/Metricool ids, support email, and an unused Clerk publishable key. `JUVENEX_API_KEY` is correctly server-only and additionally protected by `import 'server-only'`. `.env.example:68` even carries the warning "never prefix the key with NEXT_PUBLIC_".

**`.env.local` is correctly gitignored and untracked.** It has real values for `JUVENEX_API_KEY`, `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and `PAYMENT_PROVIDER=kurv`.

Undeclared-in-`.env.example` but read by code: `KURV_API_KEY`, `KURV_API_BASE`, `PRESCRIBERX_*`, `TWILIO_*`, `REVENUECAT_*`, `CRON_SECRET`, `TAPFILIATE_API_KEY`, `DAILY_CO_*`, `AUTH_PROVIDER`, `DB_PROVIDER`, `MEMBERSHIP_FREE_PROMO_CODES`. Documentation drift, not a leak.

---

## 7. Bugs / security in the Stage 1 path

### 🔴 CRITICAL — raw PAN + CVV transit our server; this is a PCI scope decision, not a bug
`src/components/jx/checkout/CheckoutForm.tsx` → `src/app/api/juvenex/orders/route.ts` → `src/lib/juvenex/client.ts`

Full card number and CVV are typed into our own inputs, JSON-POSTed to our Next.js route, and relayed to the vendor. There is no tokenization, no hosted field, no iframe. This is exactly what `Create_Order`'s contract requires — but it drags this application, this box, and pm2's memory into **PCI DSS SAQ D** scope instead of SAQ A.

To the code's credit: the card never touches a database, is never logged (verified — no request-body logging in the path, `upstreamError` logs nothing), and `Content-Security-Policy: form-action` is constrained. But intent doesn't change scope. Ask WhiteLabelMD whether a hosted/tokenized alternative exists (`Create_Order_Offline` takes a `payment_token`, which hints one might). **This needs an explicit, documented business decision before launch.**

### 🔴 CRITICAL — the entire Stage 1 storefront is untracked in git
```
?? src/app/(jx)/
?? src/lib/juvenex/*        ?? src/lib/jx/*
?? src/components/jx/*      ?? src/app/api/juvenex/*
?? docs/juvenex-api-integration.md
```
Every file I assessed in §5 — client wrapper, schemas, cart, checkout, all 20 API routes — is **untracked**. Working tree: 94 modified, 70 untracked, 1 deleted. The whole WhiteLabelMD integration exists **only on this box's disk**. No history, no diff, no rollback, no review. A careless `git clean -fd` deletes Stage 1.

### 🟠 HIGH — auth token in `localStorage`
`src/lib/auth-context.tsx:28`, `src/lib/api/juvenex-portal.ts:31`, `CheckoutForm.tsx:235`

The 7-day JWT lives in `localStorage`, readable by any JavaScript on the origin. Not an `httpOnly` cookie. Compounded by `script-src 'unsafe-inline'` (below): a single XSS yields a 7-day session token with no revocation path — `verifyToken` checks only the signature and expiry. The ban check on every request is a real partial mitigation, but it doesn't cover token theft.

This also makes server-side route protection impossible — the token isn't in the request until client JS attaches it, so `/store/checkout` gating is client-side only (see below).

### 🟠 HIGH — `script-src 'unsafe-inline'` on the page that collects card data
`src/proxy.ts:42`

```
script-src 'self' 'unsafe-inline' https://prescribe-rx.com https://*.leadconnectorhq.com https://*.tapfiliate.com https://tracker.metricool.com
```
`'unsafe-inline'` defeats the primary XSS defense on a live card-entry form. The code documents the reason (nonce+strict-dynamic needs full dynamic rendering) and it's an honest constraint — but on a PCI SAQ D card form it is the single highest-leverage hardening left. Four third-party script origins are also trusted on that same page.

### 🟡 MEDIUM — checkout auth gate is client-side only
`CheckoutForm.tsx:373` renders a sign-in prompt when `!isAuthenticated`. That's presentation. The real gate is server-side at `POST /api/juvenex/orders` (`requireUser` + the email-match 403), which **is** correct and sufficient to prevent unauthorized orders. But the page itself is publicly renderable, so this is a UX gate, not a security boundary. Worth stating plainly so no one later mistakes it for one.

### 🟡 MEDIUM — rate limiting is in-process and resets on restart
`src/lib/rate-limit.ts:20` — a `Map` in Node memory. Documented as intentional. Today there's one pm2 instance per build so it holds, but every `pm2 restart` (i.e. every deploy) zeroes the login limiter, the coupon-enumeration limiter, and the order limiter. It won't survive clustering or a second instance.

### 🟡 MEDIUM — `Member_View` is unauthenticated and takes an arbitrary email
`src/app/api/juvenex/member/route.ts` — no `requireUser`. Anyone can POST `{email, product_id}` and read back `{data: 0|1, m_price}`, i.e. **query whether an arbitrary email is a member and at what price**. Only 20/min/IP stands in the way. `Check_Coupons` is likewise unauthenticated but is defensibly so and has a smart second limiter keyed on the code itself (`coupons/route.ts:17`) to stop distributed code enumeration.

### 🟡 MEDIUM — internal client-comms served publicly
`public/updates/braeden.html`, `public/updates/check4.html`, 2 PNGs — no-auth, no-robots-block, indexable. Contains operational narrative including a reference to using shared PrescribeRx admin access, product-curation detail, and vendor architecture notes. Not credentials, but it should not be on the public origin.

### 🟢 LOW
- **`dist.key`** — a TLS private key (mode 0600) in the project root. Untracked and outside `public/`, so not served, but it does not belong in a repo directory.
- **21 MB `.netlify/...zip` tracked in git** — I scanned `run-config.json` and `required-server-files.json`; **`config.env` is empty, no secrets**. Pure bloat plus a stale copy of Apr-14 server code.
- **`start_url` accepts any URL** (`schemas.ts:40`) — client-supplied `window.location.origin`, forwarded to the vendor. Low impact, but it's unvalidated attacker-controllable data in a vendor payload.
- **`sitemap.ts` advertises `/shop`** (legacy PrescribeRx storefront), never `/store`. The Stage 1 storefront is invisible to search engines.
- **Soft-404 app-wide** — `src/app/loading.tsx` flushes a 200 before any route can `notFound()`. Documented at `[id]/page.tsx:39`, papered over with `noindex`.

### Verified NOT vulnerable (checked explicitly)
- ✅ No vendor API key in any client bundle (`server-only` + no `NEXT_PUBLIC_` prefix)
- ✅ No price accepted from the client — `Create_Order` takes `product_id` only
- ✅ Order email forced to match the session (403), so no ordering on someone else's account
- ✅ Order/customer ownership enforced on every portal read (`portal/_utils.ts`)
- ✅ Vendor commercial fields (`cost_of_goods_sold`, rebill config, `form_id`) stripped by a **fail-closed allow-list** before any unauthenticated response
- ✅ `custom-price-offline` correctly gated to `super_admin`
- ✅ No card data logged anywhere in the path
- ✅ `clientIp()` correctly takes the **rightmost** XFF hop (`route-utils.ts:19`) — no free rate-limit reset
- ✅ Every vendor input zod-validated server-side; `.env.local` untracked

---

## 8. Stubs / TODOs / dead code in the Stage 1 path

I grepped `TODO|FIXME|XXX|HACK|not implemented|stub|placeholder|coming soon` across `src/app/(jx)`, `src/components/jx`, `src/lib/jx`, `src/lib/juvenex`, `src/app/api/juvenex`.

**Zero results.** The only hits were HTML `placeholder=` attributes and one CSS-token doc comment. There are no stubs, no TODOs, and no dead code inside the jx Stage 1 path. It is unusually clean, densely commented, and the comments explain *why* rather than *what*.

The dead code is all **around** it:
- **The entire legacy storefront** — `src/app/shop/**`, `src/app/checkout/**`, `src/app/api/shop/**`, `src/lib/prescriberx*.ts` (5 files), `src/lib/products.ts`, `src/lib/checkout-catalog.ts`, `src/lib/marketplace-access.ts`, `src/lib/shop-quiz.ts`. Still routed, still linked (22 `/shop` refs vs 26 `/store` refs), still in the sitemap. Two storefronts, one vendor.
- Root junk from §2 — 5 `.next.backup-*` dirs, 3 extra build dirs, `.vercel/output/`, the Netlify zip, `bug5-discovery-report.md`, the stray JPG, `dist.key`/`dist.csr`.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — read but Clerk isn't a dependency.
- Stage 2/3 code already present (noted, not assessed): `src/app/intake/`, `src/app/telehealth/`, `src/app/consult/`, `src/app/api/intake-proxy/`, `src/lib/intakeSchema.ts` (Stage 2); `src/app/messages/`, `src/app/api/messages/`, `src/components/jx/account/OrderDetail.tsx` care-team messaging, `patient-message`/`send-patient-message` routes (Stage 3).

---

## Stage 1 completeness assessment

### ✅ Built (real, working, good quality)
- Signup / login / password reset — Supabase Auth + JWT, ban enforcement, rate limiting, audit logging
- Vendor client wrapper — single choke point, timeouts, envelope validation, typed, `server-only`
- Catalog fetch + 5-min cache + free-text normalization into a merchandisable model
- `/store` browse — server-rendered, URL-driven facets/search/sort, honest failure state
- `/store/[id]` product detail — supply switcher, dose ladder, per-month pricing, related products
- Cart — localStorage, cross-tab, hydration-safe, hostile-input-hardened
- `/store/checkout` — full form, shared client/server zod validation, Luhn, per-line coupons
- **`Create_Order` money path** — sequential, idempotent-on-retry, per-line attribution, no double-charge
- Order confirmation page
- Order history + detail (`/store/account/orders`) — **staging only, not in prod**
- Security posture on the vendor boundary: output allow-list, email-match enforcement, ownership checks, no price trust

### 🟨 Stubbed / partial
- **Order history is live-fetched from the vendor on every view** — no local mirror, so no resilience if the vendor is down, no analytics, no admin visibility into jx orders
- **Checkout auth gate is presentation-only** (the real gate is correctly server-side, but the page is publicly renderable)
- **Soft-404s app-wide** — papered over with `noindex`
- **`Member_View` unauthenticated** — membership/pricing oracle

### ❌ Missing
- **Order confirmation email** — nothing sends one; the success page promises one
- **Local order persistence** — nothing in the jx path writes to the DB
- **`/store` in the sitemap** — `sitemap.ts` still points at the legacy `/shop`
- **Git history for the entire feature**
- **A decision on which storefront lives** — `/shop` and `/store` both ship, both linked
- **Cart persistence across devices**
- **Card tokenization** (may be a vendor limitation — needs confirming, not assuming)

### 💥 Broken / actively risky
- **Prod (`.next`, 10 Aug) is ~1 week behind staging (17 Aug)** — different route sets, different checkout code. Whatever you QA on staging is not what's live on :3002.
- **`.netlify/netlify.toml` publishes to a path that does not exist** — actively misleading to anyone who reads it as the deploy config.
- **Every Stage 1 file is untracked** — one `git clean` from total loss.

---

### Blockers, in the order they must be cleared

1. **Commit the work.** `git add` the `(jx)` tree, `src/lib/juvenex`, `src/lib/jx`, `src/components/jx`, `src/app/api/juvenex`, and `docs/juvenex-api-integration.md`. Nothing else on this list is safe to attempt until Stage 1 has a history. Untracked-and-unbacked is the single largest risk here, ahead of anything security-related.
2. **Get a PCI decision in writing.** Ask WhiteLabelMD whether a tokenized or hosted card flow exists (`Create_Order_Offline`'s `payment_token` suggests it might). If yes, switch — it drops you from SAQ D to SAQ A and moots blocker 3. If no, document the accepted scope and the compensating controls before you take a live card.
3. **Harden the card page.** Move the session token to an `httpOnly` cookie and remove `'unsafe-inline'` from `script-src` on `/store/**`. These are two halves of one problem: today an XSS on the checkout page yields a 7-day session. Do these together.
4. **Reconcile prod with staging.** Decide what is meant to be live, build once, `pm2 restart`, verify `BUILD_ID`. Two divergent builds off one working tree will keep producing "works on staging" bug reports.
5. **Send an order confirmation email.** The success page already promises one. Either wire SendGrid on the `status === 1` path or confirm the vendor sends it and correct the copy.
6. **Persist orders locally** (id, user, product, price, vendor order_id, timestamp) at the moment `Create_Order` returns `status: 1`. Without it you have no record of a charge you initiated, no support tooling, and no reconciliation if the vendor's API is unreachable.
7. **Pick one storefront.** Route `/shop` → `/store` (or delete the legacy tree), fix `sitemap.ts`, and clean up the 22 stale `/shop` links.
8. **Close the smaller security gaps.** Auth `Member_View`; remove `public/updates/*`; move `dist.key` off the box; drop the 21 MB Netlify zip and the stale `.netlify`/`.vercel` configs.
9. **Fix the app-wide soft-404** by scoping `src/app/loading.tsx` below the route boundary, so `notFound()` can actually return 404.
10. **Housekeeping** — prune the 8 stray build directories and root junk.

### Honest percentage-complete

**Stage 1 functional path: ~85%.** Signup → browse → PDP → cart → checkout → `Create_Order` → confirmation is genuinely end-to-end, and the parts that exist are better-engineered than most production e-commerce code I've read — the multi-line charge orchestration, the fail-closed field allow-list, and the shared client/server validation schema are all things teams usually get wrong. Nothing in the happy path is faked.

**Stage 1 shippable: ~60%.** The gap is not features, it's the surrounding conditions: an unversioned codebase, an undecided PCI posture, a production build that isn't the code you're testing, and a confirmation email the UI already promises. Items 5 and 6 are maybe two days of work. Items 1 and 4 are hours. Item 2 is a vendor conversation you should open today, because if the answer is "yes, we have tokenization," it changes the checkout implementation and you'd rather learn that before hardening the version you'd throw away.
