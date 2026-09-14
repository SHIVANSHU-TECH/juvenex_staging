-- 043: Blog sections / categories
--
-- Adds an optional editorial "section" to blog posts so they can be grouped
-- and filtered on the public blog index (/blog) and tagged in the admin
-- editor. Additive and nullable — existing rows remain valid as
-- "uncategorized" (NULL) and no existing query path changes behavior.
--
-- RLS is unchanged: the existing blogs_public_read / blogs_admin_all policies
-- (migration 011) already govern row visibility; `section` is just another
-- column on rows those policies already expose.

ALTER TABLE blogs
  ADD COLUMN IF NOT EXISTS section text;

COMMENT ON COLUMN blogs.section IS
  'Optional editorial section/category used to group & filter posts on the blog index. NULL = uncategorized.';

-- Partial index supports filtering the index by a specific section without
-- scanning uncategorized rows.
CREATE INDEX IF NOT EXISTS idx_blogs_section
  ON blogs (section)
  WHERE section IS NOT NULL;
