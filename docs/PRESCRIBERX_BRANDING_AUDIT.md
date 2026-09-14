# PrescribeRx Branding Audit — Juvenex Storefront PR

_Generated 2026-04-27. Sources: codebase audit agent + PrescribeRx data-plane audit agent + live API/dashboard probes during this session._

> **Phase 0 deliverable per Braeden's brief.** Code-zero. Review with Braeden before any implementation. This doc grounds the Phase 1+ scope.

---

## TL;DR — Three Things That Block White-Label Launch

1. **Image hostname leak.** Every product image is a 1-hour-signed AWS URL on `prescribe-rx-product-assets.s3.amazonaws.com`. If we ever render a raw `<img>`, the brand leaks via DOM inspection / right-click "copy image address". → **Image proxy under our own domain (Phase 1).**
2. **PrescribeRx-side transactional comms are entirely un-overridable at our (Sub-Sales-Org) tier.** Encounter/Rx/Order emails, SMS, and PDF receipts ship from PrescribeRx with no per-tenant from-address, logo, footer, or template editor. → **Out-of-scope for code; PrescribeRx feature-request ticket required.**
3. **Tenancy mismatch.** PrescribeRx hierarchy = `Platform → Sales Org → Sub Sales Org → Clients → Patients`. Our brief's hierarchy = `PrescribeRx → WhiteLabelReseller → SubTenant → Storefront`. We sit at "Sub Sales Org" and **cannot create children**, and **`/api/v1/patients` + `/api/v1/encounters` POST are 500/422 from our tier** (architectural — these endpoints live above us at Client tier). → **Use PrescribeRx Intake Embed widget for patient flow, escalate tier upgrade with PrescribeRx, model "Storefront" entirely on our side keyed to `embed_id`.**

---

## What works today (confirmed live, this session)

- API token authenticates: `GET /api/v1/me` → 200, `["*"]` abilities, expires 2026-05-27.
- Product catalog read: `GET /api/v1/products` → 332 SKUs.
- Patient list / individual GET: `/api/v1/patients`, `/api/v1/patients/{id}` → 200.
- Dashboard patient creation: works via `/sales/patients/create` (Livewire endpoint), creates valid patient row visible in API GET.
- Intake-embed configuration: `/sales/embeds/create` exposes 24+ branding fields (logo, color, font, theme, custom CSS, "Powered By" toggle, allowed-domains).

## What does NOT work (confirmed broken, this session)

| Action | Result | Cause |
|---|---|---|
| `POST /api/v1/patients` | 500 Server Error (every payload variant) | Sub-Sales-Org tier not supported for this endpoint |
| `POST /api/v1/encounters` (with valid existing `patient_id`) | 422 "selected patient id is invalid" | Encounter expects patient under a `client_id`; sales-org-direct patients fail FK check |
| `GET /api/v1/products/{id}` (single) | 500 Server Error | PrescribeRx-side bug |
| `GET /api/v1/webhooks` | 403 | Tier-locked |
| `/sales/sub-organizations` (create children) | 404 | Tier-locked |

→ **Telehealth integration code is correct per their documented schema, but their API doesn't accept POSTs from our tier. Engineering work-around: switch to embed widget. Long-term: escalate.**

---

# Section 1 — Codebase Audit (Juvenex repo)

## Bucket counts
- (a) Easy to hide: **2**
- (b) Hideable via overlay/proxy/wrapper: **3**
- (c) Genuinely fixed (UI workaround needed): **1**
- Out-of-scope (PrescribeRx-side, flag for Braeden): **4**

## Bucket (a) — easy to hide

1. **`shop_products.image_url` may store PrescribeRx S3 URLs at the DB layer.** `supabase/migrations/001_initial_schema.sql:198` declares plain `text`; `src/app/api/shop/products/route.ts:147` (POST) accepts whatever Zod's `image_url: z.string().url().nullable().optional()` (line 25) admits. Add a write-time host blacklist in the POST schema: reject/strip `*.s3.amazonaws.com` and fall through to `generateProductSVG()` (`src/lib/seed-products.ts:19`). Effort: **S**.
2. **Sitemap base URL hardcoded** to `'http://81.17.96.70:3001'` in `src/app/sitemap.ts:4` (and `public/robots.txt`). Not a PrescribeRx leak — but blocks tenant-config-driven origin. Replace with config resolver. Effort: **S**.

