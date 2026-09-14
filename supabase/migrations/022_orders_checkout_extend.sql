-- 022: Extend `orders` for the reverse-flow checkout system
--
-- Background:
--   The original orders table (013) was a thin record of a paid cart for the
--   admin moderation tab. We are now driving checkout through a Juvenex-owned
--   payment processor (TBD vendor — see src/lib/payments/provider.ts for the
--   abstraction) and manually fulfilling each order against PrescribeRx after
--   the payment clears. This migration adds every column needed to support
--   that flow without losing the existing 013 surface.
--
--   Flow:
--     1. User checks out → POST /api/payments/checkout
--          - inserts orders row, status='pending', payment_status='pending'
--          - persists shipping/billing/intake snapshot at write time
--          - calls PaymentProvider.createCheckoutSession()
--          - stores the returned sessionId in payment_reference
--     2. Provider webhook → POST /api/payments/webhook
--          - flips status='paid', payment_status='succeeded' (idempotent)
--     3. Admin fulfills via PrescribeRx UI
--          - flips status='fulfilled', prescriberx_status='confirmed', stamps
--            prescriberx_reference + prescriberx_sent_at + fulfilled_by/_at.
--
-- Idempotent: every column add uses IF NOT EXISTS, every constraint and index
-- guard against re-run. Safe to apply on an environment that has already been
-- partially migrated.

-- ---------------------------------------------------------------------------
-- 1. Address + intake snapshot columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_address jsonb,
  ADD COLUMN IF NOT EXISTS billing_address  jsonb,
  ADD COLUMN IF NOT EXISTS intake_answers   jsonb,
  ADD COLUMN IF NOT EXISTS contact_email    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_phone    text;

-- ---------------------------------------------------------------------------
-- 2. Payment provider columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider  text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_status    text NOT NULL DEFAULT 'pending';

-- payment_status check constraint — drop+recreate so a re-run picks up edits.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'succeeded', 'failed', 'refunded'));

-- ---------------------------------------------------------------------------
-- 3. PrescribeRx fulfillment columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS prescriberx_status    text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS prescriberx_reference text,
  ADD COLUMN IF NOT EXISTS prescriberx_sent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS fulfilled_by          uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS fulfilled_at          timestamptz,
  ADD COLUMN IF NOT EXISTS admin_notes           text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_prescriberx_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_prescriberx_status_check
  CHECK (prescriberx_status IN ('not_sent', 'sent', 'confirmed', 'failed'));

-- ---------------------------------------------------------------------------
-- 4. Extend `status` to allow 'fulfilled'
-- ---------------------------------------------------------------------------
-- 013 created the original CHECK constraint as orders_status_check. Drop and
-- recreate it with the new 'fulfilled' state added.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'shipped', 'fulfilled', 'refunded', 'cancelled'));

-- ---------------------------------------------------------------------------
-- 5. Indexes for the admin queue
-- ---------------------------------------------------------------------------
-- Admin queue filters heavily by prescriberx_status (e.g. show me everything
-- that's been paid for but not yet sent to PrescribeRx). Same for
-- payment_status when the admin is debugging a stuck payment.
CREATE INDEX IF NOT EXISTS idx_orders_prescriberx_status
  ON public.orders (prescriberx_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_payment_status
  ON public.orders (payment_status, created_at DESC);

-- payment_reference lookup is hit by the webhook handler when reconciling a
-- provider event back to its order. Partial index — only meaningful once a
-- session has been created.
CREATE INDEX IF NOT EXISTS idx_orders_payment_reference
  ON public.orders (payment_reference)
  WHERE payment_reference IS NOT NULL;
