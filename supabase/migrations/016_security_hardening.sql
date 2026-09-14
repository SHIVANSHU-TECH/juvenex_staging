-- Migration 016: Security Hardening
-- ----------------------------------------------------------------------------
-- Addresses CRITICAL/HIGH/MEDIUM/LOW findings from the 4-agent production
-- audit. Every section documents the audit finding it resolves. All
-- statements are idempotent (IF EXISTS / IF NOT EXISTS / DO blocks) so this
-- migration can be re-applied without harm.
--
-- Sections:
--   1. CRITICAL — FK consistency: re-target post_reports + messages FKs from
--      auth.users to profiles so cascades and joins behave consistently with
--      the rest of the schema (which always references profiles, never
--      auth.users directly).
--   2. CRITICAL — messages UPDATE column restriction: enforce that
--      authenticated users can only mutate `read_at` (not body, not addressing).
--   3. HIGH — profiles update column restrictions: prevent self-unban,
--      consent-timestamp spoofing, and role/organization escalation by
--      end-users. Auto-maintain ai_personalization_consent_at + clear
--      banned_from_org_at when membership changes.
--   4. HIGH — Storage UPDATE policy on post-images bucket: 010 created
--      INSERT/SELECT/DELETE policies but no UPDATE policy, so re-uploads to
--      the same path silently failed. Owner-scoped UPDATE added here.
--   5. HIGH — blogs_admin_all policy: replace bare auth.uid() with
--      (SELECT auth.uid()) so PostgreSQL evaluates it once per query, not
--      once per row.
--   6. MEDIUM — set_blogs_updated_at: harden with SECURITY DEFINER and a
--      pinned search_path to match the pattern used by set_updated_at()
--      in migration 007.
--   7. MEDIUM — orders.updated_at: 013 created the table without an
--      updated_at column or trigger; admin status changes need this for
--      audit ordering. Wires the existing public.set_updated_at() helper.
--   8. LOW  — drop redundant indexes left over from earlier migrations.
--   9. LOW  — partial index on profiles for ai_personalization_consent = true
--      so consent-gated queries stay fast as the table grows.
-- ----------------------------------------------------------------------------

BEGIN;

-- ============================================================================
-- 1. CRITICAL — FK INCONSISTENCY: re-target FKs from auth.users to profiles
-- ----------------------------------------------------------------------------
-- Audit finding: post_reports.reporter_id, messages.from_user_id, and
-- messages.to_user_id reference auth.users(id) directly. Every other table
-- in the schema references profiles(id) (which itself FKs to auth.users).
-- This inconsistency means joins on these FKs cannot use profiles columns
-- without an extra hop, and the cascade behavior diverges from the rest of
-- the schema. Constraint names follow the Postgres default pattern
-- (<table>_<col>_fkey) but we resolve them dynamically via pg_constraint
-- to be safe against earlier ad-hoc renames.
-- ============================================================================

-- post_reports.reporter_id: auth.users -> profiles
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.post_reports'::regclass
    AND contype = 'f'
    AND conkey = (
      SELECT array_agg(attnum)
      FROM pg_attribute
      WHERE attrelid = 'public.post_reports'::regclass
        AND attname = 'reporter_id'
    );

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.post_reports DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;

  -- Add new FK only if it does not already point at profiles.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conrelid = 'public.post_reports'::regclass
      AND c.contype = 'f'
      AND r.relname = 'profiles'
      AND n.nspname = 'public'
      AND c.conkey = (
        SELECT array_agg(attnum)
        FROM pg_attribute
        WHERE attrelid = 'public.post_reports'::regclass
          AND attname = 'reporter_id'
      )
  ) THEN
    ALTER TABLE public.post_reports
      ADD CONSTRAINT post_reports_reporter_id_fkey
      FOREIGN KEY (reporter_id)
      REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- messages.from_user_id: auth.users -> profiles
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.messages'::regclass
    AND contype = 'f'
    AND conkey = (
      SELECT array_agg(attnum)
      FROM pg_attribute
      WHERE attrelid = 'public.messages'::regclass
        AND attname = 'from_user_id'
    );

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.messages DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conrelid = 'public.messages'::regclass
      AND c.contype = 'f'
      AND r.relname = 'profiles'
      AND n.nspname = 'public'
      AND c.conkey = (
        SELECT array_agg(attnum)
        FROM pg_attribute
        WHERE attrelid = 'public.messages'::regclass
          AND attname = 'from_user_id'
      )
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_from_user_id_fkey
      FOREIGN KEY (from_user_id)
      REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- messages.to_user_id: auth.users -> profiles
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.messages'::regclass
    AND contype = 'f'
    AND conkey = (
      SELECT array_agg(attnum)
      FROM pg_attribute
      WHERE attrelid = 'public.messages'::regclass
        AND attname = 'to_user_id'
    );

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.messages DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conrelid = 'public.messages'::regclass
      AND c.contype = 'f'
      AND r.relname = 'profiles'
      AND n.nspname = 'public'
      AND c.conkey = (
        SELECT array_agg(attnum)
        FROM pg_attribute
        WHERE attrelid = 'public.messages'::regclass
          AND attname = 'to_user_id'
      )
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_to_user_id_fkey
      FOREIGN KEY (to_user_id)
      REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 2. CRITICAL — messages UPDATE column restriction
