# Operations

Runbook for the box that serves Juvenex. Deploy, migrate, configure, and the
handful of failure modes that recur.

Companion docs: `DEPLOYMENT_CHECKLIST.md` (pre-deploy checks),
`ARCHITECTURE.md` (what the pieces are), `DATA_MODEL.md` (schema).

> **This box is production.** There is no separate prod host. A careless
> `next build` in this directory takes the live site down. Read §2 before
> running anything.

---

## 1. Topology

| Process (pm2) | Port | `NEXT_DIST_DIR` | Command |
|---|---|---|---|
| `juvenex-web` | 3002 | `.next` (default) | `npm start` |
| `juvenex-staging` | 3005 (127.0.0.1 only) | `.next-staging` | `npm start -- -H 127.0.0.1 -p 3005` |

Both run from the same working directory, `/root/GLP_assistant`, off the same
source tree. `next.config.ts` reads `distDir: process.env.NEXT_DIST_DIR || '.next'`
— that single line is what lets one checkout serve two independent builds.

Other pm2 processes on this box belong to unrelated projects. Never
`pm2 restart all`.

**Domains.** `juvenex.space` is primary and resolves straight to this box (no
CDN in front). `juvenex.app` is the legacy domain and sits behind Cloudflare.
Both are accepted by the app. Mail still sends from `orders@juvenex.app` because
only `.app` is DKIM-verified with Resend.

---

## 2. Deploying

The deploy is a build plus a restart. Netlify and Vercel config exist in the tree
and are both dead ends.

**Never run a bare `next build` or `next dev` here.** They write into `.next/`,
which `juvenex-web` is actively serving; a partially written build produces
chunk 500s on every route until the build finishes. Build to a scratch dist dir
and swap, or accept a short window and restart immediately.

```bash
# 1. Verify the tree is what you think it is
git status
npx tsc --noEmit
npm test

# 2. Build to a scratch directory (never the live one)
NEXT_DIST_DIR=.next-deploy npx next build

# 3. Back up the live build, swap, restart
mv .next .next.backup-$(date +%Y%m%d-%H%M%S)
mv .next-deploy .next
pm2 restart juvenex-web

# 4. Verify it is actually serving the new build
pm2 jlist | grep -o '"pm_uptime":[0-9]*'      # must be newer than…
stat -c %y .next/BUILD_ID                      # …this
```

**Restarting production needs explicit sign-off from the maintainer.** So does
any write against the production database.

### The failure that keeps happening

A fresh build is **not served until `pm2 restart`**. Several past "the fix didn't
work" reports were a stale process serving the old build. Always compare
`pm_uptime` against the `.next/BUILD_ID` mtime before concluding anything.

### The second failure that keeps happening

After a confirmed-good deploy, "it's broken on my phone" is almost always a
**stale client cache**, not the deploy. Verify against the public domain in a
fresh browser profile before rolling anything back.

### Staging

```bash
NEXT_DIST_DIR=.next-staging npx next build
pm2 restart juvenex-staging
```

Staging is bound to localhost. Reach it over an SSH tunnel, not the public
internet.

### Rollback

Every deploy leaves a `.next.backup-<timestamp>/`. To roll back:

```bash
mv .next .next-bad
mv .next.backup-<timestamp> .next
pm2 restart juvenex-web
```

These backups are gitignored and accumulate — prune old ones, keep the last two.

### Local development (on this box)

```bash
NEXT_DIST_DIR=.next-dev npx next dev
```

Historical trap: `src/app/favicon.ico` must be RGBA, or the dev server 500s on
every route.

---

## 3. Database and migrations

Supabase-hosted Postgres. **There is no migration runner in the deploy path** —
migrations are applied by hand, either through the Supabase SQL editor or with
`psql`:

```bash
PGPASSWORD='<db password>' psql \
  -h db.<project-ref>.supabase.co -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f supabase/migrations/0NN_name.sql
```

