-- 020: Postgres-backed persistence for the free-tier AI daily counter and the
-- audit-log dead-letter queue.
--
-- BEFORE: Both lived in Node process memory. PM2 restarts (see Tier 1 #1 in
--   docs/COMPREHENSIVE_AUDIT_2026-04-27.md — 595 restarts in 6 minutes) reset
--   the AI counter (Tier 2 #11) and audit failures were swallowed (Tier 2 #14).
-- AFTER:
--   - ai_usage_daily — per-user, per-day message count survives restarts and
--     can be enforced atomically via ON CONFLICT.
--   - audit_log_dlq — when audit_logs INSERT fails, the caller writes a row
--     here. A background process (cron) can replay later. HIPAA §164.312(b)
--     requires a reliable audit trail; silently swallowing errors is a gap.

-- =============================================================================
-- (a) ai_usage_daily — free-tier daily counter, per (user_id, usage_date)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  message_count integer NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

-- Index by usage_date so a retention cron (e.g. DELETE WHERE usage_date <
-- CURRENT_DATE - INTERVAL '30 days') can find old rows quickly without
-- scanning every user.
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_date
  ON ai_usage_daily(usage_date);

ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;

-- Users may read their own daily usage (so the UI can show "X of 5 used").
-- Wrapped in (SELECT auth.uid()) for plan caching — see PostgREST RLS notes.
DROP POLICY IF EXISTS "ai_usage_self_read" ON ai_usage_daily;
CREATE POLICY "ai_usage_self_read" ON ai_usage_daily
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- Writes are service-role only — no INSERT/UPDATE/DELETE policy is created,
-- so anon and authenticated roles cannot mutate counters and bypass quotas.

-- =============================================================================
-- (b) audit_log_dlq — dead-letter queue for failed audit_logs writes
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  details jsonb,
  ip_address text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Order replay by oldest-first via DESC index (we scan with ORDER BY created_at
-- DESC LIMIT N for monitoring; replay job can ORDER BY created_at ASC).
CREATE INDEX IF NOT EXISTS idx_audit_dlq_created
  ON audit_log_dlq(created_at DESC);

ALTER TABLE audit_log_dlq ENABLE ROW LEVEL SECURITY;
-- No policies — service-role only. Anon/authenticated cannot read or write.
