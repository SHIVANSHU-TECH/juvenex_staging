# Documentation

Start here. The docs below are grouped by what you are trying to do; within each
group they are ordered so you can read straight down.

## If you are new to this codebase

1. **`../AGENTS.md`** — one rule, and it matters: this Next.js version has
   breaking changes from what you remember. Read the relevant guide in
   `node_modules/next/dist/docs/` before writing against a framework API.
2. **`ARCHITECTURE.md`** — how a request is handled, where the trust boundaries
   are, and which of the several parallel systems in this tree is the live one.
3. **`STAGE1_RECON_2026-08-22.md`** — a file-by-file recon of the whole tree as
   of Aug 2026. Long, and the fastest way to find out whether something is real.
4. **`API_REFERENCE.md`** and **`DATA_MODEL.md`** — the two reference docs.

## Reference

| Doc | Covers |
|---|---|
| `ARCHITECTURE.md` | Request lifecycle, auth, tenancy, vendor boundary, the four payment paths, PHI handling |
| `API_REFERENCE.md` | All 130 API routes: methods, auth, rate limits, gotchas |
| `DATA_MODEL.md` | Tables by domain, PHI columns, the RLS bypass, migration conventions |
| `OPERATIONS.md` | Deploy, rollback, migrations, cron, configuration, incident table |
| `juvenex-api-integration.md` | The WhiteLabelMD endpoints behind `/api/juvenex/**` |
| `STRIPE_CHECKOUT.md` | Store checkout: flow, invariants, landmines, go-live checklist |
| `RETENTION.md` | Data retention policy |
| `../COST_MODEL.md` | Unit economics |

## Decisions and history

| Doc | Covers |
|---|---|
| `STAGE1_DECISIONS.md` | Blockers closed *without* a code fix, and why. **Read before re-litigating anything** — each entry records what would make it worth reopening |
| `STAGE1_RECON_2026-08-22.md` | Full recon, Aug 2026 |
| `COMPREHENSIVE_AUDIT_2026-04-27.md` | Earlier whole-app audit |
| `PRESCRIBERX_BRANDING_AUDIT.md` | De-branding audit for the PrescribeRx era |
| `bug5-discovery-report.md` | Worked example of a real investigation — product images |

## Plans and partner material

| Doc | Covers |
|---|---|
| `DEPLOYMENT_CHECKLIST.md` | Pre-deploy checks |
| `seamless-checkout-plan.md` | Checkout design work that preceded the Stripe rebuild |
| `supplement-partner-integration.md` | Partner integration notes |
| `WHITELABEL_OUTREACH_PROGRAM.md` | White-label programme |
| `FLUTTER_ARCHITECTURE.md` | Mobile architecture (Apr 2026; predates the current native wrapper) |
| `correspondence/` | Written correspondence with partners |

## Keeping these current

Docs go stale silently, so a few rules:

- **A new API route means a row in `API_REFERENCE.md`.** That file is the only
  place the whole surface is listed.
- **A new migration means a line in `DATA_MODEL.md`** if it adds a table or a
  column anyone else will query.
- **A blocker you decide *not* to fix goes in `STAGE1_DECISIONS.md`**, with the
  reasoning and the condition that would reopen it. That file exists so the same
  argument is not had twice.
- Anything dated in a filename (`*_2026-*.md`) is a snapshot — correct as of that
  date, never edited afterwards. Write a new one instead of revising history.
