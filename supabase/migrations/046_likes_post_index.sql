-- 046: index for post-scoped like lookups (pkey is (user_id, post_id) so
-- post_id-only scans couldn't use it).
CREATE INDEX IF NOT EXISTS idx_likes_post ON public.likes USING btree (post_id);
