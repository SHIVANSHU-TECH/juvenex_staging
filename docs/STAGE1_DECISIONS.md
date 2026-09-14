# Stage 1 — Decisions

Running log of Stage 1 blockers that were closed *without* a code fix, and why.
Each entry records the reasoning at the time so a future reader does not
re-litigate a settled call — and knows what would make it worth reopening.

Companion to `docs/STAGE1_RECON_2026-08-22.md`.

## Blocker #3 — store checkout (fixed in code, held on credentials)

Date: 2026-09-01
Status: Rebuilt and merged, shipped disabled. Waiting on the Stripe account.

The card-forwarding checkout was replaced with Stripe tokenized payment: the
PaymentElement collects the card, one manual-capture PaymentIntent covers the
whole bag, and the intent id goes to WhiteLabelMD as `payment_token`. Raw card
data no longer reaches our servers.

It is in the tree but inert. `getStripeClient()` returns null on a missing or
placeholder key and both routes answer 503 `payment_not_configured`, so an
unconfigured box is a clear message rather than a stack trace. Nothing is
charged until Braeden provides the keys.

Design, the four invariants, the open landmines (undocumented `discount_amount`
format, 100%-comp codes below the Stripe 50-cent minimum, orphaned vendor
orders on partial failure) and the go-live checklist are in
`docs/STRIPE_CHECKOUT.md`.

Reopen if: the vendor changes the token contract, or the 100%-comp path is
needed on the store before a non-Stripe route for it exists.

## Blocker #9 — soft-404 (closed as intended behavior)

Date: 2026-08-23
Status: Closed, not fixed. Documented as intended Next.js framework behavior.

Affected: `/store/[id]`, `/blog/[slug]`, `/org/[slug]` — three dynamic routes
that call `notFound()` after an async fetch. When any Suspense boundary flushes
(a `loading.tsx`, or an async Server Component suspending) before `notFound()`
runs, the response headers are already sent and Next.js cannot update the
status code. This is documented in the Next.js source
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`,
§Status Codes), not a defect in this codebase.

Note the original recon described this as an app-wide soft-404. It is not:
unmatched routes (e.g. `/definitely-not-a-real-route`) return a correct 404,
verified against the live build. Only the three dynamic routes above are
affected, because only they reach `notFound()` after streaming has begun.

Impact: soft-404 — HTTP 200 carrying a `<meta name="robots" content="noindex">`
tag. Per the same Next.js doc, this does not lead to indexation, because the
page is explicitly marked `noindex`. No revenue, user, compliance, or SEO
impact.

Why not fixed:

  - Cannot simply scope `loading.tsx` below the route boundary — the store has
    its own boundaries. `/store/[id]` sits under BOTH
    `src/app/(jx)/store/[id]/loading.tsx` and `src/app/(jx)/store/loading.tsx`,
    so removing the root `src/app/loading.tsx` changes nothing for it.
  - Deleting all three `loading.tsx` files would kill the loading skeletons
    that cover 500-800ms WhiteLabelMD catalogue calls — a real UX regression
    traded for a status code no user sees.
  - Even with every `loading.tsx` removed, the framework still begins streaming
    when an async Server Component suspends under a Suspense boundary, so the
    fix is not reliable.
  - The documented fix — an existence check in `src/proxy.ts` before the body
    streams — requires either hitting the WhiteLabelMD catalogue on every
    dynamic-route request (the same doc warns to keep proxy checks fast and
    avoid fetching full content there), or maintaining a cached product-id set
    with its own invalidation logic.
  - The only real driver would be analytics accuracy — soft-404s counting as
    successful traffic. Not material at current volume.

Reopen if: analytics dashboards start showing soft-404 traffic at a volume that
misleads decision-making, or a compliance requirement mandates true 404 status
codes. If reopened, start with `/blog/[slug]` and `/org/[slug]` — both resolve
against local Supabase, so a proxy existence check is cheap — and treat
`/store/[id]` separately, since it depends on the partner catalogue.

## Blocker #8 — security cleanup (deferred to post-Stage-1 pass)

Date: 2026-08-23
Status: Deferred. All items will be handled in a single security cleanup after
Stage 1 ships.

Items pending:

  1. `.vercel/.env.production.local` — world-readable file (0644) containing
     live `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`,
     `XAI_API_KEY`. Largely a duplicate of `.env.local` (its Stripe and
     Anthropic entries are `your_…` placeholders, not real keys). Delete, then
     decide on rotation based on shell/backup access history since April 20.
     Gitignored (`.gitignore:42`) and never committed, so this is on-disk
     exposure only.
  2. `public/updates/` — 4 files including `braeden.html`, which names a real
     person's prescription products on a public URL. Currently served 200 with
     no auth and not disallowed in `robots.txt`, so it is crawlable. Move to
     `docs/correspondence/`. Partially mitigated 2026-09-01: the directory is
     now gitignored (`.gitignore:81`) so it cannot reach the remote, but it is
     still on disk and still served — the move is still owed.
  3. `Member_View` route (`src/app/api/juvenex/member/route.ts`) — zero callers
     anywhere in `src/`, unauthenticated member/pricing enumeration oracle
     (arbitrary email in, `{data: 0|1, m_price}` out; IP rate limit only).
     Delete rather than gate — there is no caller to preserve.
  4. `dist.key` / `dist.csr` — TLS private key + CSR
     (`CN = Juvenex Distribution, O = Stackably LTD`, RSA 2048) in the project
     dir. Untracked, never committed, gitignored, mode 600, and not reachable
     over HTTP. Lowest risk of the five. Move to `/root/.secrets-backup/`.
  6. **`scripts/apply-migration-008.sh` carried a live Supabase Postgres
     password in a usage comment** (found 2026-09-01). Removed from the working
     tree, but it has been committed since `beba887` and that history is pushed
     to GitHub, so the value must be treated as compromised. **Rotating the
     database password in the Supabase dashboard is the only real fix** —
     scrubbing HEAD does not remove it from history, and rewriting a pushed
     branch is a separate decision. Ranks above items 1-5: unlike those, this
     one is exposed publicly rather than only on this box.

  5. `.netlify/` — 85MB dead deploy target, 1511 tracked files. Every tracked
     file was scanned for credential-value shapes (JWT / `sk_live` / `sk_test`
     / `whsec_` / `sk-ant-`): no secret values are committed, they are build
     artifacts only. Delete after `git rm -r --cached`.

Braeden decision needed before rotation: who has had shell or backup access to
167.86.81.185 since April 20?

  - If only Ali + Braeden → deleting the file alone is likely sufficient.
  - If contractors/others → rotate `SUPABASE_SERVICE_ROLE_KEY` (Supabase
    dashboard) and `JWT_SECRET` (forces all users to re-login).
    `ENCRYPTION_KEY` cannot be rotated without re-encrypting the PHI columns
    (`orders.intake_answers_enc`, `shipping_address_enc`, `billing_address_enc`
    — see migration 025) — real work if compromised.

Context: `docs/STAGE1_RECON_2026-08-22.md` item #8 lists the original four
items. The detailed findings above come from the 2026-08-23 recon and differ
from that document in two ways worth knowing: item #8.4 was originally recorded
as "delete 21 MB Netlify zip + stale configs" (a size/tidiness issue), but the
actual exposure is the live-secret file in `.vercel/`; and there is no zip —
the weight is the 80MB `.netlify/` directory. Implementation prompt drafted,
ready to execute post-ship.
