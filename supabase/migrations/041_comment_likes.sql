-- ============================================================================
-- 041: Comment edit metadata + comment likes
--
-- Adds the columns and table needed for editing comments and liking comments,
-- mirroring the existing post-likes model:
--
--   1. comments.updated_at  — stamped by the API on edit (NULL until edited).
--   2. comments.likes_count — denormalized counter, kept in sync via RPCs.
--   3. comment_likes         — join table (one row per user/comment), mirrors
--                              the `likes` table for posts.
--   4. increment_comment_likes / decrement_comment_likes RPCs — mirror the
--      post-likes RPCs (SECURITY DEFINER, fixed search_path).
--   5. RLS on comment_likes consistent with `likes` (viewable; own manageable).
--   6. A comments UPDATE policy so authors can edit their own comments — the
--      comments table has RLS enabled but previously only had SELECT/INSERT/
--      DELETE policies. (Service-role API calls bypass RLS, but this keeps the
--      table's policy set complete and consistent with `posts`.)
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. New columns on comments
-- ---------------------------------------------------------------------------
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS likes_count int NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. comment_likes join table (mirrors `likes`)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comment_likes (
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment
  ON public.comment_likes(comment_id);

-- ---------------------------------------------------------------------------
-- 3. Atomic counter RPCs (mirror increment/decrement_post_likes)
--    SECURITY DEFINER + fixed search_path to prevent search_path injection.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_comment_likes(comment_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE comments SET likes_count = likes_count + 1 WHERE id = comment_id;
$$;

CREATE OR REPLACE FUNCTION public.decrement_comment_likes(comment_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = comment_id;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS on comment_likes (consistent with `likes`)
-- ---------------------------------------------------------------------------
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comment likes viewable" ON public.comment_likes;
CREATE POLICY "Comment likes viewable" ON public.comment_likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own comment likes" ON public.comment_likes;
CREATE POLICY "Users can manage own comment likes" ON public.comment_likes
  FOR ALL USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. Comments UPDATE policy — authors can edit their own comments.
--    (Completes the comments policy set; mirrors the DELETE policy.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;
CREATE POLICY "Users can update own comments" ON public.comments
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
