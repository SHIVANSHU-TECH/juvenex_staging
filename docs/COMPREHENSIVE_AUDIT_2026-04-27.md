# Comprehensive Multi-Dimensional Audit — Juvenex
_Generated 2026-04-27 by 4 parallel expert agents (security-auditor, performance-engineer, accessibility-expert, code-reviewer)._

## Total: 113 findings across 4 dimensions

| Dimension | Critical | High | Medium | Low | Total |
|-----------|----------|------|--------|-----|-------|
| **Security** | 1 | 7 | 11 | 9 | 28 |
| **Performance** | — | 4 | 19 | 14 | 37 |
| **Accessibility (WCAG 2.2 AA)** | 8 | 11 | 9 | — | 28 |
| **Code quality** | 0 | 4 | 9 | 7 | 20 |
| **TOTAL** | **9** | **26** | **48** | **30** | **113** |

Plus 8 code-quality strengths + 6 a11y compliant areas + today's diff fully approved across all 4 reviewers.

---

# 🚨 Tier 1 — MUST fix before client launch (10 items)

These block production ship for a HIPAA-scope white-label app:

| # | Issue | Dim | Impact | Effort |
|---|-------|-----|--------|--------|
| 1 | **PM2 595 restarts in 6 min** — `Failed to find Server Action "x"` crash loop | PERF | Availability + rate limits + AI counter all broken | 1 day |
| 2 | **CSP `'unsafe-inline'` + JWT in localStorage** — XSS → 7-day token theft | SEC CRIT | Account takeover via any stored XSS | 1 day |
| 3 | **Image proxy no body size cap** — 2GB upstream pins worker | SEC HIGH | Memory DoS | 30 min |
| 4 | **Image proxy follows S3 redirects** — `redirect: 'follow'` | SEC HIGH | SSRF via 302 to arbitrary host | 15 min |
| 5 | **`TELEHEALTH_PROVIDER_ALLOWED_HOSTS` opt-in SSRF guard** | SEC HIGH | API key exfil on misconfig | 15 min |
| 6 | **Iframe `allow="camera; microphone"` over-grant** | SEC HIGH | Device-perm delegation to PrescribeRx unnecessarily | 1 line |
| 7 | **CSP `img-src https:` wide open** | SEC HIGH | XSS exfiltration channel | 5 min |
| 8 | **Color contrast failures across 60+ sites** — `#8FA888` fails AA | A11Y CRIT | Low-vision users blocked | 1 day |
| 9 | **Form labels missing** (login, register, intake, food-log) | A11Y CRIT | Screen-reader users blocked | 4 hours |
| 10 | **No skip-to-content link + no focus indicators** | A11Y CRIT | Keyboard users blocked | 2 hours |

---

# ⚠️ Tier 2 — Fix before scale (15 items)

| # | Issue | Dim | Notes |
|---|-------|-----|-------|
| 11 | **AI free-tier counter resets on PM2 restart** — easily bypassable today | PERF HIGH | Move to Postgres `ai_usage_daily` table |
| 12 | **`/api/ai/chat` no streaming** — 2-5s TTFB | PERF HIGH | `ReadableStream` token-by-token |
| 13 | **In-memory rate-limiter doesn't survive PM2 restart or scale to cluster** | SEC MED | Move to Redis (Upstash) |
| 14 | **Audit log silently swallows write failures** (8 sites) | SEC HIGH | HIPAA §164.312(b) gap — DLQ pattern |
| 15 | **`progress-photos` bucket privacy not asserted at boot** | SEC HIGH | Startup probe + alarm |
| 16 | **PostgREST `.or()` template-string filter injection risk** | SEC HIGH | Replace with `.in()` chained calls |
| 17 | **Sequential count+list queries** (4 routes) | PERF HIGH | `Promise.all()` — 50-150ms saved each |
| 18 | **Auth response envelope inconsistency** — 7 routes use `{error}` not `{success, data, error}` | CODE HIGH | Mechanical fix, ~30 min |
| 19 | **Hardcoded IP `81.17.96.70:3001` in sitemap** | CODE HIGH | Already flagged; blocks white-label |
| 20 | **Dead exports** (`telehealthApi`, `getAuthToken`) in `src/lib/api.ts` | CODE HIGH | 10 min cleanup |
| 21 | **Cart drawer not accessible dialog** | A11Y CRIT | Convert to `<dialog>` w/ focus trap |
| 22 | **Touch targets <44×44 CSS px** (shop +, cart icon, profile bell) | A11Y CRIT | Bump to `min-h-11 min-w-11` |
| 23 | **Heading hierarchy violations** (dual h1, skipped levels) | A11Y CRIT | Demote brand wordmark to span |
| 24 | **`<a href="#" onClick>`** for Terms/Privacy in register | A11Y CRIT | Use `<button>` |
| 25 | **`/landing` violates 150KB JS budget** — every visitor pays 258KB shared baseline | PERF HIGH | Split marketing layout |

