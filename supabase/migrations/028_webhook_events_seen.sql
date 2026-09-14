-- 028: webhook_events_seen — durable idempotency log for inbound webhooks.
--
-- Purpose
-- -------
-- Provider webhook receivers (PrescribeRx today; Stripe/etc. tomorrow) get
-- duplicate deliveries on every retry. We record (provider, event_id) on first
-- successful receipt; subsequent deliveries hit the PK conflict and short-
-- circuit before any side-effect runs.
--
-- Conventions mirrored from prior migrations:
--   • CREATE TABLE IF NOT EXISTS / IF NOT EXISTS on every index.
--   • RLS enabled. service_role bypasses RLS by design (set by Supabase),
--     so the webhook receiver writes freely. The only non-service reader
--     allowed is super_admin — useful for ops debugging via Studio.
--   • Wrapped in a single transaction so partial failure rolls back.
--
-- NOT included:
--   • TTL/cleanup. A future job can DELETE WHERE received_at < now() - '90 days';
--     index on received_at supports that scan cheaply.

BEGIN;

CREATE TABLE IF NOT EXISTS public.webhook_events_seen (
  provider     text NOT NULL,
  event_id     text NOT NULL,
  event_type   text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_seen_pkey PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_seen_received_at
  ON public.webhook_events_seen (received_at);

ALTER TABLE public.webhook_events_seen ENABLE ROW LEVEL SECURITY;

-- super_admin read access for ops debugging via Supabase Studio.
DROP POLICY IF EXISTS webhook_events_seen_super_admin_read
  ON public.webhook_events_seen;
CREATE POLICY webhook_events_seen_super_admin_read
  ON public.webhook_events_seen
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  );

-- No INSERT/UPDATE/DELETE policy for any non-service role: only the webhook
-- receiver (running with service_role) is allowed to write.

COMMIT;
