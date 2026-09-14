-- 031: Marketplace access tiers for payment-processor rollout.
--
-- Braeden's tier model:
--   Base       -> Weight loss (Semaglutide, Tirzepatide)
--   Tier 2     -> Weight loss + Metabolic/energy + Sexual health
--   Unlimited  -> all groups, including Recovery
--
-- The product-group mapping is enforced in application code from product
-- names/categories so it works against both the upstream PrescribeRx catalog
-- and the local fallback shop_products table. This migration only prepares
-- persisted subscription plan values and fills the local fallback catalog.

BEGIN;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (
    plan IN (
      'monthly',
      'annual',
      'base',
      'tier_2',
      'unlimited'
    )
  );

COMMENT ON COLUMN public.subscriptions.plan IS
  'Marketplace access plan. Legacy monthly/annual map to base in application code.';

UPDATE public.shop_products
SET category = 'Weight loss'
WHERE lower(name) LIKE '%semaglutide%'
   OR lower(name) LIKE '%tirzepatide%';

INSERT INTO public.shop_products
  (id, name, description, price_cents, category, image_url, is_active, organization_id)
VALUES
  (
    '44444444-4444-4444-8444-000000000001',
    'NAD+',
    'NAD+ therapy product for metabolic and cellular energy support. Requires provider review where applicable.',
    19900,
    'Metabolic/energy',
    NULL,
    true,
    NULL
  ),
  (
    '44444444-4444-4444-8444-000000000002',
    'SS31',
    'SS31 peptide product for mitochondrial and metabolic support. Requires provider review where applicable.',
    24900,
    'Metabolic/energy',
    NULL,
    true,
    NULL
  ),
  (
    '55555555-5555-4555-8555-000000000001',
    'Oxytocin',
    'Oxytocin product for sexual health support. Requires provider review where applicable.',
    14900,
    'Sexual health',
    NULL,
    true,
    NULL
  ),
  (
    '55555555-5555-4555-8555-000000000002',
    'PT-141',
    'PT-141 product for sexual health support. Requires provider review where applicable.',
    17900,
    'Sexual health',
    NULL,
    true,
    NULL
  ),
  (
    '66666666-6666-4666-8666-000000000001',
    'Tesamorelin',
    'Tesamorelin peptide product for recovery support. Requires provider review where applicable.',
    29900,
    'Recovery',
    NULL,
    true,
    NULL
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active;

COMMIT;
