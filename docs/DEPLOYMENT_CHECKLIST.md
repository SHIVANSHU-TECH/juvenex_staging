# Juvenex Production Deployment Checklist

**Generated:** 2026-04-28  
**App Version:** 0.1.0 (Next.js 16.2.3)  
**Production Build Status:** ✅ PASSED (23.9s compile, 40s TypeScript)

---

## Build & Runtime Configuration

### Build Output
- **Compiler:** Next.js 16.2.3 with webpack
- **Build Result:** Successful (fully compiled and optimized)
- **Output Directory:** `./.next/` (standard Next.js standalone build)
- **Runtime Mode:** Next.js minimal server (lightweight, production-grade)
- **Routes Generated:** 55 static pages + 49 API routes + 1 middleware proxy
- **TypeScript Errors:** 0 (strict mode, no `any` in source)

### Deployment Notes
- App runs as a standard Node.js process via `next start`
- No special build flags or environment setup needed beyond env vars below
- Production server: `81.17.96.70:3001` (per project memory)
- All static assets are pre-optimized and minified
- API routes are wrapped in middleware with security headers and CSP nonce injection

---

## Database Migrations

**Current Status:** 22 migrations have been prepared and must be applied in order.

### Migration Application Instructions

Apply migrations in strict order (001 → 022) on the production database:

```bash
# Export Supabase credentials to a secure shell on the production server
# (migrations cannot be applied over IPv4 from external networks;
#  SSH to the app server 81.17.96.70 first)

# For each migration file 001 through 022:
PGPASSWORD='<SUPABASE_SERVICE_ROLE_KEY>' \
psql \
  -h db.sbjcztlplbzcsyvljouf.supabase.co \
  -U postgres \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/NNN_<name>.sql
```

### Migration Details

| # | File | Purpose | Notes |
|---|------|---------|-------|
| 001 | initial_schema.sql | Core tables: profiles, organizations, shop_products, orders, ai_conversations, appointments, posts, messages, groups | Foundation |
| 002 | fixes.sql | Post-001 constraint and data-type fixes | Non-destructive |
| 003 | security_fixes.sql | RLS policies, audit logging setup | Non-destructive |
| 004 | schema_fixes.sql | Additional constraint refinements | Non-destructive |
| 005 | constraint_and_rls_fixes.sql | RLS policy refinement | Non-destructive |
| 006 | telehealth_provider_ref.sql | Adds telehealth provider reference columns | ADD COLUMN IF NOT EXISTS |
| 007 | final_hardening.sql | Security & role-based access controls | Non-destructive |
| 008 | encrypt_phi_columns.sql | **Enables PHI encryption** (HIPAA): adds triggers to encrypt patient_profiles.*, ai_conversations.messages_enc, appointments.intake_data | ⚠️ Requires ENCRYPTION_KEY_SALT env var |
| 009 | appointments_org_and_rls.sql | Org-level RLS for telehealth appointments | Non-destructive |
| 010 | community_features.sql | Adds social_posts, likes, follows, community features | ADD TABLE IF NOT EXISTS |
| 011 | blogs.sql | Blog table and RLS | ADD TABLE IF NOT EXISTS |
| 012 | messaging.sql | Enhanced messaging (threads, unread tracking) | ADD TABLE IF NOT EXISTS |
| 013 | orders_admin_indexes.sql | Indexes on orders table for admin dashboard | Non-destructive, CREATE INDEX IF NOT EXISTS |
| 014 | org_admin_indexes.sql | Organization admin table indexes | Non-destructive |
| 015 | ai_personalization.sql | AI usage tracking and daily audit tables | ADD TABLE IF NOT EXISTS |
| 016 | security_hardening.sql | Additional RBAC and audit policies | Non-destructive |
| 017 | column_grants.sql | Granular column-level access for PHI | Non-destructive |
| 018 | prescriberx_patient_ref.sql | Adds patient_reference tracking for PrescribeRx integration | ADD COLUMN IF NOT EXISTS |
| 019 | provider_patient_ref_rename.sql | Renames provider_patient_ref column for consistency | Non-destructive |
| 020 | ai_usage_daily_audit_dlq.sql | AI usage audit tables and dead-letter queue for failed audits | ADD TABLE IF NOT EXISTS |
| 021 | org_branding.sql | Org branding columns (logo, colors, fonts) | ADD COLUMN IF NOT EXISTS |
| 022 | **orders_checkout_extend.sql** | **CRITICAL NEW:** Extends `orders` table for reverse-flow checkout system | See detailed section below |

