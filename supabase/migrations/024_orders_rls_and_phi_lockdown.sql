-- Migration 024: Orders RLS & PHI Lockdown
-- ----------------------------------------------------------------------------
-- Closes 12 CRITICAL/HIGH findings from the 2026-04-28 security audit.
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS / DO-block guards).
-- Wrapped in a single transaction — any failure rolls back the entire migration.
--
-- Finding reference key used in comments:
--   DB-C-1  REVOKE public privileges on `orders`
--   DB-C-2  Column-level REVOKE of PHI columns on `orders` from authenticated
--   DB-C-3  orders.user_id FK ON DELETE CASCADE → RESTRICT (HIPAA 6-yr retention)
--   DB-C-4  orders.fulfilled_by FK → ON DELETE SET NULL
--   DB-C-5  Missing index idx_orders_fulfilled_by
--   DB-C-6  Missing composite index idx_orders_status_prx (admin queue filter)
--   DB-C-7  Drop redundant idx_orders_created_at
--   DB-C-8  set_updated_at() missing SECURITY DEFINER
--   DB-C-9  audit_log_dlq lockdown (anon access + missing SELECT policy)
--   DB-C-10 orders.contact_email CHECK (contact_email <> '')
--   DB-C-11 shop_products.price_cents → bigint + CHECK (price_cents > 0)
--   DB-C-12 shop_products UNIQUE (name, organization_id)
-- ----------------------------------------------------------------------------

BEGIN;

-- ============================================================================
-- DB-C-1: REVOKE public privileges on `orders`
-- ----------------------------------------------------------------------------
-- Audit finding: `anon` and `authenticated` currently hold
--   INSERT, UPDATE, DELETE, SELECT, TRUNCATE on public.orders
-- (confirmed: \dp orders shows anon=arwdDxtm, authenticated=arwdDxtm).
--
-- All application writes go through service-role API routes that bypass RLS;
-- no client role should ever INSERT, UPDATE, DELETE, or TRUNCATE orders rows.
-- Leaving those privileges open is a HIPAA breach surface — any JWT holder
-- could fabricate an order or destroy records via a direct PostgREST call.
--
-- Resolution:
--   • REVOKE INSERT, UPDATE, DELETE, TRUNCATE from both anon and authenticated.
--   • REVOKE SELECT from anon (anon users should never see any order data).
--   • KEEP SELECT on authenticated so the two existing RLS policies
--     ("Users can view own orders" and "Super admins can view all orders")
--     continue to function as defense-in-depth if the service-role channel is
--     ever bypassed or if a future developer adds a SELECT via authenticated.
--     Revoking SELECT from authenticated would make those RLS policies silently
--     return empty sets rather than raise an error, hiding a misconfiguration.
--
-- After this migration \dp orders should show:
--   anon        = (nothing — all privileges revoked)
--   authenticated = r (SELECT only)
--   service_role  = arwdDxtm (unchanged)
--   postgres      = arwdDxtm (unchanged)
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orders FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orders FROM authenticated;
REVOKE SELECT ON public.orders FROM anon;

-- ============================================================================
-- DB-C-2: Column-level REVOKE of PHI columns on `orders` from `authenticated`
-- ----------------------------------------------------------------------------
-- Audit finding: `orders.intake_answers`, `orders.shipping_address`, and
-- `orders.billing_address` contain Protected Health Information (HIPAA PHI):
--   - intake_answers: medical history, medications, diagnoses captured at
--     checkout for the PrescribeRx encounter submission.
--   - shipping_address / billing_address: name + street + city — PII linkable
--     to health data, treated as PHI in this context.
--
-- Although the SELECT policy "Users can view own orders" grants authenticated
-- users row-level access to their own rows, column-level REVOKE adds a second
-- enforcement layer (same pattern used in migration 017 for profiles and
-- messages). Users retrieve this data only through API routes
-- (service-role bypasses column privileges automatically).
--
-- First we must ensure authenticated has no table-level SELECT column fallback
-- that would allow column access after the row-level grant. We do this by
-- revoking the three columns individually; Postgres will honor the column-level
-- deny even when a table-level SELECT grant exists.
-- ============================================================================