`scripts/apply-migration-008.sh` is a template for that. The password comes from
the Supabase dashboard (Project settings → Database) or `.env.local` — **never
write it into a file in this repo.**

Because applying and committing are separate acts, always do both. An applied
migration that was never committed is invisible to the next person; a committed
migration that was never applied breaks at runtime.

Conventions and the schema map are in `DATA_MODEL.md`.

---

## 4. Cron

| Job | Schedule | Endpoint |
|---|---|---|
| Subscription reconciliation | every 6 h (`0 */6 * * *`) | `POST http://localhost:3002/api/cron/reconcile-subscriptions` |

Installed in root's crontab as a `curl` with
`Authorization: Bearer <CRON_SECRET>`. It hits localhost, not the public domain,
so it does not depend on DNS or the CDN.

What it does: asks the payment provider for the true status of every active
recurring subscription and lapses the ones that ended; rescues membership orders
stuck in `pending` from a missed or garbled webhook (14-day window); runs the
day-7 trial conversion pass. Batch cap 500.

It exists because **Kurv's renewal and failure webhook format is undocumented**,
so recurring subscriptions are held "active until cancelled" and this job is the
authoritative correction. If it stops running, lapsed members keep access.

Without `CRON_SECRET` in the environment the endpoint answers 503 — it fails
closed rather than sitting open.

---

## 5. Configuration

`.env.local` is the live configuration; `.env.example` documents every variable.
Both are gitignored except the example. **`NEXT_PUBLIC_*` values are inlined at
build time** — changing one requires a rebuild, not just a restart.