### Migration 022: Orders Checkout Extension (MUST APPLY BEFORE FIRST CHECKOUT)

This migration is **additive and safe to apply immediately.** It extends the orders table to support the new checkout flow:

**New Columns Added:**
- `shipping_address (jsonb)` — Persistent copy of shipping address at checkout time
- `billing_address (jsonb)` — Persistent copy of billing address
- `intake_answers (jsonb)` — HIPAA-sensitive intake form answers (encrypted by trigger from migration 008)
- `contact_email (text)` — Fulfillment contact
- `contact_phone (text)` — Optional fulfillment contact phone
- `payment_provider (text)` — Which payment processor handled this order (e.g., `'stub'`, `'stripe'`)
- `payment_reference (text)` — Session ID from payment provider (Stripe cs_test_..., Stub stub_<orderId>, etc.)
- `payment_status (text)` — One of: `'pending'`, `'succeeded'`, `'failed'`, `'refunded'`
- `prescriberx_status (text)` — One of: `'not_sent'`, `'sent'`, `'confirmed'`, `'failed'`
- `prescriberx_reference (text)` — Order ID from PrescribeRx dashboard (returned after we POST /encounters)
- `prescriberx_sent_at (timestamptz)` — When order was forwarded to PrescribeRx
- `fulfilled_by (uuid FK → profiles.id)` — Admin who marked fulfilled
- `fulfilled_at (timestamptz)` — When order was marked fulfilled
- `admin_notes (text)` — Free-text notes from admin fulfillment

**New Indexes Created:**
- `idx_orders_prescriberx_status` — Speeds admin queue filtering by PrescribeRx send status
- `idx_orders_payment_status` — Speeds filtering by payment processor status (debugging stuck payments)
- `idx_orders_payment_reference` — Speeds webhook reconciliation (payment_reference lookup)

**Verification Query (after migration):**
```sql
\d orders
```

Should show all new columns and the three new indexes above. If applying migrations from within the app, check the Supabase dashboard **Database** > **Orders** table.

---

## Environment Variables

### Required Variables (MUST SET BEFORE DEPLOY)

#### Core App Configuration
```env
# App URL (must be HTTPS in production)
NEXT_PUBLIC_APP_URL=https://juvenex.example.com

# Supabase (public endpoint)
NEXT_PUBLIC_SUPABASE_URL=https://sbjcztlplbzcsyvljouf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<value from Supabase dashboard>

# Supabase (server-side, requires service role)
SUPABASE_SERVICE_ROLE_KEY=<value from Supabase Settings → API>

# Node environment
NODE_ENV=production
```

#### Authentication & Encryption
```env
# JWT signing secret for server-issued session tokens (min 32 chars, cryptographically random)
JWT_SECRET=<generate: openssl rand -hex 32>

# PHI Encryption (HIPAA-required, min 32 chars each)
ENCRYPTION_KEY=<generate: openssl rand -hex 32>
ENCRYPTION_KEY_SALT=<generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

# ⚠️ CRITICAL: Encryption key rotation is NOT supported.
# Never rotate ENCRYPTION_KEY or ENCRYPTION_KEY_SALT after patient data is encrypted.
# Rotation permanently breaks decryption of patient_profiles._enc, ai_conversations.messages_enc,
# and appointments.intake_data.
# Back up and verify keys before deploying to production.
```

#### AI & Language Models
```env
# AI provider selection (default: grok)
# Options: grok | anthropic | openai | gemini
AI_PROVIDER=grok

# xAI Grok (if AI_PROVIDER=grok)
XAI_API_KEY=<xAI console>

# Anthropic Claude (if AI_PROVIDER=anthropic)
ANTHROPIC_API_KEY=<Anthropic console>
CLAUDE_MODEL=claude-sonnet-4-20250514

# OpenAI (if AI_PROVIDER=openai)
OPENAI_API_KEY=<OpenAI console>

# Google Gemini (if AI_PROVIDER=gemini)
GOOGLE_API_KEY=<Google Cloud console>
```

