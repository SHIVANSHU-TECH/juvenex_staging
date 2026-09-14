# Juvenex (`glp-companion`)

Next.js (App Router) application for Juvenex — a GLP-1 / peptide telehealth and
storefront product. This README is an orientation map, not a tutorial: it says
what is real, what is scaffolding, and where the authoritative docs are.

## Start here

| Doc | What it covers |
|---|---|
| **`docs/README.md`** | **Index of everything below, with a suggested reading order** |
| `docs/ARCHITECTURE.md` | Request lifecycle, auth, tenancy, the vendor boundary, the four payment paths |
| `docs/API_REFERENCE.md` | All 130 API routes: methods, auth, rate limits, gotchas |
| `docs/DATA_MODEL.md` | Tables by domain, PHI columns, the RLS bypass, migration conventions |
| `docs/OPERATIONS.md` | Deploy, rollback, migrations, cron, configuration, incident table |
| `docs/STAGE1_RECON_2026-08-22.md` | Full recon of the codebase as of Aug 2026 |
| `docs/STAGE1_DECISIONS.md` | Blockers closed *without* a code fix, and the reasoning — read before re-litigating anything |
| `docs/STRIPE_CHECKOUT.md` | Tokenized store checkout — design, landmines, go-live checklist |
| `docs/juvenex-api-integration.md` | The WhiteLabelMD (vendor) integration |
| `AGENTS.md` | **This is not the Next.js you know** — check `node_modules/next/dist/docs/` before writing code |

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values; see docs/juvenex-api-integration.md
npm run dev                  # http://localhost:3000
npm run build                # production build (next build --webpack)
npm test                     # node --test src, plus every *.test.mts via tsx --test
```

Every key in `.env.example` is a placeholder. Nothing in this repo is a live
credential — request real values separately, and never commit them. Code that
consumes a key treats the two placeholder shapes (`your_…` and `…placeholder…`)
as *unconfigured* rather than as a value, so a copied example file cannot be
mistaken for a working configuration.

**On the production box, never run a bare `next dev` or `next build`.** Both
write to `.next/`, which is what the live process is serving, and a partial
write there produces chunk 500s on every route. Use a separate dist dir:

```bash
NEXT_DIST_DIR=.next-dev npx next dev
```

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.x App Router, React 19.2 |
| Language | TypeScript 5, strict |
| Styling | Tailwind v4 + CSS Modules + `src/styles/jx.css` |
| Auth | Supabase Auth → own HS256 JWT (7 d) in `localStorage`, sent as `Authorization: Bearer` |
| Data | Supabase (`@supabase/supabase-js`, service-role client server-side) |
| Validation | zod 4 — schemas shared between client and server |
| Middleware | `src/proxy.ts` (Next 16 naming) — CSP and tenant resolution |
| Storefront vendor | WhiteLabelMD, via the single wrapper `src/lib/juvenex/client.ts` |
| Payments | Stripe (store checkout), Kurv (memberships), RevenueCat (native IAP) |
| Email | Resend |

There is **no client state library**. The cart is `useSyncExternalStore` over
`localStorage` (`src/components/jx/JxStore.tsx`); everything else is server
state rendered by Server Components.

## Layout

```
src/app/(jx)/          Current storefront + account portal ("jx" skin) — / and /store/**
src/app/shop/          Legacy PrescribeRx storefront — redirects to /store
src/app/checkout/      Legacy Kurv membership checkout
src/app/api/juvenex/   Server routes that proxy the vendor API
src/lib/juvenex/       Vendor client (client.ts), zod schemas, Stripe, route helpers
src/lib/jx/            Catalogue fetching + normalization for the storefront
src/components/jx/     Storefront and account UI
supabase/migrations/   51 SQL migrations, already applied to production
docs/                  Architecture, recon, and decision records
```

`src/lib/juvenex/client.ts` is the single point of contact with the vendor API.
It is `server-only`: the API key never reaches the browser, and no application
endpoint returns it. Add vendor calls as methods there rather than fetching the
vendor directly from a route.

## Deploying

The production box *is* the deploy target. Netlify and Vercel config still exist
in the tree and both are dead — the real deploy is a build plus a pm2 restart:

| Process | Port | Dist dir |
|---|---|---|
| `juvenex-web` | 3002 | `.next` |
| `juvenex-staging` | 3005 (localhost) | `.next-staging` |

A fresh build is **not** served until `pm2 restart` — verify `pm_uptime` is
newer than the `.next/BUILD_ID` mtime. Restarting production and touching the
production database both need explicit sign-off from the maintainer.

Primary domain is `juvenex.space` (DNS straight to the box). `juvenex.app` stays
alive behind Cloudflare and is still the DKIM-verified sending domain, which is
why transactional mail goes out as `orders@juvenex.app`. Both are accepted
everywhere in code rather than swapped.

## Things that will surprise you

- **Auth is a localStorage JWT**, sent as `Authorization: Bearer …` and verified
  server-side by `getAuthUser()`. There is no cookie session, so server-side
  route gating behaves differently than you may expect.
- **`NEXT_PUBLIC_*` values are inlined at build time.** Changing one requires a
  rebuild, not just a restart — and a secret must never carry that prefix.
- **Not every route group is live.** `src/app/(jx)/**` is the current storefront;
  older top-level routes (`/checkout`, `/consult`, `/shop` redirects) are legacy
  or partially superseded. Check git history before assuming a path is dead.
- **Vendor responses use a numeric `status` envelope**, where `status: 1` means
  success and `status: 0` carries a business error — inside an HTTP 200. Check
  `status`, not just the HTTP code.
- **`Create_Order` takes one product with no quantity field.** A bag of N items
  is N vendor calls, which is why the store checkout authorizes once and
  captures only after all N succeed (`docs/STRIPE_CHECKOUT.md`).
- Some features are scaffolded behind flags and are intentionally inert until
  the vendor ships the matching endpoint. The Stripe checkout is one of them: it
  is merged but answers 503 `payment_not_configured` until real keys are set.

# juvenex_staging
