-- 026: Per-tenant product overrides, packages, prescription unlocks, and a
-- marketing-leads mirror.
--
-- NOTE ON NUMBERING: The original task spec referenced this as "migration 022",
-- written against a snapshot where 021_org_branding.sql was the latest file.
-- Since then, 022_orders_checkout_extend.sql, 023_seed_shop_products.sql,
-- 024_orders_rls_and_phi_lockdown.sql, and 025_encrypt_orders_phi.sql have
-- already been authored and applied. Reusing 022 would overwrite an applied
-- production migration and corrupt the migration history, so this work lands
-- as 026 instead. Scope and intent are unchanged.
--
-- What this migration adds:
--   1. tenant_product_overrides — which PrescribeRx SKUs each tenant has
--      toggled on/off, plus optional absolute price override.
--   2. packages — pricing/membership packages defined per-org
--      (e.g. "GLP package", "Peptide package").
--   3. product_packages — many-to-many: which products each package unlocks.
--   4. prescription_unlocks — when a doctor issues an Rx, this row makes the
--      product purchasable for that patient. PrescribeRx patient/prescription
--      ids are stored as text since they are external (not local FKs).
--   5. marketing_leads — Juvenex-side mirror of non-PHI contact info collected
--      via the telehealth intake. Used for re-marketing/email campaigns; NOT
--      to be considered the source of truth for medical data.
--
-- Conventions mirrored from 011/013/020/024:
--   • CREATE TABLE IF NOT EXISTS, IF NOT EXISTS on every index, CREATE OR
--     REPLACE on functions, DROP POLICY IF EXISTS before each CREATE POLICY.
--   • RLS enabled on every new table with explicit policies.
--   • super_admin gets FOR ALL via a profiles.role = 'super_admin' EXISTS
--     subquery (pattern from 011_blogs.sql blogs_admin_all).
--   • org_admin is scoped to (organization_id = profile.organization_id).
--   • updated_at columns piggyback on the existing public.set_updated_at()
--     trigger function defined in 016 and hardened in 024 (SECURITY DEFINER
--     + pinned search_path).
--
-- Wrapped in a single transaction so a partial failure rolls back cleanly.

BEGIN;

-- ============================================================================
-- Extension prerequisites
-- ============================================================================
-- citext is not enabled by any prior migration. marketing_leads.email needs it
-- for case-insensitive uniqueness on (organization_id, email). Idempotent.
CREATE EXTENSION IF NOT EXISTS citext;

-- gen_random_uuid() comes from pgcrypto, which Supabase enables on every
-- project by default. Migrations 011, 020, 024 all use it without an explicit
-- CREATE EXTENSION; we follow the same convention here.

-- ============================================================================
-- 1. tenant_product_overrides
-- ----------------------------------------------------------------------------
-- Per-org toggle of upstream PrescribeRx SKUs plus optional absolute price
-- override. Reads happen server-side; the effective catalog API joins this
-- table to filter the upstream PrescribeRx product list per tenant.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_product_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  product_id          text NOT NULL,
  included            boolean NOT NULL DEFAULT true,
  price_override_cents integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  CONSTRAINT tenant_product_overrides_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
    ON DELETE CASCADE,
  CONSTRAINT tenant_product_overrides_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  CONSTRAINT tenant_product_overrides_org_product_uniq
    UNIQUE (organization_id, product_id),
  CONSTRAINT tenant_product_overrides_price_override_nonneg
    CHECK (price_override_cents IS NULL OR price_override_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_tenant_product_overrides_org
  ON public.tenant_product_overrides (organization_id);

DROP TRIGGER IF EXISTS trg_tenant_product_overrides_updated_at
  ON public.tenant_product_overrides;
CREATE TRIGGER trg_tenant_product_overrides_updated_at
  BEFORE UPDATE ON public.tenant_product_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tenant_product_overrides ENABLE ROW LEVEL SECURITY;

-- super_admin: full access (mirrors blogs_admin_all in 011).
DROP POLICY IF EXISTS tpo_super_admin_all ON public.tenant_product_overrides;
CREATE POLICY tpo_super_admin_all ON public.tenant_product_overrides
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  );