#### Payment Processing (**BLOCKING FOR PRODUCTION**)
```env
# Payment Provider Selection (REQUIRED in production)
# Dev/staging: stub (local testing only)
# Production: must be set to a real vendor
# Currently supported vendors: stub (dev only)
# Future vendors: stripe, square, authnet (not yet implemented)
PAYMENT_PROVIDER=stub

# Stub provider only — allows non-authenticated /api/payments/confirm
# for local testing. DO NOT SET IN PRODUCTION.
STUB_CONFIRM_TOKEN=

# Stripe (when PAYMENT_PROVIDER=stripe is implemented)
# STRIPE_SECRET_KEY=<Stripe dashboard>
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<Stripe dashboard>
# STRIPE_WEBHOOK_SECRET=<Stripe webhooks page>
```

#### Telehealth Integration (Optional)
```env
# Telehealth Provider Type (one of: generic, two_step)
# generic: Single POST to external provider with full intake payload
# two_step: POST /patients first, then POST /encounters (used by PrescribeRx)
TELEHEALTH_PROVIDER_TYPE=generic

# External provider endpoint (POST target for intake)
# Leave empty if storing intake locally (ALLOW_INTAKE_PERSISTENCE=true)
TELEHEALTH_PROVIDER_URL=https://api.example-health.com/intake

# Bearer token for telehealth provider API
TELEHEALTH_PROVIDER_API_KEY=<token from provider>

# Allowlist of hosts for telehealth forwarder (SSRF prevention)
TELEHEALTH_PROVIDER_ALLOWED_HOSTS=api.example-health.com,api.another-provider.com

# Fallback: allow storing intake locally (only if TELEHEALTH_PROVIDER_URL is empty)
# ⚠️ Set to false in production (requires BAA or PHI encryption + escrow)
ALLOW_INTAKE_PERSISTENCE=false

# PrescribeRx Encounter Type ID (when TELEHEALTH_PROVIDER_TYPE=two_step)
# UUID from PrescribeRx dashboard Settings → Encounter Types
# Required when using PrescribeRx for telehealth fulfillment
TELEHEALTH_ENCOUNTER_TYPE_ID=<UUID from PrescribeRx>
```

#### Notifications (Optional)
```env
# Twilio SMS (if sending SMS notifications)
TWILIO_ACCOUNT_SID=<Twilio console>
TWILIO_AUTH_TOKEN=<Twilio console>
TWILIO_PHONE_NUMBER=+1234567890

# SendGrid Email (if sending email notifications)
SENDGRID_API_KEY=<SendGrid console>
```

### Optional / Feature Flags
```env
# Feature flags (set to 'true' to enable)
NEXT_PUBLIC_TELEHEALTH_ENABLED=true
NEXT_PUBLIC_SOCIAL_FEED_ENABLED=true
NEXT_PUBLIC_PROGRESS_PICS_ENABLED=true
NEXT_PUBLIC_AI_MEAL_PLANS_ENABLED=true
NEXT_PUBLIC_CHATBOT_ENABLED=true

# Telehealth provider (default: daily, supports: daily, twilio, etc.)
TELEHEALTH_PROVIDER=daily
DAILY_CO_API_KEY=<daily.co dashboard>
DAILY_CO_DOMAIN=<your-domain>.daily.co

# Auth provider (default: clerk, custom support available)
AUTH_PROVIDER=clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<Clerk dashboard>

# Database provider (default: supabase, supports: postgres)
DB_PROVIDER=supabase
```

---

## Payment Processor Setup (BLOCKING FOR PRODUCTION)

### Current Status: STUB PROVIDER (Development Only)

The app is currently configured with a **stub payment provider** for local testing and CI/CD. This provider:
- Returns a fake checkout session URL (`/checkout/stub-pay?orderId=...`)
- Requires manual test clicks to confirm payment
- Allows integration testing without real payment keys
- **MUST BE REPLACED** before production deployment

### Production Readiness: 3 Steps

#### 1. Select a Real Payment Provider
Choose one of: Stripe, Square, Authorize.net, or another processor your business contract covers.

#### 2. Implement the Provider Adapter
Create a new file: `/root/GLP_assistant/src/lib/payments/<vendor>-provider.ts`

