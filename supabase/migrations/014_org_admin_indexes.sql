-- 014: Per-organization admin support
--
-- Context: the per-org admin backend (src/app/org/[slug]/admin) lets an
-- org_admin moderate the members of their own organization. The existing
-- global `profiles.banned_at` column (added in 013_orders_admin_indexes.sql)
-- represents a site-wide ban set by a super_admin. An org_admin's "ban"
-- action should only affect membership in THAT specific organization, not
-- the user's global access.
--
-- Verified against 001_initial_schema.sql:
--   * Membership is expressed via `profiles.organization_id` — there is NO
--     junction table (`organization_members` / `org_users` etc.). A user is
--     either a member of exactly one organization or `organization_id IS NULL`.
--   * `profiles.role` is one of ('patient', 'org_admin', 'super_admin').
--   * `profiles.banned_at` is GLOBAL (013).
--
-- Design decisions:
--   1. Add `profiles.banned_from_org_at timestamptz` — a per-profile "soft
--      banned from the currently-assigned org" timestamp. Because membership
--      is 1:1, we do not need a join table. When set, the org_admin UI treats
--      the user as not-a-member for moderation purposes (hidden from the
--      Members tab by default, posts hidden from the org feed). The global
--      account is untouched.
--   2. Add an index to the existing orders/profiles join path used by the
--      scoped Orders tab (orders.user_id -> profiles.id where
--      profiles.organization_id = :orgId). Supabase executes this as two
--      round-trips (no JOIN), so we index profiles.organization_id for the
--      inner IN(...) filter.
--   3. Add an index for membership lookups used by the Members tab and
--      the scoped Posts/Reports tabs.

-- ---------------------------------------------------------------------------
-- 1. profiles.banned_from_org_at
-- ---------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS banned_from_org_at timestamptz;

COMMENT ON COLUMN profiles.banned_from_org_at IS
  'Per-org soft ban set by an org_admin. Independent of profiles.banned_at (global). Cleared when the profile is moved to a different organization_id.';

CREATE INDEX IF NOT EXISTS idx_profiles_banned_from_org_at
  ON profiles(banned_from_org_at)
  WHERE banned_from_org_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Membership lookup index
-- ---------------------------------------------------------------------------
-- The org admin Members tab issues:
--   SELECT id, email, name, role, created_at
--     FROM profiles
--    WHERE organization_id = :orgId
-- This index also covers the Orders tab's "members of this org" sub-query
-- and the Posts tab's "posts authored by this org's members" filter.
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
  ON profiles(organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;
