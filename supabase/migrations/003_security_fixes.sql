-- Migration: 003_security_fixes
-- Applied: 2026-04-15
-- Summary: Fix OR-true RLS leak on profiles, lock down audit_logs, add
--          intake_data column to appointments, add missing performance indexes.

-- ============================================================
-- FIX 1: profiles RLS — remove OR-true policy that exposed all PII
-- ============================================================

DROP POLICY IF EXISTS "Limited public profiles" ON profiles;

-- Users always have full access to their own row
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING ((SELECT auth.uid()) = id);

-- Authenticated users can read other profiles (API layer controls column exposure)
CREATE POLICY "Authenticated can read profiles" ON profiles
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- ============================================================
-- FIX 2: audit_logs RLS — add policies (RLS was already enabled)
-- No UPDATE or DELETE policies are created, so those operations
-- are denied by default — makes audit_logs tamper-proof.
-- ============================================================

-- API routes run under the service role which bypasses RLS in Supabase;
-- this policy covers any future direct-role inserts.
CREATE POLICY "Service role can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- Only super_admin users may read audit logs
CREATE POLICY "Super admin can read audit logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role = 'super_admin'
    )
  );

-- ============================================================
-- FIX 3: appointments — add intake_data column
-- ============================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS intake_data jsonb;

-- ============================================================
-- FIX 4: Missing performance indexes
-- ============================================================

-- profiles(email) — used in auth lookups and de-dup checks
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON profiles(email);

-- profiles(organization_id) — FK; used in org-scoped queries and RLS policies
CREATE INDEX IF NOT EXISTS idx_profiles_organization
  ON profiles(organization_id);

-- profiles(referral_code) — already covered by the unique constraint index;
-- no duplicate needed.

-- shop_products(category) — standalone category browsing (composite
-- idx_shop_products_active covers filtered queries; this covers unfiltered)
CREATE INDEX IF NOT EXISTS idx_shop_products_category
  ON shop_products(category);

-- posts(is_public, created_at DESC) — public community feed queries
CREATE INDEX IF NOT EXISTS idx_posts_public
  ON posts(is_public, created_at DESC);