```typescript
// Example: src/lib/payments/stripe-provider.ts
import { PaymentProvider, CheckoutSession, CheckoutSessionRequest } from './provider'

export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe'

  async createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSession> {
    // Call Stripe API to create a checkout session
    // Return { sessionId: string, sessionUrl: string }
  }

  async handleWebhookEvent(body: unknown, signature: string): Promise<void> {
    // Verify webhook signature
    // Update order status based on payment.succeeded / payment.failed events
  }
}
```

Refer to `src/lib/payments/stub-provider.ts` for the full interface and error handling patterns.

#### 3. Register Provider in Factory
Edit `src/lib/payments/index.ts` and add a case to the switch statement:

```typescript
switch (name) {
  case 'stub':
    return new StubProvider()
  case 'stripe':
    return new StripeProvider()
  // Add more providers here
  default:
    throw new Error(`Unknown payment provider: ${name}`)
}
```

#### 4. Configure Environment
Set `PAYMENT_PROVIDER=<vendor>` in production environment and provide vendor-specific keys:

```env
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### 5. Configure Webhook URL
Register the webhook endpoint with your payment provider:

```
https://<your-domain>/api/payments/webhook
```

The webhook handler verifies the signature and updates order status. Signature verification secret must be set as an environment variable (e.g., `STRIPE_WEBHOOK_SECRET`).

### Testing Checkout Flow

**Before production, test the complete flow:**

1. Start the app on a staging server
2. Log in as a test user
3. Add an item to the cart from `/shop`
4. Visit `/checkout` — should display checkout form (or "unavailable" if provider not configured)
5. In stub mode: click "Pay", confirm payment on `/checkout/stub-pay`
6. Admin dashboard (`/admin`) → Fulfillment tab → order should appear as "pending fulfillment"
7. Admin manually forwards to PrescribeRx via dashboard, marks as fulfilled

---

## Build & Deploy

### Prerequisites
```bash
# Ensure Node.js 18+ and npm/yarn are installed
node --version   # Should be 18.x or higher
npm --version    # Should be 9.x or higher
```

### Build Command
```bash
# From /root/GLP_assistant:
npm install      # Install dependencies (cached, only needed on first deploy or dependency changes)
npm run build    # Compile Next.js app (timeout: ~60s, output: ./.next/)
```

### Start Production Server
```bash
# Start the app on port 3001 (or desired port)
npm start
# or
NODE_ENV=production node .next/standalone/server.js

# The app will:
# 1. Load all env vars from .env (or systemd env file)
# 2. Connect to Supabase
# 3. Start listening on port 3000 (default; can override with PORT env var)
# 4. Health checks available at GET /api/health (if implemented)
```

### Deployment to 81.17.96.70:3001
```bash
# SSH to the production server
ssh root@81.17.96.70

# Clone/pull the latest code
cd /app/juvenex
git pull origin main

# Install and build
npm install
npm run build

# Stop the old app and start the new one (use systemd or pm2)
systemctl restart juvenex
# or
pm2 restart juvenex
```

### Build Artifacts
- **Output:** `./.next/` directory (ready for production)
- **Size:** ~200-300 MB (depends on dependencies)
- **Static Assets:** Pre-optimized and minified in `./.next/static/`
- **API Routes:** Bundled as serverless functions in `./.next/server/`

---

## Post-Deploy Smoke Tests

Run these checks **immediately after deployment** to confirm the app is healthy:

### 1. Health & Connectivity
```bash
# App is running and responds to requests
curl -I https://juvenex.example.com/
# Should return 200 OK with security headers (X-Frame-Options, CSP, etc.)