-- org_admin: scoped CRUD within their own organization.
DROP POLICY IF EXISTS tpo_org_admin_all ON public.tenant_product_overrides;
CREATE POLICY tpo_org_admin_all ON public.tenant_product_overrides
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'org_admin'
        AND profiles.organization_id = tenant_product_overrides.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'org_admin'
        AND profiles.organization_id = tenant_product_overrides.organization_id
    )
  );

-- Patients: no direct access. The effective-catalog API runs server-side with
-- service-role and applies the override filter before responding.

-- ============================================================================
-- 2. packages
-- ----------------------------------------------------------------------------
-- Per-org pricing/membership package definitions (e.g. "GLP package").
-- Patients need read access on active rows so the shop can render gating
-- messages ("you need package X to purchase Y").
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name            text NOT NULL,
  slug            text NOT NULL,
  description     text,
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT packages_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
    ON DELETE CASCADE,
  CONSTRAINT packages_org_slug_uniq UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_packages_org_active
  ON public.packages (organization_id, is_active);

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS packages_super_admin_all ON public.packages;
CREATE POLICY packages_super_admin_all ON public.packages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS packages_org_admin_all ON public.packages;
CREATE POLICY packages_org_admin_all ON public.packages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'org_admin'
        AND profiles.organization_id = packages.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'org_admin'
        AND profiles.organization_id = packages.organization_id
    )
  );

-- Patients: read-only on active packages within their own org.
DROP POLICY IF EXISTS packages_patient_read ON public.packages;
CREATE POLICY packages_patient_read ON public.packages
  FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.organization_id = packages.organization_id
    )
  );

-- ============================================================================
-- 3. product_packages
-- ----------------------------------------------------------------------------
-- Many-to-many: which PrescribeRx products each package unlocks. Read access
-- is inherited transitively (a patient who can read a package can read its
-- product mappings to render the gating UI).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.product_packages (
  package_id uuid NOT NULL,
  product_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_packages_pkey PRIMARY KEY (package_id, product_id),
  CONSTRAINT product_packages_package_id_fkey
    FOREIGN KEY (package_id) REFERENCES public.packages(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_packages_product
  ON public.product_packages (product_id);

ALTER TABLE public.product_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_packages_super_admin_all ON public.product_packages;
CREATE POLICY product_packages_super_admin_all ON public.product_packages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  );

-- org_admin and patient policies derive package ownership via the parent
-- packages row (a single EXISTS that joins through packages → profiles).
DROP POLICY IF EXISTS product_packages_org_admin_all ON public.product_packages;
CREATE POLICY product_packages_org_admin_all ON public.product_packages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.packages pk
      JOIN public.profiles p ON p.organization_id = pk.organization_id
      WHERE pk.id = product_packages.package_id
        AND p.id = (SELECT auth.uid())
        AND p.role = 'org_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.packages pk
      JOIN public.profiles p ON p.organization_id = pk.organization_id
      WHERE pk.id = product_packages.package_id
        AND p.id = (SELECT auth.uid())
        AND p.role = 'org_admin'
    )
  );

DROP POLICY IF EXISTS product_packages_patient_read ON public.product_packages;
CREATE POLICY product_packages_patient_read ON public.product_packages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.packages pk
      JOIN public.profiles p ON p.organization_id = pk.organization_id
      WHERE pk.id = product_packages.package_id
        AND pk.is_active = true
        AND p.id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- 4. prescription_unlocks
-- ----------------------------------------------------------------------------
-- One row per (org, PrescribeRx patient ref, product) that an Rx has unlocked
-- for purchase. Patient identification is via PrescribeRx UUID stored as text
-- (provider_patient_ref already exists on appointments per migration 019);
-- a future migration may also add it to profiles for direct patient SELECT.
-- For now patient reads are deferred to API enforcement (service-role).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.prescription_unlocks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL,
  provider_patient_ref text NOT NULL,
  product_id           text NOT NULL,
  prescription_ref     text,
  unlocked_at          timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz,
  revoked_at           timestamptz,
  CONSTRAINT prescription_unlocks_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
    ON DELETE CASCADE,
  CONSTRAINT prescription_unlocks_org_patient_product_uniq
    UNIQUE (organization_id, provider_patient_ref, product_id)
);