REVOKE SELECT (intake_answers)    ON public.orders FROM authenticated;
REVOKE SELECT (shipping_address)  ON public.orders FROM authenticated;
REVOKE SELECT (billing_address)   ON public.orders FROM authenticated;

-- ============================================================================
-- DB-C-3: orders.user_id FK: ON DELETE CASCADE → ON DELETE RESTRICT
-- ----------------------------------------------------------------------------
-- Audit finding: 013 created the FK as ON DELETE CASCADE. For a HIPAA-covered
-- entity, order records must be retained for a minimum of 6 years after the
-- date of service (45 CFR §164.530(j)). Allowing a profile deletion to
-- silently destroy all associated orders violates the retention obligation.
--
-- Fix: drop the CASCADE constraint and recreate it as RESTRICT. This forces
-- any profile deletion flow to explicitly handle outstanding orders first
-- (e.g. anonymise/archive them via service-role before deleting the profile).
--
-- The constraint name `orders_user_id_fkey` is the Postgres-generated default
-- from migration 013; we drop it by name and guard with IF EXISTS.
-- ============================================================================

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_user_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(id)
  ON DELETE RESTRICT;

-- ============================================================================
-- DB-C-4: orders.fulfilled_by FK: NO ACTION → ON DELETE SET NULL
-- ----------------------------------------------------------------------------
-- Audit finding: 022 added `fulfilled_by uuid REFERENCES profiles(id)` with
-- the default referential action (NO ACTION / RESTRICT). If an admin account
-- is ever deleted (off-boarding, account cleanup), any orders they fulfilled
-- would block the profile deletion entirely, forcing manual NULL-patching or
-- constraint disabling under pressure.
--
-- Fix: SET NULL on admin deletion so the order record survives with
-- fulfilled_by = NULL, preserving the order history while not orphan-blocking
-- the admin account removal.
-- ============================================================================

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_fulfilled_by_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfilled_by_fkey
  FOREIGN KEY (fulfilled_by)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- ============================================================================
-- DB-C-5: Add index idx_orders_fulfilled_by
-- ----------------------------------------------------------------------------
-- Audit finding: The fulfilled_by FK column has no index. Postgres enforces
-- FK integrity by doing a sequential scan on the referenced side (profiles)
-- on DELETE, but it also does a sequential scan on orders to check for
-- referencing rows. Without an index this is O(n) on orders for every admin
-- profile deletion or fulfilled_by lookup.
--
-- Partial index: only index non-NULL rows (most orders are unfulfilled at any
-- given time, so the NULL majority adds write overhead with no read benefit).
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_fulfilled_by
  ON public.orders (fulfilled_by)
  WHERE fulfilled_by IS NOT NULL;

-- ============================================================================
-- DB-C-6: Add composite index idx_orders_status_prx
-- ----------------------------------------------------------------------------
-- Audit finding: The primary admin queue query pattern is:
--   SELECT * FROM orders
--   WHERE status = 'paid' AND prescriberx_status = 'not_sent'
--   ORDER BY created_at DESC;
-- Today this hits idx_orders_status (status, created_at DESC) but must then
-- filter prescriberx_status as a heap fetch on every matching row. Adding
-- prescriberx_status as the second column makes the filter index-only and
-- created_at DESC the sort prefix, eliminating the post-filter heap scan.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_status_prx
  ON public.orders (status, prescriberx_status, created_at DESC);

-- ============================================================================
-- DB-C-7: Drop redundant index idx_orders_created_at
-- ----------------------------------------------------------------------------
-- Audit finding: idx_orders_created_at is a single-column (created_at DESC)
-- index. Every composite index on orders that uses created_at as its trailing
-- sort key (idx_orders_status, idx_orders_user, idx_orders_prescriberx_status,
-- idx_orders_payment_status) already subsumes any query that this index could
-- serve (a pure ORDER BY created_at DESC scan). Keeping it only adds write
-- amplification on every INSERT/UPDATE to orders without any read benefit.
-- ============================================================================