# Database connectivity
curl -s https://juvenex.example.com/api/health | jq .
# Expected: { "status": "ok", "timestamp": "..." } (if health endpoint exists)
```

### 2. Authentication Flow
```bash
# Open in browser: https://juvenex.example.com/login
# 1. Log in with test credentials
# 2. Should redirect to /profile or /landing after login
# 3. Verify user data loads correctly
```

### 3. Shop & Checkout
```bash
# As a logged-in user:
# 1. Visit https://juvenex.example.com/shop
# 2. Add an item to cart
# 3. Click "Checkout"
# 4. Should either:
#    a) Show checkout form (if real payment provider configured)
#    b) Show "Payment processing unavailable" (if PAYMENT_PROVIDER=stub in prod)
# 5. If using stub provider for testing, confirm /checkout/stub-pay works
```

### 4. Admin Dashboard
```bash
# Log in as super_admin or org admin
# 1. Visit https://juvenex.example.com/admin
# 2. Navigate to "Fulfillment" tab
# 3. Should load empty state or any pending orders from recent checkouts
# 4. Verify no JavaScript errors in console (F12 → Console)
```

### 5. Payment Availability Endpoint
```bash
curl -s https://juvenex.example.com/api/payments/availability | jq .
# If stub provider and production: { "available": false, "error": "stub provider not allowed in production" }
# If real provider configured: { "available": true }
```

### 6. Database Migrations Verified
```bash
# SSH to the app server and check:
PGPASSWORD='<SUPABASE_SERVICE_ROLE_KEY>' psql \
  -h db.sbjcztlplbzcsyvljouf.supabase.co \
  -U postgres \
  -d postgres \
  -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';"
# Should return ~25+ tables (all migrations applied)

# Verify migration 022 applied:
PGPASSWORD='<SUPABASE_SERVICE_ROLE_KEY>' psql \
  -h db.sbjcztlplbzcsyvljouf.supabase.co \
  -U postgres \
  -d postgres \
  -c "\d orders" | grep payment_status
# Should show: payment_status | text | not null default 'pending'::text
```

---

## Known Limitations & Follow-Ups

### Subscriptions
- **Status:** Disabled (Subscribe & Save buttons show "Coming Soon")
- **Reason:** Requires recurring billing integration (not yet implemented)
- **Owner:** Future phase (requires decision on recurring billing provider)

### Email Notifications
- **Status:** Not implemented
- **Gap:** No email on order placed, no order tracking emails
- **Owner:** Requires SendGrid integration in POST /api/payments/webhook

### PrescribeRx Fulfillment
- **Status:** Manual (admin places orders manually)
- **Gap:** No automated fulfillment integration yet
- **Reason:** Awaiting PrescribeRx API docs and order template from Braeden
- **Implementation Plan:**
  1. Admin clicks "Send to PrescribeRx" in order detail
  2. App POSTs to `TELEHEALTH_PROVIDER_URL + /encounters` with order snapshot
  3. PrescribeRx returns an order ID → stored in `orders.prescriberx_reference`
  4. Webhook updates `prescriberx_status` to `'sent'`
  5. Admin marks fulfilled when order arrives

### Payment Webhook Verification
- **Status:** Stub provider doesn't verify signatures (dev-only)
- **Action:** Real provider integration MUST verify webhook signature (implemented in `PaymentProvider.handleWebhookEvent()`)
- **Why:** Prevents payment confirmation spoofing

### CSP & Nonce Injection
- **Status:** Middleware injects per-request nonce
- **Note:** `src/middleware.ts` rewrites the CSP header with a fresh nonce for every request
- **Fallback:** Static CSP in `next.config.ts` applies to assets without the middleware

---

## Rollback Plan

### If Checkout Breaks (Post-Deploy)
1. **Immediate:** Disable checkout button temporarily
   ```env
   # Add feature flag (not yet implemented):
   NEXT_PUBLIC_CHECKOUT_ENABLED=false
   ```
   Or redeploy the previous version from git.

2. **Database:** Migration 022 is **additive and idempotent**
   - All columns use `IF NOT EXISTS`
   - Safe to leave applied even if app code rolls back
   - Rollback does NOT require reverting the migration

3. **Payment Provider:** If a specific provider breaks
   - Redeploy with `PAYMENT_PROVIDER=stub` temporarily
   - Orders will fail with "Payment processing unavailable" (graceful degradation)
   - Switch back to working provider when fixed

### Database Rollback (If Migration Fails)
- **022 is safe:** All operations are idempotent; re-running applies cleanly
- **Earlier migrations:** Contact Supabase support for point-in-time recovery if a data-destructive migration is reverted

---

## Production Readiness Checklist

### Before Deployment
- [ ] All migrations (001-022) tested on staging database
- [ ] `PAYMENT_PROVIDER` set to real processor (not `stub`)
- [ ] Real payment processor API keys in `.env` (never hardcoded in source)
- [ ] `ENCRYPTION_KEY` and `ENCRYPTION_KEY_SALT` generated and stored securely
- [ ] `JWT_SECRET` is cryptographically random, min 32 bytes
- [ ] `NEXT_PUBLIC_APP_URL` is HTTPS (production domain)
- [ ] `TELEHEALTH_PROVIDER_URL` and `TELEHEALTH_ENCOUNTER_TYPE_ID` configured (if using PrescribeRx)
- [ ] SendGrid/Twilio keys configured (if using email/SMS notifications)
- [ ] Backup of encryption keys stored in secure vault (not in git, not on app server)
- [ ] Webhook URL (e.g., `https://.../api/payments/webhook`) registered with payment processor

