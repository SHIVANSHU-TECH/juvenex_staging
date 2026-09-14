-- Migration 005: Constraint and RLS fixes
-- Fixes 500s and PHI exposure issues ahead of production launch.

-- =============================================================================
-- 1. Appointment status CHECK constraint — add API statuses
--    Current set: intake_received | pending | scheduled | completed | cancelled
--    API also uses: provider_assigned | consultation_scheduled |
--                   consultation_complete | prescription_sent
-- =============================================================================
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_appointment_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_appointment_status_check
  CHECK (appointment_status IN (
    'intake_received',
    'pending',
    'scheduled',
    'completed',
    'cancelled',
    'provider_assigned',
    'consultation_scheduled',
    'consultation_complete',
    'prescription_sent'
  ));

-- =============================================================================
-- 2. group_members INSERT policy — allow creator to insert admin row
--    Old policy only permitted role = 'member'.
--    New policy: admin allowed when caller is the group's created_by;
--                member allowed for everyone else joining normally.
-- =============================================================================
DROP POLICY IF EXISTS "Users can join groups as member" ON group_members;
CREATE POLICY "Users can join groups as member or admin" ON group_members
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (
      -- Creator of the group may insert themselves as admin
      (role = 'admin' AND EXISTS (
        SELECT 1 FROM groups WHERE groups.id = group_id
          AND groups.created_by = (SELECT auth.uid())
      ))
      -- Everyone else must join as member only
      OR role = 'member'
    )
  );

-- =============================================================================
-- 3. audit_logs.resource_type — add DEFAULT to stop NOT NULL violations
--    audit.ts passes the action name as fallback at the application layer
--    already, but adding a DB-level default guards against any other callers.
-- =============================================================================
ALTER TABLE audit_logs ALTER COLUMN resource_type SET DEFAULT 'unknown';

-- =============================================================================
-- 4. Ensure RLS is enabled on audit_logs and add user SELECT policy
--    Service role bypasses RLS so application writes are unaffected.
-- =============================================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own audit logs" ON audit_logs;
CREATE POLICY "Users can read own audit logs" ON audit_logs
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- =============================================================================
-- 5. progress_photos.storage_path — drop NOT NULL so photo_url-only inserts work
--    The API inserts (user_id, photo_url, weight, notes) without storage_path.
-- =============================================================================
ALTER TABLE progress_photos ALTER COLUMN storage_path DROP NOT NULL;

-- =============================================================================
-- 6. PHI table RLS performance — replace bare auth.uid() with (SELECT auth.uid())
--    This prevents the function being called once per row instead of once per
--    query, giving a significant speedup on large PHI tables.
-- =============================================================================

-- patient_profiles
DROP POLICY IF EXISTS "Users can manage own patient profile" ON patient_profiles;
CREATE POLICY "Users can manage own patient profile" ON patient_profiles
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- food_logs
DROP POLICY IF EXISTS "Users can manage own food logs" ON food_logs;
CREATE POLICY "Users can manage own food logs" ON food_logs
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- meal_plans
DROP POLICY IF EXISTS "Users can manage own meal plans" ON meal_plans;
CREATE POLICY "Users can manage own meal plans" ON meal_plans
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- progress_photos
DROP POLICY IF EXISTS "Users can manage own photos" ON progress_photos;
CREATE POLICY "Users can manage own photos" ON progress_photos
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- progress_photos public read policy (unchanged logic, kept for completeness)
DROP POLICY IF EXISTS "Public photos are viewable" ON progress_photos;
CREATE POLICY "Public photos are viewable" ON progress_photos
  FOR SELECT USING (is_public = true);

-- ai_conversations
DROP POLICY IF EXISTS "Users can manage own conversations" ON ai_conversations;
CREATE POLICY "Users can manage own conversations" ON ai_conversations
  FOR ALL USING ((SELECT auth.uid()) = user_id);