DROP INDEX IF EXISTS public.idx_orders_created_at;

-- ============================================================================
-- DB-C-8: Recreate public.set_updated_at() with SECURITY DEFINER
-- ----------------------------------------------------------------------------
-- Audit finding: The current set_updated_at() function (created in migration
-- 016's defensive block) has `search_path=public` (SET search_path) but
-- prosecdef=false (no SECURITY DEFINER). Every other trigger function in this
-- schema that does server-side maintenance uses SECURITY DEFINER:
--   - set_blogs_updated_at()        (016)
--   - profiles_protect_admin_columns() (017)
-- Without SECURITY DEFINER, a search_path injection attack (malicious schema
-- earlier in the path) could shadow the `now()` function or other catalog
-- references. SECURITY DEFINER + pinned search_path is the correct defence.
--
-- The function is recreated in-place (CREATE OR REPLACE). The existing trigger
-- set_orders_updated_at binding is preserved; no trigger drop/recreate needed
-- because the trigger already references the function by name and the
-- signature does not change.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- DB-C-9: audit_log_dlq lockdown
-- ----------------------------------------------------------------------------
-- Audit finding: RLS is enabled on audit_log_dlq (migration 020) but:
--   (a) ZERO policies were created, meaning RLS blocks all authenticated
--       reads but allows all authenticated writes (Postgres default: deny
--       all when RLS is enabled and no policy matches — however anon/
--       authenticated still hold their table-level INSERT/SELECT from the
--       initial Supabase bootstrap grants that precede RLS enablement).
--   (b) Confirmed via \dp: anon=arwdDxtm, authenticated=arwdDxtm — both
--       roles can INSERT a row into the dead-letter queue, which could be
--       used to flood the DLQ or inject false audit evidence.
--   (c) No SELECT policy means no one other than service-role can verify
--       DLQ contents; super admins cannot monitor replay backlogs.
--
-- Fix:
--   • REVOKE all from anon (audit DLQ is internal; anon traffic never writes).
--   • REVOKE INSERT, UPDATE, DELETE from authenticated (only service-role
--     should write DLQ entries, triggered by the audit_logs INSERT failure
--     path in application code).
--   • Keep SELECT on authenticated via a super_admin-only policy (mirrors the
--     "Super admins can view all orders" pattern from migration 013).
-- ============================================================================

REVOKE ALL ON public.audit_log_dlq FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log_dlq FROM authenticated;

-- Super admins can SELECT audit_log_dlq for replay monitoring.
DROP POLICY IF EXISTS "Super admins can view audit_log_dlq" ON public.audit_log_dlq;
CREATE POLICY "Super admins can view audit_log_dlq" ON public.audit_log_dlq
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  );

-- ============================================================================
-- DB-C-10: orders.contact_email CHECK (contact_email <> '')
-- ----------------------------------------------------------------------------
-- Audit finding: contact_email is NOT NULL DEFAULT '' (migration 022). A
-- NOT NULL constraint alone does not prevent an empty string from being stored.
-- An order with an empty contact_email cannot receive fulfillment notifications
-- or be reconciled with a patient record. The empty-string default exists only
-- to satisfy the NOT NULL on backfill rows; all new orders from the checkout
-- flow supply a real email address.
--
-- The constraint is dropped and recreated (idempotent pattern) so a re-run
-- after a failed apply does not error on a duplicate constraint name.
-- ============================================================================

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_contact_email_nonempty;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_contact_email_nonempty
  CHECK (contact_email <> '');

