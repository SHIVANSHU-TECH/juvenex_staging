-- Migration 023: Seed shop_products with canonical catalog
--
-- Production shop_products is empty, and the API previously fell back to a
-- seed list whose entries had no `id` field — that crashed checkout because
-- the payments API rejects non-UUID product IDs.
--
-- This migration inserts a small, canonical catalog so the shop renders real
-- DB rows with valid UUIDs. The fallback in /api/shop/products has been
-- removed in the same change.
--
-- Categories MUST match the shop filter list exactly (see src/app/shop/page.tsx):
--   'GLP1' | 'Peptides' | 'Supplements'
-- and the prescription gate (see src/app/checkout/_components/types.ts):
--   PRESCRIPTION_CATEGORIES = { 'GLP1', 'Peptides' }
--
-- Idempotent: safe to re-run. Uses fixed UUIDs + ON CONFLICT (id) DO NOTHING.

INSERT INTO shop_products (id, name, description, price_cents, category, image_url, is_active, organization_id)
VALUES
  -- GLP-1 (prescription)
  (
    '11111111-1111-4111-8111-000000000001',
    'Compounded Semaglutide',
    'Compounded semaglutide for weight management. Once-weekly subcutaneous injection. Requires telehealth consultation and prescription approval.',
    34900,
    'GLP1',
    NULL,
    true,
    NULL
  ),
  (
    '11111111-1111-4111-8111-000000000002',
    'Compounded Tirzepatide',
    'Compounded tirzepatide for weight management. Dual GIP/GLP-1 receptor agonist. Once-weekly subcutaneous injection. Prescription required.',
    49900,
    'GLP1',
    NULL,
    true,
    NULL
  ),

  -- Peptides (prescription)
  (
    '22222222-2222-4222-8222-000000000001',
    'BPC-157',
    'Body Protection Compound 157. Research peptide studied for tissue repair and recovery support. Subcutaneous injection. Prescription required.',
    18900,
    'Peptides',
    NULL,
    true,
    NULL
  ),
  (
    '22222222-2222-4222-8222-000000000002',
    'TB-500',
    'Thymosin Beta-4 fragment. Research peptide studied for cellular repair and recovery. Subcutaneous injection. Prescription required.',
    22900,
    'Peptides',
    NULL,
    true,
    NULL
  ),

  -- Supplements (over the counter)
  (
    '33333333-3333-4333-8333-000000000001',
    'Magnesium Glycinate',
    'Highly bioavailable chelated magnesium. Supports muscle relaxation, sleep quality, and metabolic function. 90 capsules, 200mg per serving.',
    2900,
    'Supplements',
    NULL,
    true,
    NULL
  ),
  (
    '33333333-3333-4333-8333-000000000002',
    'Vitamin D3 + K2',
    'Combined vitamin D3 (5000 IU) and vitamin K2 (MK-7) for bone health and calcium metabolism. 60 softgels.',
    2400,
    'Supplements',
    NULL,
    true,
    NULL
  )
ON CONFLICT (id) DO NOTHING;
