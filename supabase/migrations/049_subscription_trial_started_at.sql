-- ============================================================================
-- 049: subscriptions.trial_started_at
--
-- The 7-day card-required free trial (feature flag
-- NEXT_PUBLIC_MEMBERSHIP_TRIAL_ENABLED) must be one-per-user: once a member has
-- consumed their trial we never grant a second $0 window, or the paywall is
-- trivially reset by re-running checkout.
--
-- This column stamps when a user's trial was started (card captured on the Kurv
-- hosted page). The trial-eligibility check reads it: a non-NULL value on ANY of
-- the user's subscription rows means "already trialed → charge normally".
--
-- NULL = never trialed. Set once at trial start; never cleared.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;

-- Fast "has this user ever trialed?" lookup (partial: only trialed rows).
CREATE INDEX IF NOT EXISTS subscriptions_trial_started_idx
  ON public.subscriptions (user_id)
  WHERE trial_started_at IS NOT NULL;
