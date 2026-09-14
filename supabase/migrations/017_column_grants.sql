-- Migration 017: Column-Level GRANT/REVOKE Hardening
-- ----------------------------------------------------------------------------
-- 2nd-pass DB audit (CRITICAL): the column-protection logic added in
-- migration 016 (`messages_only_read_at_mutable` trigger and the column-block
-- branches inside `profiles_protect_admin_columns`) gated on
-- `current_setting('role', true)` and `current_setting('request.jwt.claim.role', true)`.
-- Both signals are *bypassable* inside an RLS context: an authenticated
-- caller able to issue `SET LOCAL ROLE service_role` (or to inject a JWT
-- claim that resolves to 'service_role') would short-circuit the guard and
-- regain full UPDATE access to columns the trigger was trying to protect.
--
-- Fix: replace the trigger-based column protection with PostgreSQL native
-- column-level privileges (GRANT/REVOKE on individual columns). Column
-- privileges are enforced at the SQL privilege layer BEFORE any row reaches
-- a BEFORE UPDATE trigger and CANNOT be bypassed by `SET ROLE` from inside
-- an RLS-governed session — Postgres rejects the UPDATE on the unprivileged
-- column with `permission denied for table/column ...` (SQLSTATE 42501).
--
-- Service-role bypass is still intentional but no longer relies on
-- runtime detection: Supabase's service-role connections run as the
-- `postgres` (or `service_role`) role which already holds UPDATE on every
-- column on every table in `public`, so admin tooling continues to work
-- without any explicit branch.
--
-- This migration:
--   1. Locks down `profiles` UPDATE to the four columns end-users are
--      legitimately allowed to mutate (name, avatar_url,
--      ai_personalization_consent, sleep_hours_avg).
--   2. Locks down `messages` UPDATE to `read_at` only.
--   3. Drops the now-redundant `messages_only_read_at_mutable` trigger and
--      its function.
--   4. Simplifies `profiles_protect_admin_columns` down to its only
--      remaining responsibilities: auto-maintaining
--      `ai_personalization_consent_at` on consent flips, and clearing
--      `banned_from_org_at` on org changes. The column-block branches
--      (which read `request.jwt.claim.sub` and crashed on malformed JWTs —
--      the HIGH finding from the 2nd-pass audit) are removed entirely.
--
-- All statements are idempotent. RLS policies on these tables are
-- unaffected: column GRANTs constrain WHICH COLUMNS may be updated; RLS
-- continues to constrain WHICH ROWS may be updated.
--
-- NOTE for future re-deployment: 016's `array_agg(attnum)` lookups inside
-- the FK-retargeting DO blocks should be re-authored as
-- `array_agg(attnum ORDER BY attnum)` — `pg_attribute` ordering is not
-- guaranteed and `conkey` is an ordered array. This migration does not
-- touch 016, but 016 should be fixed before any green-field re-deploy.
-- ----------------------------------------------------------------------------

BEGIN;

-- ============================================================================
-- 1. profiles — column-level UPDATE privileges
-- ----------------------------------------------------------------------------
-- After this section, the only columns an `authenticated` caller can include
-- in an UPDATE on `public.profiles` are the four listed below. Any attempt
-- to UPDATE `role`, `organization_id`, `banned_at`, `banned_from_org_at`,
-- `ai_personalization_consent_at`, `email`, `referral_code`, etc. is
-- rejected by Postgres with SQLSTATE 42501 (insufficient_privilege) BEFORE
-- the row-level policy or any BEFORE UPDATE trigger runs.
--
-- RLS still constrains WHICH ROWS may be touched (own row only, via the
-- existing "Users can update own profile" policy from 001).
-- ============================================================================

REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;

GRANT UPDATE (
  name,
  avatar_url,
  ai_personalization_consent,
  sleep_hours_avg
) ON public.profiles TO authenticated;

-- ============================================================================
-- 2. messages — column-level UPDATE privileges
-- ----------------------------------------------------------------------------
-- Recipients may now ONLY update `read_at` (mark-as-read). Attempting to
-- rewrite `body`, swap `from_user_id` / `to_user_id`, or back-date
-- `created_at` is rejected by Postgres at the SQL privilege layer.
-- ============================================================================

REVOKE UPDATE ON public.messages FROM authenticated;
REVOKE UPDATE ON public.messages FROM anon;

GRANT UPDATE (read_at) ON public.messages TO authenticated;

-- ============================================================================
-- 3. Drop now-redundant messages trigger + function
-- ----------------------------------------------------------------------------
-- 016's `messages_only_read_at_mutable` trigger enforced exactly what the
-- column GRANT above now enforces — but at a layer that was bypassable via
-- `SET LOCAL ROLE`. With column privileges in place the trigger is
-- redundant; remove it (and its function) to avoid drift.
-- ============================================================================

DROP TRIGGER IF EXISTS messages_only_read_at_mutable ON public.messages;
DROP FUNCTION IF EXISTS public.fn_messages_only_read_at_mutable();
-- Defensive: 016 named the function `public.messages_only_read_at_mutable`
-- (matching the trigger name). Drop that name too.
DROP FUNCTION IF EXISTS public.messages_only_read_at_mutable();

-- ============================================================================
-- 4. Simplify profiles_protect_admin_columns — auto-maintenance only
-- ----------------------------------------------------------------------------
-- The column-block branches in 016's version are now redundant (Postgres
-- enforces column privileges before this trigger fires) AND were the only
-- code path reading `request.jwt.claim.sub`. Removing them resolves the
-- HIGH finding "malformed JWT sub crashes profile UPDATE" from the
-- 2nd-pass audit, because the trigger no longer reads or casts that claim.
--
-- Remaining responsibilities (auto-maintenance only):
--   (a) On `ai_personalization_consent` flipping false -> true, stamp
--       `ai_personalization_consent_at = now()`.
--   (b) On `ai_personalization_consent` flipping true -> false, clear
--       `ai_personalization_consent_at = NULL`.
--   (c) On `organization_id` changing, clear `banned_from_org_at = NULL`
--       (per-org bans are scoped to the issuing org).
--
-- These branches must keep working for end-users, because the user IS
-- allowed to UPDATE `ai_personalization_consent` (via the column GRANT
-- above) — we just need the timestamp side-effect to be applied
-- server-side rather than trusting the client.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.profiles_protect_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- (a)/(b) Auto-maintain ai_personalization_consent_at on consent flips.
  IF NEW.ai_personalization_consent IS DISTINCT FROM OLD.ai_personalization_consent THEN
    IF NEW.ai_personalization_consent = true
       AND COALESCE(OLD.ai_personalization_consent, false) = false THEN
      NEW.ai_personalization_consent_at := now();
    ELSIF NEW.ai_personalization_consent = false
          AND COALESCE(OLD.ai_personalization_consent, false) = true THEN
      NEW.ai_personalization_consent_at := NULL;
    END IF;
  END IF;

  -- (c) Auto-clear banned_from_org_at when membership changes.
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    NEW.banned_from_org_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger binding is unchanged from 016; re-create defensively in case the
-- function signature drifted.
DROP TRIGGER IF EXISTS profiles_protect_admin_columns ON public.profiles;
CREATE TRIGGER profiles_protect_admin_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_admin_columns();

COMMIT;
