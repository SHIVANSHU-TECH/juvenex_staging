-- ============================================================================
-- 030: Community tenant scoping
--
-- Problem: `posts` has no `organization_id` column. The groups "Groups
-- viewable" policy uses USING (true), leaking every tenant's groups to every
-- other tenant. This migration:
--
--   1. Adds `posts.organization_id` (nullable FK → organizations).
--   2. Backfills from profiles.organization_id; guards NOT NULL with an
--      orphan-row count check.
--   3. Adds idx_posts_organization_id.
--   4. Replaces all posts RLS policies with tenant-scoped versions.
--   5. Replaces "Groups viewable" with a tenant-scoped policy.
--   6. Scopes group_members SELECT to the calling user's tenant.
--   7. Introduces SECURITY DEFINER helper current_org_id() used by all
--      new policies.
--
-- Idempotent: uses CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS,
-- and ALTER TABLE … ADD COLUMN IF NOT EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. SECURITY DEFINER helper: current_org_id()
--    Returns the organization_id of the currently authenticated user by
--    reading profiles with elevated privileges (bypasses RLS on profiles).
--    Returns NULL for unauthenticated callers.
--    Wrapped in SELECT auth.uid() to avoid per-row function eval cost when
--    used inline in policies.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_org_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE id = (SELECT auth.uid())
  LIMIT 1;
$$;

-- Grant execute to authenticated users (anon never has a profile, returns NULL)
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Add posts.organization_id (nullable for now; backfill below)
-- ---------------------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS organization_id uuid
    REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Backfill: posts.organization_id ← profiles.organization_id
--    After backfill, promote to NOT NULL only when zero orphan rows remain.
--    An orphan is a post whose author profile has no organization_id.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_orphans  bigint;
  v_updated  bigint;
BEGIN
  -- Fill from profile for rows still NULL (idempotent re-run safe)
  UPDATE public.posts p
  SET    organization_id = prof.organization_id
  FROM   public.profiles prof
  WHERE  p.user_id          = prof.id
    AND  prof.organization_id IS NOT NULL
    AND  p.organization_id  IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '030: backfilled % post rows with organization_id', v_updated;

  -- Count remaining nulls (orphan posts with no org on their profile)
  SELECT COUNT(*)
  INTO   v_orphans
  FROM   public.posts
  WHERE  organization_id IS NULL;

  IF v_orphans = 0 THEN
    ALTER TABLE public.posts ALTER COLUMN organization_id SET NOT NULL;
    RAISE NOTICE '030: organization_id set NOT NULL (zero orphan rows)';
  ELSE
    RAISE WARNING '030: % orphan post(s) found — organization_id remains nullable. '
                  'Resolve orphans (assign profile.organization_id or delete the post) '
                  'then re-run: ALTER TABLE posts ALTER COLUMN organization_id SET NOT NULL;',
                  v_orphans;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Index on posts.organization_id
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_posts_organization_id
  ON public.posts(organization_id);

-- ---------------------------------------------------------------------------
-- 4. Posts RLS — tenant-scoped replacement
--    Drop all existing permissive policies first, then recreate.
-- ---------------------------------------------------------------------------

-- 4a. Drop existing policies (from 001 / 010 migrations)
DROP POLICY IF EXISTS "Public posts are viewable"  ON public.posts;
DROP POLICY IF EXISTS "Authors can view own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can manage own posts" ON public.posts;

-- 4b. SELECT policy
--   super_admin  → sees everything
--   everyone else → must be in same org AND
--                   (post is public  OR  post belongs to caller  OR
--                    caller is a member of the post's group)
CREATE POLICY "posts_select" ON public.posts
  FOR SELECT
  USING (
    -- super_admin bypass
    EXISTS (
      SELECT 1 FROM public.profiles sa
      WHERE  sa.id   = (SELECT auth.uid())
        AND  sa.role = 'super_admin'
    )
    OR
    (
      -- same-tenant gate
      organization_id = (SELECT public.current_org_id())
      AND (
        -- public post
        is_public = true
        OR
        -- own post
        user_id = (SELECT auth.uid())
        OR
        -- member of the post's group (NULL group_id → no group row → no match, safe)
        EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE  gm.group_id = posts.group_id
            AND  gm.user_id  = (SELECT auth.uid())
        )
      )
    )
  );

-- 4c. INSERT policy: caller must own the row and stamp their own org
CREATE POLICY "posts_insert" ON public.posts
  FOR INSERT
  WITH CHECK (
    user_id         = (SELECT auth.uid())
    AND organization_id = (SELECT public.current_org_id())
  );

-- 4d. UPDATE policy: own rows only (org stays immutable via INSERT constraint)
CREATE POLICY "posts_update" ON public.posts
  FOR UPDATE
  USING  (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 4e. DELETE policy: own rows only
CREATE POLICY "posts_delete" ON public.posts
  FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. Groups RLS — replace USING (true) with tenant-scoped policy
-- ---------------------------------------------------------------------------

-- Drop the open SELECT policy
DROP POLICY IF EXISTS "Groups viewable" ON public.groups;

-- Tenant-scoped groups SELECT
--   super_admin → all groups
--   others      → groups in their org
CREATE POLICY "groups_select" ON public.groups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles sa
      WHERE  sa.id   = (SELECT auth.uid())
        AND  sa.role = 'super_admin'
    )
    OR
    organization_id = (SELECT public.current_org_id())
  );

-- Keep the existing INSERT and ALL (manage) policies intact —
-- they already constrain by created_by = auth.uid() and are not leaky.

-- ---------------------------------------------------------------------------
-- 6. Group members RLS — scope SELECT to same-tenant groups
--    The "Group members viewable" USING (true) leaks cross-tenant membership.
--    Replace with a join-through-groups check.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Group members viewable" ON public.group_members;

CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT
  USING (
    -- super_admin sees all membership rows
    EXISTS (
      SELECT 1 FROM public.profiles sa
      WHERE  sa.id   = (SELECT auth.uid())
        AND  sa.role = 'super_admin'
    )
    OR
    -- group belongs to caller's org
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE  g.id              = group_members.group_id
        AND  g.organization_id = (SELECT public.current_org_id())
    )
  );