-- ----------------------------------------------------------------------------
-- Audit finding: 012's `messages_recipient_update` policy lets a recipient
-- UPDATE any column on rows where to_user_id = auth.uid(). The intent was
-- only "mark as read", i.e. setting read_at. Today a recipient could rewrite
-- their own message body, swap the sender, or back-date created_at.
--
-- Fix: keep the row-level policy (USING + WITH CHECK on to_user_id) but
-- drop the recreated CHECK clause, then enforce column-level immutability
-- via a BEFORE UPDATE trigger that raises when any column other than
-- read_at is changed by a non-service-role caller.
-- ============================================================================

DROP POLICY IF EXISTS messages_recipient_update ON public.messages;
CREATE POLICY messages_recipient_update ON public.messages
  FOR UPDATE
  USING (to_user_id = (SELECT auth.uid()))
  WITH CHECK (to_user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.messages_only_read_at_mutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role bypasses this guard; admin tooling needs full mutation
  -- powers to backfill / reconcile messages.
  IF current_setting('role', true) = 'service_role'
     OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.from_user_id IS DISTINCT FROM OLD.from_user_id
     OR NEW.to_user_id IS DISTINCT FROM OLD.to_user_id
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'Only the read_at column may be updated on messages by non-service callers'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_only_read_at_mutable ON public.messages;
CREATE TRIGGER messages_only_read_at_mutable
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.messages_only_read_at_mutable();

-- ============================================================================
-- 3. HIGH — profiles UPDATE column restrictions
-- ----------------------------------------------------------------------------
-- Audit finding: the existing "Users can update own profile" policy (from
-- 001_initial_schema.sql) lets the owning user mutate every column on their
-- profile row, including `banned_at` (self-unban), `banned_from_org_at`
-- (per-org self-unban), `ai_personalization_consent_at` (consent timestamp
-- spoofing — auditors look at this column), `role` (privilege escalation
-- to org_admin / super_admin), and `organization_id` (jumping into a
-- different white-label).
--
-- Fix: BEFORE UPDATE trigger that:
--   (a) Blocks non-service-role authenticated callers from changing any of
--       the protected admin columns when they are updating their own row.
--   (b) Auto-maintains ai_personalization_consent_at on consent flips so the
--       column stays trustworthy (consent grant -> set now(); revocation ->
--       NULL). Audit history of consent events lives in audit_logs (see
--       migration 015 comments).
--   (c) Auto-clears banned_from_org_at when organization_id changes — a
--       per-org ban only makes sense within the org that issued it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.profiles_protect_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_role text := current_setting('role', true);
  v_jwt_role     text := current_setting('request.jwt.claim.role', true);
  v_caller_uid   uuid := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  v_is_self      boolean := v_caller_uid IS NOT NULL AND v_caller_uid = OLD.id;
  v_is_service   boolean := v_session_role = 'service_role'
                         OR v_jwt_role = 'service_role';
BEGIN
  -- (a) Block self-edits to protected admin columns for authenticated users.
  IF NOT v_is_service
     AND v_session_role = 'authenticated'
     AND v_is_self THEN
    IF NEW.banned_at IS DISTINCT FROM OLD.banned_at THEN
      RAISE EXCEPTION 'banned_at cannot be modified by the profile owner'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.banned_from_org_at IS DISTINCT FROM OLD.banned_from_org_at THEN
      RAISE EXCEPTION 'banned_from_org_at cannot be modified by the profile owner'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.ai_personalization_consent_at IS DISTINCT FROM OLD.ai_personalization_consent_at THEN
      RAISE EXCEPTION 'ai_personalization_consent_at is set automatically and cannot be modified directly'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'role cannot be modified by the profile owner'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'organization_id cannot be modified by the profile owner'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- (b) Auto-maintain ai_personalization_consent_at on consent flips. Runs
  --     for every caller (including users via the existing UPDATE policy),
  --     because the value is derived from `ai_personalization_consent`.
  IF NEW.ai_personalization_consent IS DISTINCT FROM OLD.ai_personalization_consent THEN
    IF NEW.ai_personalization_consent = true
       AND COALESCE(OLD.ai_personalization_consent, false) = false THEN
      NEW.ai_personalization_consent_at := now();
    ELSIF NEW.ai_personalization_consent = false
          AND COALESCE(OLD.ai_personalization_consent, false) = true THEN
      NEW.ai_personalization_consent_at := NULL;
    END IF;
  END IF;

  -- (c) Auto-clear banned_from_org_at when membership changes. Per-org bans
  --     are scoped to the org that issued them; moving to a new org wipes
  --     the slate.
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    NEW.banned_from_org_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_admin_columns ON public.profiles;
CREATE TRIGGER profiles_protect_admin_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_admin_columns();

-- ============================================================================
-- 4. HIGH — Storage UPDATE policy on the post-images bucket
-- ----------------------------------------------------------------------------
-- Audit finding: migration 010 created INSERT/SELECT/DELETE policies on
-- storage.objects for the `post-images` bucket but no UPDATE policy. Owner
-- re-uploads (overwriting an existing image at the same path) silently
-- failed. Mirror the INSERT/DELETE policy: owner can update objects whose
-- top-level folder is their own auth.uid().
-- ============================================================================

DROP POLICY IF EXISTS "post-images authenticated update" ON storage.objects;
CREATE POLICY "post-images authenticated update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- ============================================================================
-- 5. HIGH — blogs_admin_all policy: wrap auth.uid() in (SELECT auth.uid())
-- ----------------------------------------------------------------------------
-- Audit finding: 011 created blogs_admin_all with a bare `auth.uid()` call
-- in both the USING and WITH CHECK clauses. PostgreSQL re-evaluates that
-- function once per row instead of once per query, making large blog
-- listings slow. Wrap in (SELECT ...) for query-level evaluation, matching
-- the pattern used everywhere else in this schema (003, 005, 010, 012).
-- ============================================================================

DROP POLICY IF EXISTS blogs_admin_all ON public.blogs;
CREATE POLICY blogs_admin_all ON public.blogs
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

-- ============================================================================
-- 6. MEDIUM — set_blogs_updated_at: harden with SECURITY DEFINER + search_path
-- ----------------------------------------------------------------------------
-- Audit finding: migration 011 defined set_blogs_updated_at() without
-- SECURITY DEFINER or a pinned search_path. That makes it vulnerable to
-- search_path injection if a malicious schema is ever inserted earlier in
-- the path. Re-create with the same hardening pattern used by
-- public.set_updated_at() in migration 007. Drop CASCADE removes the
-- existing trigger; we re-attach it immediately below.
-- ============================================================================

DROP FUNCTION IF EXISTS public.set_blogs_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION public.set_blogs_updated_at()
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

DROP TRIGGER IF EXISTS trg_blogs_updated_at ON public.blogs;
CREATE TRIGGER trg_blogs_updated_at
  BEFORE UPDATE ON public.blogs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_blogs_updated_at();

-- ============================================================================
-- 7. MEDIUM — orders.updated_at column + trigger
-- ----------------------------------------------------------------------------
-- Audit finding: 013 created the `orders` table with only `created_at`. The
-- admin dashboard mutates `status` (pending -> paid -> shipped -> refunded /
-- cancelled) without any way to know when the most recent change happened.
-- Add updated_at with a default and wire it to the existing
-- public.set_updated_at() helper from migration 007.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Defensive: re-create public.set_updated_at() if a future migration ever
-- removes it. Same body and hardening as migration 007.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_orders_updated_at ON public.orders;
CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 8. LOW — drop redundant indexes
-- ----------------------------------------------------------------------------
-- Audit findings:
--   * idx_post_reports_post (post_id) is redundant: 010's UNIQUE constraint
--     `post_reports_unique_per_user UNIQUE (post_id, reporter_id)` creates a
--     composite index whose leftmost prefix already serves any query
--     filtering by post_id alone.
--   * idx_profiles_organization (organization_id) from 003 is redundant
--     after 014 added idx_profiles_organization_id (organization_id,
--     created_at DESC) — the wider composite covers all queries the older
--     index served, plus orderings.
-- ============================================================================

DROP INDEX IF EXISTS public.idx_post_reports_post;
DROP INDEX IF EXISTS public.idx_profiles_organization;

-- ============================================================================
-- 9. LOW — partial index on profiles for ai_personalization_consent = true
-- ----------------------------------------------------------------------------
-- Audit finding: AI routes filter profiles WHERE ai_personalization_consent
-- = true to decide whether to inject patient context. As the table grows,
-- a partial index keeps the consent-gated path bounded and tiny (only the
-- subset of users that opted in is indexed).
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_ai_consent
  ON public.profiles(id)
  WHERE ai_personalization_consent = true;

COMMIT;
