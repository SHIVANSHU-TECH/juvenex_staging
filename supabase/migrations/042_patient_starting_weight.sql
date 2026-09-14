-- ============================================================================
-- 042: patient_profiles.starting_weight
--
-- The Profile / Dashboard "goal %" math needs a fixed baseline to measure
-- progress against. Previously the code read `patient_profiles.starting_weight`
-- but the column never existed (001 only created current_weight / target_weight),
-- so the baseline silently fell back to the first logged weight and the goal %
-- frequently computed to 0%.
--
-- This adds the column so the user can pin an explicit starting weight when they
-- set their goal. NULL is allowed; callers fall back to the earliest weight
-- entry when it is not set.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ============================================================================

ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS starting_weight numeric;
