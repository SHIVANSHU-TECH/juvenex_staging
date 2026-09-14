-- 010: Community feed enhancements
--
-- Changes:
--   1. Default `posts.is_public` to FALSE (private by default).
--   2. Tighten RLS so private posts are only visible to their author.
--   3. New `post_reports` table for user-submitted moderation reports.
--   4. Documents the `post-images` Supabase Storage bucket setup
--      (must be created out-of-band — see "Storage bucket" block below).
--
-- Note: the original posts table is named `posts` (see 001_initial_schema.sql),
-- not `social_posts` — verified before writing this migration.

-- ---------------------------------------------------------------------------
-- 1. Default `posts.is_public` to FALSE (was TRUE in 001).
-- ---------------------------------------------------------------------------
ALTER TABLE posts ALTER COLUMN is_public SET DEFAULT false;

-- Backfill is intentionally omitted: existing posts created with the old
-- default stay public so we don't retroactively hide history. Going forward
-- the API and UI default to private.

-- ---------------------------------------------------------------------------
-- 2. Tighten RLS so private posts are only visible to their author.
--    The original "Public posts are viewable" policy used
--    USING (is_public = true) which already blocked private posts from
--    other readers, but the "Users can manage own posts" FOR ALL policy
--    correctly grants the author SELECT on their own private posts.
--    Re-create both policies idempotently to make the visibility rule
--    explicit and to ensure they exist after this migration.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public posts are viewable" ON posts;
DROP POLICY IF EXISTS "Users can manage own posts" ON posts;
DROP POLICY IF EXISTS "Authors can view own posts" ON posts;

-- Public posts visible to everyone
CREATE POLICY "Public posts are viewable" ON posts
  FOR SELECT USING (is_public = true);

-- Authors always see their own posts (public or private)
CREATE POLICY "Authors can view own posts" ON posts
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- Authors can insert/update/delete only their own posts
CREATE POLICY "Users can manage own posts" ON posts
  FOR ALL USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. post_reports — user-submitted moderation reports for public posts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 500),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One report per (post, reporter) — re-submitting is a no-op.
  CONSTRAINT post_reports_unique_per_user UNIQUE (post_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_post_reports_post ON post_reports(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reports_status ON post_reports(status, created_at DESC);

ALTER TABLE post_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated users can submit reports.
DROP POLICY IF EXISTS "Authenticated users can report posts" ON post_reports;
CREATE POLICY "Authenticated users can report posts" ON post_reports
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = reporter_id);

-- Only super_admins can read reports for moderation review.
-- (Service-role API calls bypass RLS, so the admin dashboard still works.)
DROP POLICY IF EXISTS "Super admins can view reports" ON post_reports;
CREATE POLICY "Super admins can view reports" ON post_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Storage bucket: `post-images`
--
-- The Supabase JS client cannot create buckets through plain SQL, but the
-- Supabase storage schema does expose `storage.buckets`. The block below
-- creates the bucket if it does not exist. If your environment forbids
-- direct writes to `storage.buckets`, run the equivalent dashboard step:
--
--   Storage → New bucket → name=post-images → Public bucket: ON
--   Allowed MIME types: image/png, image/jpeg, image/webp, image/gif
--   File size limit: 5 MB
--
-- The bucket is intentionally public-read (post images are shown to all
-- viewers of public posts) but writes go through the authenticated API
-- route which uses the service role key.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-images',
  'post-images',
  true,
  5242880, -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for `post-images`:
--   * Anyone can read (bucket is public).
--   * Only authenticated users can upload, into a folder named after their
--     own user id (path prefix `<auth.uid()>/...`).
DROP POLICY IF EXISTS "post-images public read" ON storage.objects;
CREATE POLICY "post-images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-images');

DROP POLICY IF EXISTS "post-images authenticated insert" ON storage.objects;
CREATE POLICY "post-images authenticated insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'post-images'
    AND (SELECT auth.uid()) IS NOT NULL
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "post-images owner delete" ON storage.objects;
CREATE POLICY "post-images owner delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'post-images'
    AND (SELECT auth.uid()) IS NOT NULL
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