CREATE INDEX IF NOT EXISTS idx_prescription_unlocks_patient
  ON public.prescription_unlocks (provider_patient_ref);
CREATE INDEX IF NOT EXISTS idx_prescription_unlocks_org_product
  ON public.prescription_unlocks (organization_id, product_id);

ALTER TABLE public.prescription_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prescription_unlocks_super_admin_all
  ON public.prescription_unlocks;
CREATE POLICY prescription_unlocks_super_admin_all
  ON public.prescription_unlocks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS prescription_unlocks_org_admin_all
  ON public.prescription_unlocks;
CREATE POLICY prescription_unlocks_org_admin_all
  ON public.prescription_unlocks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'org_admin'
        AND profiles.organization_id = prescription_unlocks.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'org_admin'
        AND profiles.organization_id = prescription_unlocks.organization_id
    )
  );

-- Patient SELECT is intentionally denied at the RLS layer until profiles.id
-- can be linked to provider_patient_ref. The shop API resolves a patient's
-- unlocks server-side via service-role and the appointment join.
DROP POLICY IF EXISTS prescription_unlocks_patient_deny
  ON public.prescription_unlocks;
CREATE POLICY prescription_unlocks_patient_deny
  ON public.prescription_unlocks
  FOR SELECT
  TO authenticated
  USING (false);

-- ============================================================================
-- 5. marketing_leads
-- ----------------------------------------------------------------------------
-- Juvenex-side mirror of non-PHI contact info collected via the telehealth
-- intake. NOT a source of truth for medical data — used for re-marketing/email
-- campaigns. Upserts on (organization_id, email) refresh last_seen_at.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL,
  email                citext NOT NULL,
  first_name           text,
  last_name            text,
  dob                  date,
  address_line1        text,
  address_line2        text,
  city                 text,
  state                text,
  postal_code          text,
  phone                text,
  source               text NOT NULL DEFAULT 'telehealth_intake',
  provider_patient_ref text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_seen_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_leads_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
    ON DELETE CASCADE,
  CONSTRAINT marketing_leads_org_email_uniq
    UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_org_last_seen
  ON public.marketing_leads (organization_id, last_seen_at DESC);

ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_leads_super_admin_all ON public.marketing_leads;
CREATE POLICY marketing_leads_super_admin_all ON public.marketing_leads
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS marketing_leads_org_admin_all ON public.marketing_leads;
CREATE POLICY marketing_leads_org_admin_all ON public.marketing_leads
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'org_admin'
        AND profiles.organization_id = marketing_leads.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'org_admin'
        AND profiles.organization_id = marketing_leads.organization_id
    )
  );

-- Patients: no access. Marketing leads are an admin-only mirror.

COMMIT;

-- ROLLBACK NOTES:
-- ---------------------------------------------------------------------------
-- To reverse this migration manually (operator only — no automated down step
-- exists). Run inside a transaction; CASCADE handles dependent indexes/policies.
-- The citext extension is intentionally NOT dropped — other tables may adopt
-- it later, and dropping it is destructive across the schema.
--
-- BEGIN;
-- DROP TABLE IF EXISTS public.marketing_leads CASCADE;
-- DROP TABLE IF EXISTS public.prescription_unlocks CASCADE;
-- DROP TABLE IF EXISTS public.product_packages CASCADE;
-- DROP TABLE IF EXISTS public.packages CASCADE;
-- DROP TRIGGER IF EXISTS trg_tenant_product_overrides_updated_at
--   ON public.tenant_product_overrides;
-- DROP TABLE IF EXISTS public.tenant_product_overrides CASCADE;
-- -- DROP EXTENSION citext;  -- intentionally left commented; see note above
-- COMMIT;