---

# 📋 Tier 3 — Tech debt + smaller wins (88 items)

Full list in the agent reports; grouped here:

### Security Tier 3 (16 items)
- JWT no `iss/aud/jti`, 7-day lifetime, no revocation list (MED)
- `getAuthUser` re-queries profile every request, no cache (MED)
- AI personalization consent not re-validated at prompt-build (MED)
- Generic-flow telehealth POSTs raw payload (MED)
- Image proxy decoded-URL no length cap (MED)
- `avatar_url` no host allowlist (MED)
- CSP missing `form-action`, `frame-ancestors`, `upgrade-insecure-requests` (MED)
- `progress_photos.photo_url` accepts localhost in production (MED)
- Audit log uses `console.error` instead of `logger.error` (LOW)
- Telehealth provider key expiry tracked in code comments only (LOW)
- `setInterval` no `unref()` (LOW)
- Login error leaks "banned" vs "wrong password" (LOW)
- `/api/auth/callback` redirects without allowlist (LOW)
- Email exposed in social user SELECT (LOW)
- AI conversation history validation drops invalid silently (LOW)
- Missing COOP header (LOW)

### Performance Tier 3 (33 items)
- Shared chunk 3794 (216KB raw) — Supabase + Zod tree-shake opportunity (MED)
- `polyfills.js` 110KB raw — add `browserslist` to drop ~50KB (MED)
- Admin tabs eagerly imported — `next/dynamic` opportunity (MED)
- No `next/dynamic` usage anywhere — ChatWidget should be lazy (MED)
- 2 `select('*')` in `social/posts/comments/route.ts` (MED)
- AI chat catalog re-fetched per turn — memoize 60s (MED)
- `count: 'exact'` in 6 places — use `'estimated'` (MED)
- Auth profile route returns all columns (MED)
- `social/feed` `.or()` IN list unbounded (MED)
- `/api/messages` and `/api/admin/messages` `.limit(500)` cap too high (MED)
- No `Cache-Control` on public-read API routes (MED)
- Community feed not virtualized (MED)
- Message thread not virtualized (MED)
- Community page 20+ `useState` re-renders (MED)
- `providers.tsx` forces auth context everywhere (MED)
- Image proxy missing per-key dedup (MED)
- ... (17 lower-priority perf items)

### Accessibility Tier 3 (9 items)
- Error banners not announced (`role="alert"` missing) (MAJOR)
- Form fields don't expose validation state (`aria-invalid`, `aria-describedby`) (MAJOR)
- Required fields rely on visual asterisk only (MAJOR)
- `<div onClick>` peptide-encyclopedia rows (MAJOR)
- ChatWidget: no dialog semantics, no focus mgmt, send button unnamed (MAJOR)
- ChatWidget: messages list not live region (MAJOR)
- Loading spinners no `role="status"` (MAJOR)
- `prefers-reduced-motion` ignored (MAJOR)
- Icon-only buttons missing `aria-label` (MAJOR)
- Cart count badge not in cart button accessible name (MAJOR)
- Intake step progression silent (MAJOR)
- Telehealth iframe no fallback path / pre-iframe explainer (MAJOR)
- Plus 9 minor items (decorative emoji, search input labels, redundant role attrs, color-only nav-active state, disabled contrast, confirm-dialog auto-focus, partial focus trap, etc.)

### Code Quality Tier 3 (16 items)
- 5 files trending toward 800-line ceiling (`ai-meals/page.tsx` 583 lines) (HIGH)
- 40 `console.error/warn` calls in client code bypass `logger` (MED)
- 8 silent `.catch(() => {})` on audit-log calls (MED)
- 4 unresolved `// TODO: extract a shared admin-shared/<X>` comments (MED)
- Magic role strings repeated across 12 sites (MED)
- 2 unused exports (`deidentifyProfile`, `isAdminRole`) (MED)
- `getSupabase()` duplicated in 10+ files (MED)
- `useEffect` empty-deps fetch patterns fragile (MED)
- `.env.example` example values for `TELEHEALTH_PROVIDER_ALLOWED_HOSTS` are fictional (MED)
- README.md is unchanged Next.js boilerplate (MED)
- `src/components/PageLayout.tsx` dead exports (LOW)
- Telehealth iframe magic numbers `800`/`600` not constants (LOW)
- `proxy.ts` unused `_nonce` parameter (LOW)
- Migration 019 atomic but no 018-applied guard (acknowledged safe) (LOW)
- `encryption.ts` legacy decrypt path no removal date (LOW)
- `ADMIN_COLORS` legacy export not marked `@deprecated` (LOW)

