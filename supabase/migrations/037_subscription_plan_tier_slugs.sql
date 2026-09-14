-- 037: Allow canonical marketplace tier slugs as subscription plans.
--
-- Migration 031 restricted subscriptions.plan to the old 3-tier vocabulary
-- (base / tier_2 / unlimited), but the register flow and upgrade flow now
-- write the 4 canonical tier slugs from src/lib/marketplace-access.ts
-- (metabolic_reset / optimization / optimization_metabolic /
-- completely_optimized). Inserts with the new slugs violated
-- subscriptions_plan_check (seen in production logs Jun 3-5, 2026), leaving
-- paid-tier signups with no subscription row at all.
--
-- Reads go through PLAN_ALIASES so both vocabularies stay readable; this
-- migration just lets the new vocabulary persist.

BEGIN;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (
    plan IN (
      -- legacy values (kept for existing rows)
      'monthly',
      'annual',
      'base',
      'tier_2',
      'unlimited',
      -- canonical tier slugs (src/lib/marketplace-access.ts)
      'metabolic_reset',
      'optimization',
      'optimization_metabolic',
      'completely_optimized'
    )
  );

COMMENT ON COLUMN public.subscriptions.plan IS
  'Marketplace access plan. Canonical values are the tier slugs from marketplace-access.ts; legacy monthly/annual/base/tier_2/unlimited map to tiers via PLAN_ALIASES in application code.';

COMMIT;
