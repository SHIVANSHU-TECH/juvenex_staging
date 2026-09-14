# PrescribeRx Feature Request — Sub-Sales-Org Tier White-Label Support

**To:** PrescribeRx Support / Integrations Team
**From:** Juvenex / 2gj management llc (Sales Org `019db68e-daab-7071-a29c-5ecc6cfbb608`)
**Account contact:** Mathieu1391@yahoo.com
**API Token holder:** id 12 (expires 2026-05-27)
**Date raised:** 2026-04-27

---

## Background

We are building Juvenex, a GLP-1 weight-loss companion app. We are a Sub Sales Organization on PrescribeRx (org_type 3, parent `019d7949-7ad8-725a-accf-86688c6f0371`), and our brief from our client requires a white-labeled experience: end users must not see PrescribeRx branding anywhere in our consumer-facing flows.

We have spent two days mapping your platform's surfaces and identified blockers below. We're filing one consolidated request rather than 13 individual tickets so you can sequence them.

## P0 — Blocks our launch (please prioritize)

### 1. Sub-Sales-Org tier cannot create patients via API
`POST /api/v1/patients` returns HTTP 500 ("Server Error") regardless of payload, for any Sub-Sales-Org token. We tested:
- Minimum required fields (`first_name`, `last_name`, `email`, `dob`).
- With and without `phone`, `mobile_phone`, `gender`, full address.
- Both `application/json` and `multipart/form-data`.
- camelCase keys (returns 422 listing snake_case fields → confirms snake_case is correct → snake_case still 500).

The dashboard's `/sales/patients/create` Livewire form **does** create patients successfully (request id available on request). The list and single GET endpoints (`GET /api/v1/patients`, `GET /api/v1/patients/{id}`) work fine.

**Ask:** Either (a) enable `POST /api/v1/patients` for Sub-Sales-Org tokens with `["*"]` ability scope, or (b) document officially that the Intake Embed widget is the only supported patient-creation path at our tier so we can stop trying to integrate the API directly.

### 2. Encounter creation rejects sales-org-direct patients
Even when we use a patient created via the dashboard (so the resource provably exists in the same `sales_organization_id`), `POST /api/v1/encounters` returns:
```
{"errors":{"patient_id":["The selected patient id is invalid."]}}
```

**Inferred cause:** `/api/v1/encounters` requires patients linked under a `client_id`. Our org has 0 clients (we sell direct, not through clinics). The `client_id` field on our test patient is `null`.

**Ask:** Allow encounter creation for patients owned directly by a Sales Organization (not just by a Client), OR provide an API to create a `client` programmatically so we can wrap our Sales-Org with one virtual Client.

### 3. Webhooks endpoint tier-locked
`GET /api/v1/webhooks` returns 403 for our token, despite abilities `["*"]`.

**Ask:** Enable webhooks at Sub-Sales-Org tier. We need at minimum:
- `encounter.prescribed`
- `encounter.completed`
- `prescription.ready`
- `order.shipped`

