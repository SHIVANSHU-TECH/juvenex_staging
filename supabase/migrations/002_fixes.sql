-- 002_fixes.sql
-- Missing tables, RLS policy fixes, indexes, and FK behavior fixes

-- =============================================================================
-- (a) Appointments table
-- =============================================================================
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  appointment_status text NOT NULL DEFAULT 'intake_received'
    CHECK (appointment_status IN ('intake_received', 'pending', 'scheduled', 'completed', 'cancelled')),
  selected_products text[] NOT NULL DEFAULT '{}',
  external_consult_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_appointments_user ON appointments(user_id, created_at DESC);
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own appointments" ON appointments FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can create own appointments" ON appointments FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

-- =============================================================================
-- (b) Audit logs table for HIPAA
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
-- No RLS on audit_logs - only accessed via admin client

-- =============================================================================
-- (c) Webhook events table for idempotency
-- =============================================================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz DEFAULT now()
);

-- =============================================================================
-- (d) Fix RLS policies
-- =============================================================================

-- Fix organizations - enable RLS and add policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Organizations are publicly viewable" ON organizations
  FOR SELECT USING (true);
CREATE POLICY "Only super_admin can modify orgs" ON organizations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin')
  );

-- Fix affiliate_referrals RLS
ALTER TABLE affiliate_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own referrals" ON affiliate_referrals
  FOR SELECT USING ((SELECT auth.uid()) IN (referrer_id, referred_id));

-- Fix comments policy - scope to post visibility
DROP POLICY IF EXISTS "Comments viewable" ON comments;
CREATE POLICY "Comments viewable on accessible posts" ON comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM posts WHERE posts.id = comments.post_id
      AND (posts.is_public = true OR posts.user_id = (SELECT auth.uid()))
    )
  );

-- Fix group_members - prevent self-promotion
DROP POLICY IF EXISTS "Users can join/leave groups" ON group_members;
CREATE POLICY "Users can join groups as member" ON group_members
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id AND role = 'member');
CREATE POLICY "Users can leave groups" ON group_members
  FOR DELETE USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Group members viewable" ON group_members
  FOR SELECT USING (true);

-- Fix profiles - restrict public fields
DROP POLICY IF EXISTS "Public profiles are viewable" ON profiles;
CREATE POLICY "Limited public profiles" ON profiles
  FOR SELECT USING (
    (SELECT auth.uid()) = id
    OR true  -- public read but we'll limit columns via API
  );

-- Add groups UPDATE/DELETE policy
CREATE POLICY "Creators can manage groups" ON groups
  FOR ALL USING ((SELECT auth.uid()) = created_by);

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_progress_photos_user ON progress_photos(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_referred ON affiliate_referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_referrer ON affiliate_referrals(referrer_id);

-- Fix FK behaviors
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS fk_profiles_organization;
ALTER TABLE profiles ADD CONSTRAINT fk_profiles_organization
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

-- =============================================================================
-- (e) Fix subscriptions upsert - needs unique constraint on user_id
-- =============================================================================
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);

-- =============================================================================
-- (f) Fix organization type mismatch between schema CHECK and API validation
-- =============================================================================
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_type_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_type_check
  CHECK (type IN ('clinic', 'practice', 'hospital', 'wellness_center', 'pharmacy', 'enterprise'));

-- =============================================================================
-- MANUAL STEP: Create a storage bucket in Supabase Dashboard
-- Go to Storage > Create bucket > Name: "progress-photos" > Public: false
-- Add policy: authenticated users can upload to their own folder (user_id/*)
-- =============================================================================
