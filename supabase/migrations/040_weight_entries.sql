-- 040: Standalone daily weight tracking.
--
-- The Weight Graph used to derive its data from progress_photos.weight, which
-- meant a user could only chart weight by uploading a photo. This table lets a
-- user log a plain weight number per day, decoupled from photos. One row per
-- user per calendar day (upsert on conflict) keeps the chart clean.

CREATE TABLE IF NOT EXISTS weight_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  weight_lbs numeric NOT NULL CHECK (weight_lbs > 0 AND weight_lbs < 2000),
  recorded_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recorded_on)
);

CREATE INDEX IF NOT EXISTS idx_weight_entries_user
  ON weight_entries(user_id, recorded_on);

ALTER TABLE weight_entries ENABLE ROW LEVEL SECURITY;

-- Users may only see/manage their own entries. API routes use the service role
-- and additionally enforce ownership in code (defence in depth).
DROP POLICY IF EXISTS "Users manage own weight entries" ON weight_entries;
CREATE POLICY "Users manage own weight entries" ON weight_entries
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