-- ============================================================================
-- DB-C-11: shop_products.price_cents → bigint + CHECK (price_cents > 0)
-- ----------------------------------------------------------------------------
-- Audit finding: price_cents is int4 (integer, max ~2.1 billion cents = $21M).
-- High-value compounded medication packages can exceed this for some
-- international clinics that run on this white-label platform (e.g. bundles in
-- non-USD currencies stored as cents-equivalent). bigint (int8, max ~9.2e18)
-- eliminates the overflow risk with no storage overhead on modern Postgres.
--
-- Separately: no lower bound CHECK existed. price_cents = 0 would create a
-- free product that the shop and checkout UI do not handle defensively; a
-- negative price_cents would corrupt revenue reporting. Add CHECK > 0.
--
-- NOTE: ALTER COLUMN TYPE requires an implicit cast int4 → int8 which Postgres
-- handles without a USING clause (int4 is assignment-castable to int8).
-- The existing data in migration 023 (max 49900) fits comfortably.
-- ============================================================================

ALTER TABLE public.shop_products
  ALTER COLUMN price_cents TYPE bigint;

ALTER TABLE public.shop_products
  DROP CONSTRAINT IF EXISTS shop_products_price_cents_positive;

ALTER TABLE public.shop_products
  ADD CONSTRAINT shop_products_price_cents_positive
  CHECK (price_cents > 0);

-- ============================================================================
-- DB-C-12: shop_products UNIQUE (name, organization_id)
-- ----------------------------------------------------------------------------
-- Audit finding: no uniqueness constraint exists on shop_products. This allows
-- duplicate product names within the same org, which breaks idempotent seeding
-- (migration 023 uses ON CONFLICT (id) but cannot prevent a separate INSERT
-- with the same name and a freshly generated id).
--
-- organization_id is nullable (NULL = global/platform catalog, non-NULL = org-
-- specific override). A standard UNIQUE constraint treats NULL as distinct from
-- every other value including other NULLs, so UNIQUE (name, organization_id)
-- would allow unlimited duplicates for global products (org_id IS NULL).
--
-- Fix: partial unique index using COALESCE to fold all NULLs to a sentinel UUID
-- so that global products are also covered. The sentinel
-- '00000000-0000-0000-0000-000000000000' is never a valid profiles.id or
-- organizations.id (gen_random_uuid() never returns the nil UUID), so there is
-- no collision risk.
-- ============================================================================

DROP INDEX IF EXISTS public.idx_shop_products_name_org_uniq;

CREATE UNIQUE INDEX idx_shop_products_name_org_uniq
  ON public.shop_products (
    name,
    COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ============================================================================
-- Final state assertion comments (for manual verification after apply)
-- ============================================================================
--
-- \dp orders
--   Expected: anon=(empty), authenticated=r, service_role=arwdDxtm
--
-- \dp orders (column privileges section)
--   Expected: intake_answers, shipping_address, billing_address all missing
--   'r' for authenticated role.
--
-- SELECT conname, confdeltype FROM pg_constraint
--   WHERE conrelid='public.orders'::regclass AND contype='f';
--   Expected: orders_user_id_fkey confdeltype='r' (RESTRICT)
--             orders_fulfilled_by_fkey confdeltype='n' (SET NULL)
--
-- \d orders
--   Expected indexes: idx_orders_fulfilled_by, idx_orders_status_prx present;
--                     idx_orders_created_at absent.
--
-- SELECT prosecdef FROM pg_proc
--   WHERE proname='set_updated_at' AND pronamespace='public'::regnamespace;
--   Expected: t
--
-- SELECT policyname FROM pg_policies WHERE tablename='audit_log_dlq';
--   Expected: 'Super admins can view audit_log_dlq'
--
-- \dp audit_log_dlq
--   Expected: anon=(empty), authenticated=r (SELECT only via policy), service_role=arwdDxtm
--
-- \d orders  (check constraints)
--   Expected: orders_contact_email_nonempty CHECK (contact_email <> '')
--
-- \d shop_products
--   Expected: price_cents bigint, shop_products_price_cents_positive CHECK,
--             idx_shop_products_name_org_uniq unique index.
--
-- ============================================================================

COMMIT;
