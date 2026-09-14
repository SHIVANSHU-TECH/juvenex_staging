-- 009: Add organization_id to appointments, fix missing RLS policies.
--
-- Fixes surfaced by pre-demo DB audit:
--   * appointments.organization_id column missing → org-admin PUT always 403
--   * webhook_events has no RLS (service role bypasses, but safety-net)
--   * appointments has no UPDATE RLS policy

-- 1. Add organization_id to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_organization
  ON appointments(organization_id)
  WHERE organization_id IS NOT NULL;

-- Backfill: copy org from the patient's profile where possible.
UPDATE appointments a
SET organization_id = p.organization_id
FROM profiles p
WHERE a.user_id = p.id
  AND a.organization_id IS NULL
  AND p.organization_id IS NOT NULL;

-- 2. UPDATE policy on appointments (users can update their own rows).
DROP POLICY IF EXISTS "Users can update own appointments" ON appointments;
CREATE POLICY "Users can update own appointments" ON appointments
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

-- 3. Enable RLS on webhook_events (no policy = deny all direct reads;
--    service role bypasses RLS, so API writes are unaffected).
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