## Bucket (b) — overlay / proxy / wrapper required

1. **PrescribeRx S3 product images render directly in shop UI.** `src/app/shop/page.tsx:260-261` renders `<Image src={product.image_url}>`. Right now `next.config.ts` `images.remotePatterns` only whitelists `*.supabase.co`, `*.supabase.in`, `*.juvenex.app`, so PrescribeRx S3 URLs would 400 silently from the optimizer (UX bug, not a leak). `next.config.ts:42` CSP `img-src 'self' data: https: blob:` would let through plain `<img>` tags if added. **Approach:** add image proxy route `/api/img/[...path]` that fetches upstream server-side, regenerates ETag, sets `Cache-Control: public, immutable`, serves under our domain. Sync job rewrites `image_url` to `/api/img/<sha-of-source>` before DB insert. Wrap with `<TenantProductImage>` defaulting to `generateProductSVG` when proxy fails. Effort: **M**.
2. **`prescriberx_patient_id` column name leaks brand if any admin UI does `select *`.** `supabase/migrations/018_prescriberx_patient_ref.sql:6` + `src/app/api/telehealth/appointments/route.ts:507`. No current consumer found. **Approach:** rename to `provider_patient_ref` in a follow-up migration before any org-admin UI exposes the row. Index `idx_appointments_prescriberx_patient` similarly visible in `pg_indexes`. Effort: **S** if no consumers, **M** if rename + reindex. _Lock this in before Phase 3 catalog UI ships._
3. **Internal "PrescribeRx" string references in `route.ts` comments + log messages.** Ten+ hits in `src/app/api/telehealth/appointments/route.ts` (e.g. "PrescribeRx patient create failed", "Telehealth provider hostname not in allowlist"). Server-side only, but error-tracking destinations (Sentry, etc.) would surface them. **Approach:** rename log strings to "upstream telehealth provider" once we abstract. Effort: **S**.

## Bucket (c) — genuinely fixed

1. **TCPA consent text hardcoded to "Juvenex and its affiliated healthcare providers"** at `src/app/telehealth/page.tsx:402`. Legally sensitive — per-tenant variant requires legal review. UI workaround: tenant-config string in JSONB (`organizations.tenant_branding.consent_html`) but **must** require Braeden + counsel sign-off per tenant. Effort: **M** (legal > engineering).

## Out-of-scope (PrescribeRx-side, flag for Braeden)

- **Patient-facing emails** (welcome, verification, password reset, encounter notifications, Rx-ready, refill, follow-up, labs, account setup). Zero email-sending code in our codebase (`grep -rln "nodemailer|resend|postmark|sendgrid|mailgun|smtp" src/` → 0 hits). Auth emails sent by Supabase Auth; clinical emails by PrescribeRx.
- **Telehealth visit reminders / Rx-ready / shipping-tracking SMS.** PrescribeRx-side after `forwardToPrescribeRx()` hands off.
- **Pharmacy invoice / packing-slip PDFs.** Generated and printed PrescribeRx-side; their fulfillment label can show their branding.
- **Sync-job source.** I did not find a job in this repo that pulls products from PrescribeRx into `shop_products`. **Action: ask Braeden where `shop_products.image_url` values originate** — if external, defenses must be at render-time (proxy) rather than write-time.

## Phase 1 priorities (codebase)