### After Deployment
- [ ] Run all smoke tests (connectivity, auth, shop, admin, API endpoints)
- [ ] Verify migration 022 applied: `\d orders` shows all new columns
- [ ] Test checkout flow end-to-end (or confirm graceful "unavailable" if provider not ready)
- [ ] Admin can see orders in fulfillment tab
- [ ] No JavaScript errors in browser console (F12 → Console)
- [ ] Security headers present: `X-Frame-Options`, `CSP`, `HSTS`, `X-Content-Type-Options` (check with curl -I or browser DevTools)
- [ ] Database connection healthy: Check Supabase dashboard or run a test query

### Ongoing Monitoring
- [ ] Set up error tracking (Sentry, LogRocket, or equivalent)
- [ ] Monitor payment provider webhook delivery (check provider dashboard)
- [ ] Monitor database query performance (Supabase dashboard or pg_stat_statements)
- [ ] Set up alerting for: checkout failures, database errors, API latency
- [ ] Regular backup verification (Supabase automated backups, or manual pg_dump)

---

## Support & Escalation

### Troubleshooting

**Checkout returns 503 "unavailable":**
- Check `PAYMENT_PROVIDER` is set (not empty or `stub` in production)
- Verify payment provider API keys are set in `.env`
- Check logs for provider creation errors

**"ENCRYPTION_KEY not configured" error:**
- Confirm `ENCRYPTION_KEY` and `ENCRYPTION_KEY_SALT` are set in `.env`
- Both are required; min 32 bytes each
- If forgotten, cannot be recovered (encrypt keys in vault before production)

**Orders table missing new columns:**
- Run migration 022 manually (see instructions above)
- Verify with `\d orders | grep payment_status`

**Telehealth appointments return 503:**
- Check `TELEHEALTH_PROVIDER_URL` is set (or `ALLOW_INTAKE_PERSISTENCE=true` with local encryption)
- Verify `TELEHEALTH_ENCOUNTER_TYPE_ID` is a valid UUID from PrescribeRx

**Payment webhook not firing:**
- Check webhook secret is set in `.env` (matches provider dashboard)
- Verify webhook URL is publicly accessible: `curl -I https://.../api/payments/webhook`
- Check provider dashboard for webhook delivery logs

### Contacts
- **App Owner:** Khalid (kalez48.ka@gmail.com)
- **Braeden (Client):** Reviews features, approves integrations, provides PrescribeRx credentials
- **Supabase Support:** db.sbjcztlplbzcsyvljouf.supabase.co
- **Payment Processor:** Depends on vendor selected

---

## Related Documentation

- [PrescribeRx Branding Audit](./PRESCRIBERX_BRANDING_AUDIT.md) — Design and API integration notes
- [Comprehensive Audit 2026-04-27](./COMPREHENSIVE_AUDIT_2026-04-27.md) — Full security and feature review
- [Retention](./RETENTION.md) — User retention strategy and engagement metrics
- [`src/lib/payments/provider.ts`](../src/lib/payments/provider.ts) — Payment provider interface
- [`src/lib/payments/stub-provider.ts`](../src/lib/payments/stub-provider.ts) — Stub provider implementation (reference)
- [`next.config.ts`](../next.config.ts) — Security headers, CSP, image whitelisting
- [`src/lib/config.ts`](../src/lib/config.ts) — Canonical env var definitions

---

**Generated by:** Deployment Engineer  
**Last Updated:** 2026-04-28  
**Status:** ✅ Ready for Production Deployment (pending payment provider selection)