### Required for the app to boot

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`,
`ENCRYPTION_KEY_SALT`. `jwt.ts` and `encryption.ts` throw at module load if
their keys are missing, so a missing one is an immediate, loud failure.

### Integrations (each degrades to a clear 503 when absent)

| Integration | Variables |
|---|---|
| WhiteLabelMD | `JUVENEX_API_KEY`, `JUVENEX_API_BASE_URL` |
| Stripe (store checkout) | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` |
| Payment provider (membership) | `PAYMENT_PROVIDER`, `KURV_API_KEY`, `KURV_API_BASE` |
| RevenueCat | `REVENUECAT_WEBHOOK_TOKEN`, `REVENUECAT_SANDBOX_ALLOW_USER_IDS` |
| PrescribeRx | `PRESCRIBERX_API_BASE`, `PRESCRIBERX_API_TOKEN`, `PRESCRIBERX_WEBHOOK_SECRET`, `PRESCRIBERX_ENCOUNTER_TYPE_ID` |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` |
| AI | `AI_PROVIDER`, `XAI_API_KEY` / `ANTHROPIC_API_KEY`, model overrides |
| Tapfiliate | `TAPFILIATE_API_KEY`, `NEXT_PUBLIC_TAPFILIATE_ACCOUNT_ID` |
| Cron | `CRON_SECRET` |
| Nutrition | `USDA_FDC_API_KEY` |

### Feature flags

All `NEXT_PUBLIC_`, all compared to the string `'true'`, all requiring a rebuild:
`NEXT_PUBLIC_TELEHEALTH_ENABLED`, `NEXT_PUBLIC_SOCIAL_FEED_ENABLED`,
`NEXT_PUBLIC_PROGRESS_PICS_ENABLED`, `NEXT_PUBLIC_AI_MEAL_PLANS_ENABLED`,
`NEXT_PUBLIC_CHATBOT_ENABLED`, `NEXT_PUBLIC_MEMBERSHIP_TRIAL_ENABLED`,
`NEXT_PUBLIC_INTAKE_ENABLED`.

To kill a flagged feature quickly: remove the line from `.env.local`, rebuild,
restart. Roughly a minute.

### Variables that do nothing

`src/lib/config.ts` still carries an aspirational block. `AUTH_PROVIDER`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `SENDGRID_API_KEY`, `TWILIO_*`,
`DAILY_CO_*`, `DB_PROVIDER` and `AI_MODEL` are read into `config`, and nothing
reads those `config` sections. Auth is Supabase; email is Resend. Setting them
has no effect.

### Rotation

| Key | Effect of rotating |
|---|---|
| `JWT_SECRET` | Logs every user out immediately. This is the emergency lever. |
| `SUPABASE_SERVICE_ROLE_KEY` | Rotate in the Supabase dashboard, then update `.env.local` and rebuild. |
| `ENCRYPTION_KEY` | **Cannot be rotated casually.** Every PHI column must be re-encrypted first — bump `KEY_VERSION`, keep the old decrypt branch, migrate rows. |
| `ENCRYPTION_KEY_SALT` | **Never change it.** Changing the salt permanently breaks decryption of everything written under the old one. |

---

## 6. Monitoring and diagnosis

```bash
pm2 logs juvenex-web --lines 200        # application logs
pm2 describe juvenex-web                # uptime, restarts, memory
curl -s localhost:3002/api/payments/availability   # is a processor configured
```

Also worth checking:

- `client_errors` — browser-side crashes. Rendering is client-heavy and auth is a
  localStorage JWT, so a browser crash leaves **no** trace in server logs. This
  table is often the only evidence.
- `audit_logs` and `audit_log_dlq` — a non-empty DLQ means audit writes are
  failing, which is itself an incident.
- `/api/admin/settings/health` — integration health, super_admin only.

Silent failures to know about:

- **Email failures are silent by design** — a Resend failure never blocks an
  order. Check the logs, not the UI.
- **A CSP block is silent.** If a third-party script or an embed does nothing at
  all, check `src/proxy.ts` before debugging the vendor.
- **Rate limits reset on restart** — they are in process memory. A restart clears
  everyone's counter.

---

## 7. Security posture and open items

Committed secrets: the repo has been scanned for credential-value shapes and
`.env.local`, `.vercel/`, TLS keys and `.env*.bak` files are all gitignored.

**One known exposure:** `scripts/apply-migration-008.sh` carried a real Supabase
database password in a usage comment. It has been removed from the working tree,
but **it remains in git history and that history is on GitHub.** The only real
fix is rotating that database password in the Supabase dashboard. Until then,
treat it as compromised.

`STAGE1_DECISIONS.md` blocker #8 tracks the rest of the security cleanup:

1. `.vercel/.env.production.local` — world-readable file with live keys. Delete.
2. `public/updates/` — internal client-update pages naming a real person's
   prescription products, publicly served. Now gitignored; still needs moving to
   `docs/correspondence/`.
3. `/api/juvenex/member` — unauthenticated membership/pricing oracle with zero
   callers. Delete rather than gate.
4. `dist.key` / `dist.csr` — TLS private key in the project directory. Move to
   `/root/.secrets-backup/`.
5. `.netlify/` — 85 MB dead deploy target. Already untracked; delete from disk.

---

## 8. Common incidents

| Symptom | First thing to check |
|---|---|
| Every route 500s with chunk errors | A `next build` ran against the live `.next`. Restore a backup, `pm2 restart` |
| "The fix isn't live" | `pm_uptime` older than `.next/BUILD_ID` — the process was never restarted |
| "Broken on my phone" after a good deploy | Stale client cache. Verify on the public domain in a clean profile |
| Checkout returns 503 | Stripe keys absent — expected until they are provisioned (`STRIPE_CHECKOUT.md`) |
| Members keep access after cancelling | The reconcile cron is not running, or `CRON_SECRET` is unset (endpoint 503s) |
| Store shows "catalogue is not loading" | Vendor API down or `JUVENEX_API_KEY` unset. The card is deliberate — it never renders an empty grid |
| Intake dies on step 2 with 419 | `Set-Cookie` rewriting in `/api/intake-proxy` broke — see `API_REFERENCE.md` |
| A third-party widget silently does nothing | CSP in `src/proxy.ts` |