1. **Image proxy route + tenant-configured product image rewrite** (Bucket b #1). Highest visibility — primary storefront surface.
2. **Sync-time `image_url` sanitisation** (Bucket a #1). Defense-in-depth.
3. **Rename / hide `prescriberx_patient_id` column** (Bucket b #2). Before any admin reporting UI ships.
4. **Tenant-configurable TCPA template** (Bucket c #1). Long lead — start legal conversation now.
5. **Open PrescribeRx ticket** for transactional-comms branding (out-of-scope items).

## Tooling notes (codebase)

- Image proxy needs no new deps — `Response` + `fetch` is enough. Optional `sharp` (already a Next.js peer dep) for EXIF strip + WebP forcing.
- For tenant-config-driven strings: existing `organizations` table (referenced from `shop_products.organization_id`) + `/org/[slug]` page — add a `tenant_branding` JSONB column. No new deps.
- No email library in repo yet — when transactional email moves in-house, prefer **Resend** (lightweight, React-Email-friendly, easy per-tenant From-domain).

---

# Section 2 — Data-Plane Audit (PrescribeRx surfaces)

## A. API response brand strings

| Endpoint | Field with brand leak | Severity | Notes |
|---|---|---|---|
| `/api/v1/products` | `image_url` = `https://prescribe-rx-product-assets.s3.amazonaws.com/...` | **HIGH** | 124/124 image-bearing products. SigV4 signed, 1-hour TTL, AWS access key `AKIA5OBGH4PVVY7GWHEW` visible (same key for all tenants). |
| `/api/v1/products` | `sku` prefix `BRX-` on 197/332 products (e.g. `BRX-PRD-TAB`) | MED | Reads as a Prescribe-Rx vendor code. Map to a tenant-side display code. |
| `/api/v1/products` | Many `name=""` and `description=null` entries | MED | Catalog hygiene gap; not a brand leak but breaks de-branded UI. |
| `/api/v1/sales-organizations/{id}` | `org_type_label="Sub Organization"`, `sales_org_number="ORG-..."` | LOW | Internal labels; don't render verbatim. |
| `/api/v1/me` | `user_type_label="Sales Organization"` | LOW | Internal. |
| `/api/v1/products/{id}` (single) | HTTP 500 | n/a | Functional bug, not brand leak; ticket PrescribeRx. |

No literal "Prescribe-Rx" / "PrescribeRx" / "powered by" / "pharmacy" strings in `name`, `description`, `short_description` across all 332 products. **Brand leaks concentrate in image hostnames and SKU prefixes.**

## B. Image hosting (the main visible leak)

- **Confirmed:** every product `image_url` (124/124 non-null) on `prescribe-rx-product-assets.s3.amazonaws.com`.
- **Format:** AWS SigV4, 1-hour expiry (`X-Amz-Expires=3600`).
- **Single bucket / single key** for every tenant.
- **Sample:** `https://prescribe-rx-product-assets.s3.amazonaws.com/products/019d309c-c731-70f9-8b27-9995267a571c/aod-9604-10-mg-1776071185.webp?...`
- **Implication:** signature TTL means we **cannot just rewrite to a CDN once at sync-time** — rewrites must happen at render-time OR we re-host. Our-side proxy at `/api/img/[...path]` with allowlist on `prescribe-rx-product-assets.s3.amazonaws.com` is the right fix.

## C. Patient-facing comms (the worst gap)

`/sales/settings` exposes only **API Token, Organization, User Preferences** at our tier. **No per-tenant email-template, SMS-template, branding-asset, or from-address controls.** Notification matrix at `/settings/preferences` lists every event PrescribeRx fires (channel toggles only — no template editor):

- **AUTH:** Account Setup, Provider Invitation, Sales Org Account Setup
- **ENCOUNTERS:** Additional Information Required, Encounter Cancelled/Completed/Created/Prescribed, Follow-Up Scheduled, Intake Reminder, Labs Required, Prescription Ready, Prescription Refill Available, Provider Assigned
- **COMPLIANCE:** Fulfillment Center / Provider License Expiring
- **COMMISSION:** Commission Report Approved/Delivered/Ready/Rejected

Each event has email/SMS/in-app channel toggles. **No template body, no from-address override, no logo upload.**

### C.1 Email templates
- Trigger: Encounter Prescribed, Prescription Ready/Refill, Encounter Cancelled/Completed, Intake Reminder, Account Setup, Follow-Up, Labs Required.
- Default sender: presumed `noreply@prescribe-rx.com` (not exposed in dashboard).
- Tenant overrides: **NONE.**
- Gaps: from-address, logo, footer, reply-to, subject tokenization, suppress-and-relay.

### C.2 SMS
- Trigger: Encounter Cancelled, Encounter Prescribed (Twilio backend likely).
- Sender ID: not exposed.
- Tenant overrides: **NONE.**

### C.3 PDF invoices / receipts
- Cannot inspect without a real order (we have 0).
- "© Prescribe-Rx" footer on every dashboard page including embed wizard → strong inference that PDFs carry the same boilerplate.
- Tenant overrides: **none visible.**

### C.4 Order confirmation flow
- Sender: PrescribeRx default mailer.
- Tenant overrides: **none.** `/sales/orders` has filter/search only.

### C.5 Embed widgets (the ONE surface with branding controls)

`/sales/embeds/create` exposes **24+ tenant-configurable fields**:
- Configuration Name (internal)
- Encounter Type (10 types — see project memory `prescriberx_integration.md`)
- **Allowed Domains** (newline-separated, supports `*.domain.com`)
- **Branding:** Primary Color, Font Family, Logo URL, Theme (Default/Light/Dark/Minimal)
- **Output Format:** iFrame / Bootstrap+jQuery / API Only
- **Payment Mode:** Platform Checkout / Redirect / External Capture
- Redirect URL after submit
- **Wizard Header:** Title, alignment, badge display, badge color, progress-bar color
- **Toggles:** Show Step Badges, Show Progress Bar, **Show Powered By** (default ON — toggle OFF to hide), Require SSL, Active
- Package & Product Configuration (visible packages, layout)
- UTM Tracking defaults
- Limits: Expires At, Max Submissions
- **Custom CSS** with `.prx-embed-*` selector hooks
- **Default Lab Center** override (Junction (Vital) / SiPhoX Health)

Tenant control here is nearly complete EXCEPT:
- Encounter form fields/copy/step structure tied to encounter-type definitions (above our tier).
- `.prx-embed-*` CSS prefix retained in inspectable DOM (minor brand leak).

### C.6 Patient portal
- Not exposed from sales-org dashboard. Inference: PrescribeRx sends patients an account-setup link to a patient-facing portal at `prescribe-rx.com` post-encounter. Could not confirm URL/branding without triggering live encounter.

### C.7 Onboarding links (additional surface)
- `/sales/onboarding/create` produces shareable URLs/QR codes (Clinic / Sales Org / Provider / Patient Intake / Sales Rep).
- Destination host hardcoded to `prescribe-rx.com` — **HIGH severity** if used for Patient Intake (patient lands on `prescribe-rx.com`, not Juvenex).
- Workaround: prefer embed widget for patient flows; restrict onboarding-links to internal B2B.

## D. Tenant capabilities already in PrescribeRx

- **Per-Embed branding:** the only true white-label primitive at our tier (logo, color, theme, custom CSS, Powered-By toggle, allowed-domains).
- **Per-Sales-Org commission rates** (`peptide_commission`, `medication_commission`).
- **Per-Embed lab routing override.**
- **Per-Sales-Org payment gateway** hinted at; merchant-accounts route 404s for us.
- **Packages tier-flagged** as Global Templates (sub-tenants can fork).

NOT exposed at our tier: email/SMS/PDF branding, patient-portal subdomain, webhooks, sub-org creation, merchant-account binding.

## E. Tenancy hierarchy mapping

```
PrescribeRx (platform admin)
  └─ Parent Sales Org   (id 019d7949-...; hidden from us)
       └─ Sub Sales Org   ← us: "2gj management llc" (id 019db68e-...; org_type=3)
            ├─ Clients (we have 0)
            ├─ Patients (we have 0; create via /api/v1/patients fails 500)
            ├─ Providers (we have 0; assigned by parent)
            ├─ Embeds  ← per-embed branding
            ├─ Onboarding Links
            └─ Packages (forked from Global Templates)
```

| Brief tier | PrescribeRx tier | Mapping |
|---|---|---|
| PrescribeRx | PrescribeRx (platform) | direct |
| WhiteLabelReseller | Sales Org (parent) | direct — but we don't have access to that tier |
| SubTenant | Sub Sales Organization | direct — this is us |
| Storefront | (no native concept) | Closest = Intake Embed config. Model "Storefront" on our side; FK to `embed_id`. |

**Mismatches:**
1. **No grandchildren under our role.** If Juvenex is to resell to multiple clinics where each clinic is a SubTenant → Storefront, we cannot onboard them as Sub-Sales-Orgs ourselves. Either (a) escalate Juvenex to parent-Sales-Org tier, or (b) PrescribeRx exposes a multi-create API at our tier.
2. **Storefronts are softer than tenants.** No `storefront_id` in PrescribeRx; only `embed_id`. We model entirely on our side.
3. **Branding lives at embed tier**, not org tier. A subtenant cannot set "my org always uses logo X" — they must set logo X on every embed. Our wrapper should default it.

## F. Items requiring PrescribeRx ticket (out-of-scope for our code)

1. Custom from-address per tenant for transactional email.
2. Per-tenant logo in email header + footer override.
3. **Suppress-and-relay** toggle — let us mute PrescribeRx email/SMS for specific events and re-emit from our side via webhook.
4. Per-tenant SMS sender ID + template body.
5. Per-tenant PDF receipt branding (logo, footer, remit-to).
6. Custom asset CDN/CNAME (e.g. `assets.<tenant>.com` aliased to S3 bucket) OR sane `Host` header so we can transparently proxy.
7. Patient-portal branding / subdomain.
8. Sub-tenant creation API at Sub-Org tier.
9. **Webhooks endpoint** (currently 403) — needed for suppress-and-relay (item 3).
10. Single-product GET fix (`/api/v1/products/{id}` → 500).
11. Onboarding-link host override.
12. Embed CSS class prefix override (`.prx-embed-*` → tenant-specified).
13. **CRITICAL — Sub-Sales-Org tier patient/encounter creation.** `POST /api/v1/patients` returns 500; `POST /api/v1/encounters` rejects sales-org-direct patient. Either upgrade our tier, or document that sub-orgs must use embed widget exclusively.

---

# Section 3 — Recommended Phase Plan (post-audit)

## Phase 1 (1 week, S+M effort, blocks tenant launch)
- Image proxy `/api/img/...`
- Sync-time `image_url` sanitisation
- Rename `prescriberx_patient_id` → `provider_patient_ref`
- **Switch telehealth flow to PrescribeRx Intake Embed** (drop the broken 2-step API, use iframe with our branding)
- Open PrescribeRx ticket (items F.1–F.13)

## Phase 2 (2 weeks)
- `tenant_branding` JSONB on `organizations` (logo, colors, brand name, favicon, consent_html)
- Storefront model + FK to `embed_id`
- Tenant-aware metadata + OG tags
- TCPA consent legal review with Braeden

## Phase 3 (2 weeks) — 2c brief
- Per-tenant catalog selection UI (virtualized 332-row table, autosave, CSV import)
- `tenant_product_overrides` table (tenant_id, product_id, included, image_override_url, price_override, markup_pct, audit log)

## Phase 4 (1 week) — 2b brief
- Per-product image upload + Sharp variants pipeline (background job)

## Phase 5 (1 week) — 2c brief
- Price override / markup engine + audit log of price changes

## Phase 6 (separate PR, scaffold data model in Phase 2) — 3 brief
- White-label hierarchy: WhiteLabelReseller → SubTenant defaults inheritance + permissions
- Cannot ship until PrescribeRx escalates our tier OR exposes multi-create at sub-org tier

## Summary
- **Total surfaces audited:** 27 dashboard paths, 9 API endpoints, 332 products, 3 settings tabs, 1 embed-config form (24 branding fields), full repo `/src` + `/public`.
- **High-severity leaks:** 3 (S3 image hostname, PrescribeRx-controlled email/SMS, Patient-Intake onboarding-link host).
- **Medium-severity leaks:** 3 (BRX SKU prefix, inferred PDF branding, .prx-embed-* CSS prefix).
- **Low-severity leaks:** 3 (org_type_label / user_type_label strings, "© Prescribe-Rx" dashboard footer, embed default Powered-By footer).
- **Tenant-overridable today (no PrescribeRx engagement):** 14 embed-level controls + image proxy + sync-time sanitisation.
- **Requires PrescribeRx feature work:** 13 items (F.1–F.13).
- **Requires our-side proxy/wrapper:** 4 items (image proxy; SKU/name re-mapping; suppress+re-emit for Encounter Prescribed once webhook lands; Storefront table mapping to embed_id with sub-tenant default inheritance).
