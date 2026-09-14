-- Migration 007: Final HIPAA hardening
-- Covers: updated_at columns, audit_logs policy cleanup, atomic counter RPCs,
--         hot-path indexes, and retention automation placeholders.

-- ============================================================
-- 1. MISSING updated_at COLUMNS
-- ============================================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Auto-set updated_at on row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_updated_at ON posts;
CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 2. DROP REDUNDANT audit_logs INSERT POLICY
-- Service role bypasses RLS entirely, so writes are unaffected.
-- ============================================================

DROP POLICY IF EXISTS "Service role can insert audit logs" ON audit_logs;

-- ============================================================
-- 3. ATOMIC COUNTER RPC FUNCTIONS
-- All SECURITY DEFINER + fixed search_path to prevent search_path injection.
-- ============================================================

-- posts: likes_count
CREATE OR REPLACE FUNCTION increment_post_likes(post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE posts SET likes_count = likes_count + 1 WHERE id = post_id;
$$;

CREATE OR REPLACE FUNCTION decrement_post_likes(post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = post_id;
$$;

-- posts: comments_count
CREATE OR REPLACE FUNCTION increment_post_comments(post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE posts SET comments_count = comments_count + 1 WHERE id = post_id;
$$;

CREATE OR REPLACE FUNCTION decrement_post_comments(post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = post_id;
$$;

-- groups: member_count
CREATE OR REPLACE FUNCTION increment_group_members(group_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE groups SET member_count = member_count + 1 WHERE id = group_id;
$$;

CREATE OR REPLACE FUNCTION decrement_group_members(group_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE groups SET member_count = GREATEST(0, member_count - 1) WHERE id = group_id;
$$;

-- ============================================================
-- 4. MISSING HOT-PATH INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_posts_created
  ON posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_created
  ON ai_conversations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_food_logs_user_logged
  ON food_logs(user_id, logged_at DESC);

-- ============================================================
-- 5. RETENTION AUTOMATION PLACEHOLDERS (HIPAA §164.316)
-- ============================================================

-- Purge audit_logs older than 6 years
CREATE OR REPLACE FUNCTION retention_purge_audit_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM audit_logs
  WHERE created_at < now() - INTERVAL '6 years';
$$;

-- Purge ai_conversations older than 90 days
CREATE OR REPLACE FUNCTION retention_purge_ai_conversations()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM ai_conversations
  WHERE created_at < now() - INTERVAL '90 days';
$$;

-- ============================================================
-- pg_cron scheduling reference (commented out — enable only if
-- the pg_cron extension is active on your Supabase project).
-- Schedule via: Database > Extensions > pg_cron in the dashboard.
-- ============================================================

-- SELECT cron.schedule(
--   'purge-audit-logs',
--   '0 3 1 * *',   -- 03:00 on the 1st of every month
--   $$ SELECT retention_purge_audit_logs(); $$
-- );

-- SELECT cron.schedule(
--   'purge-ai-conversations',
--   '0 2 * * 0',   -- 02:00 every Sunday
--   $$ SELECT retention_purge_ai_conversations(); $$
-- );