Without webhooks we cannot mirror state into our DB without polling, and we cannot implement "suppress and re-emit" for transactional emails (see P1 #4).

## P1 — Required for full white-label compliance

### 4. Per-tenant transactional email overrides
Today every event in the notification matrix (`/settings/preferences` → Notifications) uses PrescribeRx's default sender, default logo, default footer. There is no per-tenant override at any tier visible to us.

**Ask, in priority order:**
1. **Suppress toggle** — let us mute PrescribeRx-side email/SMS for specific events when our webhook receiver acknowledges. We will re-emit from our side with our brand.
2. **Per-tenant from-address** + DKIM/SPF docs.
3. **Per-tenant logo** in email header + per-tenant footer block (address, unsubscribe, support email).
4. **Subject-line tokenization** with tenant variables.

Events we need to control: Encounter Prescribed, Prescription Ready, Prescription Refill Available, Encounter Cancelled/Completed, Intake Reminder, Account Setup invitations, Follow-Up Scheduled, Labs Required.

### 5. Per-tenant SMS sender ID + template body
Same rationale as #4 but for SMS (Encounter Cancelled, Encounter Prescribed). Currently no override; SMS goes out as PrescribeRx-branded.

### 6. Per-tenant PDF receipt branding
We have not been able to inspect a generated invoice (zero orders to date), but the dashboard footer "© Prescribe-Rx, All Rights Reserved" appears on every page including the embed wizard, so we infer PDFs carry the same boilerplate.

**Ask:** logo upload, footer override (remit-to address, return policy text), tenant business name as the from-line.

### 7. Patient portal branding
The encounter pipeline references "Patient Account Setup Invitation" — patients receive an account-setup link to a patient-facing portal. We could not confirm:
- The portal URL.
- Whether the portal is brand-able (logo, colors, custom domain).
- Whether per-tenant CNAME is supported.

**Ask:** documentation on the patient portal + per-tenant subdomain / CNAME / theme support.

### 8. Custom asset CDN / CNAME for product images
Every product `image_url` is a 1-hour-signed URL on `prescribe-rx-product-assets.s3.amazonaws.com`. We have implemented an image proxy on our side (`/api/img/[...path]`) that hides this hostname, but:
- 1-hour TTL means we cannot cache long; every render path goes through us.
- We'd prefer either (a) longer-lived signed URLs (24h+) or (b) a CNAME like `assets.prescribe-rx.com` we can alias as `assets.juvenex.app`, or (c) per-tenant signing keys so we can mint our own URLs.

## P2 — Nice to have

### 9. Single-product GET fix
`GET /api/v1/products/{id}` returns 500 across all UUIDs we sampled. List endpoint works fine, so this is a functional bug, not a tier issue.

### 10. Onboarding-link host override
`/sales/onboarding/create` produces shareable URLs whose host is hardcoded to `prescribe-rx.com`. For Patient Intake links (vs internal B2B) we'd want to point at our domain.

### 11. Embed CSS class prefix override
The `.prx-embed-*` selector hooks documented in your custom-CSS panel retain the `prx-` prefix. Inspectable in DOM. Minor leak — tenant-configurable prefix would close it.

### 12. Sub-Sales-Org tier sub-tenant creation
Our brief envisions us reselling to clinics where each clinic is a SubTenant with its own storefront. PrescribeRx's hierarchy supports this concept (Sub Sales Organizations exist) but `/sales/sub-organizations` returns 404 from our seat — only the parent tier can create children.

**Ask:** either (a) elevate Juvenex to parent-Sales-Org tier, or (b) expose a multi-create API at our tier with billing/quota guardrails of your choice.

### 13. Sales-organization API include for `encounterTypes`
`GET /api/v1/sales-organizations/{id}?include=encounterTypes` returns 200 but the `encounterTypes` payload is empty. We had to scrape the dropdown at `/sales/encounters/create` to get the 10 UUIDs in our org. Please populate the include or add a top-level `GET /api/v1/encounter-types`.

---

## What we have implemented on our side (so you know what's already covered)

- ✅ Image proxy at our domain to hide your S3 hostname.
- ✅ SKU prefix sanitization (`BRX-` → stripped on display).
- ✅ Provider-agnostic naming throughout our codebase (no literal "PrescribeRx" rendered to end users or in DB column names).
- ✅ Intake Embed configured with: Powered-By off, our logo, our colors, allowed-domain set to our app — pending confirmation that this iframe path is your supported white-label primitive.

## Summary

| Priority | Items | Notes |
|---|---|---|
| P0 | 1, 2, 3 | Blocks Sub-Sales-Org integration entirely |
| P1 | 4, 5, 6, 7, 8 | Required for full white-label compliance |
| P2 | 9, 10, 11, 12, 13 | Quality-of-life / scale |

Please confirm receipt and provide a target ETA for P0 items. We're happy to be a beta tester for any of these features.

— Khalid
Juvenex / 2gj management llc