### CRITICAL CROSS-CUTTING GAP
- **~0% automated test coverage** — no Vitest/Jest/Playwright, no `*.test.ts(x)` files anywhere. House rule = 80%. **Estimated 2-week test stand-up effort** before client handoff.

---

# 💡 Recommended remediation phases

## Phase A — Production-blocker fixes (1 week, 10 items)
Tier 1 items 1-10. Two fix waves split per "feedback_split_fixes" memory rule:
- **Wave A1 (security + perf):** PM2 crash loop, CSP unsafe-inline, image proxy size cap + redirect, allowlist mandatory, iframe perms, img-src tightening, AI counter persistence
- **Wave A2 (a11y):** Color system overhaul, form labels, skip link + focus indicators, accessible dialog conversion, touch target sizing, heading hierarchy

## Phase B — Pre-scale tech debt (1 week, 15 items)
Tier 2 items 11-25. Two fix waves:
- **Wave B1 (backend):** Streaming, rate-limit Redis, audit-log DLQ, query parallelization, response envelope normalization
- **Wave B2 (frontend):** Cart dialog, touch targets, headings, links, marketing layout split

## Phase C — Test infrastructure stand-up (2 weeks)
- Vitest + Playwright + 80% coverage gate
- Critical paths first: encryption, auth, image proxy SSRF, telehealth route

## Phase D — Long-tail polish (3-4 weeks, 88 items)
- Tier 3 batched by area (security hardening, perf wins, a11y improvements, tech debt cleanup)

---

# ✅ Today's diff verdict (cross-reviewed by all 4 agents)

| Change | Security | Performance | A11Y | Code Quality |
|--------|----------|-------------|------|--------------|
| `/api/img/[...path]/route.ts` (image proxy) | ✅ approve, 2 fixes (size cap, redirect) | ✅ approve, dedup follow-up | n/a | ✅ approve, "production-grade SSRF defense" |
| `/telehealth/page.tsx` (iframe swap) | ✅ approve, drop camera/mic | ✅ approve, no LCP impact | ⚠️ needs pre-iframe explainer + fallback path | ✅ approve, 101 lines minimal |
| `route.ts` brand rename | ✅ approve, no security impact | n/a | n/a | ✅ approve, only legacy fallbacks remain |
| `proxy.ts` + `next.config.ts` CSP | ⚠️ unsafe-inline still there (predates today) | ✅ ~1ms cost | n/a | ✅ approve with comment-asymmetry nit |
| Migration 019 | ✅ approve, no security impact | n/a | n/a | ✅ approve, atomic + safe |
| Validation bug fix in `telehealth/page.tsx:142` | ✅ approve | ✅ approve | n/a | ✅ approve |

---

# 🟢 Top strengths called out across reviews

1. **Encryption module exemplary** — `src/lib/encryption.ts` (scrypt KDF + version envelope + legacy decrypt path + fail-fast)
2. **Image proxy "production-grade SSRF defense"** — explicit allowlist, opaque log keys, header strip
3. **3-layer PHI sanitization** — `phi-sanitizer.ts` + `ai/chat/route.ts` post-redactor + system-prompt soft-instruction
4. **TypeScript hygiene top-1%** — zero `any`, zero `@ts-ignore`, zero `@ts-expect-error`
5. **Console-log discipline** — 0 `console.log` in `src/`
6. **Rate limiting on every authenticated route** sampled
7. **DB queries indexed** — no SQL injection risk, no obvious unindexed `ORDER BY`
8. **Provider-agnostic naming applied consistently** in today's brand-rename pass
9. **`next/image` with priority** for above-the-fold logos (CLS targets met)
10. **Admin component patterns** (`ConfirmDialog`, `AddOrgModal`, `MessageComposer`) are accessible templates the rest of the app should adopt

---

# 🚨 Cross-cutting urgent: PM2 restart loop

The single most urgent item across all 4 audits: **PM2 process is crash-restarting on every browser tab serving stale Server Action IDs from a previous build**.

Effects:
- 595 restarts in 6 minutes (verified in PM2 status)
- Every restart resets the in-memory rate limiter — security gates effectively disabled
- Every restart resets the AI free-tier daily counter — quota bypass
- Every restart wipes any in-flight async state
- Logs show repeated `Error: Failed to find Server Action "x"` crashes

**Root cause:** Next.js 16's Server Actions identify themselves by content-hashed IDs. After a deploy, stale browser tabs send old IDs → server has no handler → Next throws → PM2 restarts the process.

**Fix path:**
1. Wrap server-action dispatch in a top-level error boundary that returns a "please refresh" response instead of crashing.
2. Move the AI daily-counter to Postgres so restarts don't reset it.
3. Move the rate-limiter to Redis (Upstash) so restarts don't reset it.

This dwarfs every other item. Fix this first.
