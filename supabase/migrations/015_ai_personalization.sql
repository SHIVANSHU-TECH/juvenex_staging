-- 015: AI Personalization consent + sleep tracking
--
-- Adds three columns to `profiles`:
--   * ai_personalization_consent       — explicit opt-in flag for letting the
--     AI chat assistant read profile / patient_profile / intake data to
--     personalize responses. DEFAULT FALSE (HIPAA minimum-necessary default).
--   * ai_personalization_consent_at    — timestamp of the most recent opt-in.
--     Cleared (set to NULL) when consent is revoked, so audit history lives
--     solely in audit_logs.
--   * sleep_hours_avg                  — rolling self-reported average sleep
--     (hours, one decimal). Surfaces as a personalization signal so the
--     model can reference recovery when relevant.
--
-- RLS: profiles already has owner-scoped SELECT/UPDATE policies from
--      001_initial_schema.sql + 003_security_fixes.sql. These new columns
--      are therefore covered by the existing "Users can read own profile"
--      and "Users can update own profile" policies — no new policies needed.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_personalization_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_personalization_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sleep_hours_avg numeric(3,1);

COMMENT ON COLUMN profiles.ai_personalization_consent IS
  'User opt-in for personalized AI chat responses. When true, server-side AI routes may inject patient_profile / intake context into the system prompt. Defaults to false (minimum-necessary).';
COMMENT ON COLUMN profiles.ai_personalization_consent_at IS
  'Timestamp of most recent consent grant. Cleared on revocation. Historical consent events live in audit_logs.';
COMMENT ON COLUMN profiles.sleep_hours_avg IS
  'Rolling self-reported average sleep in hours (0.0-24.0). Optional personalization signal — NULL when unknown.';

-- Sanity constraint — sleep is bounded between 0 and 24 hours.
-- Named constraint so it can be rolled back cleanly if needed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_sleep_hours_avg_bounds'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_sleep_hours_avg_bounds
      CHECK (sleep_hours_avg IS NULL OR (sleep_hours_avg >= 0 AND sleep_hours_avg <= 24));
  END IF;
END $$;
