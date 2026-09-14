-- 027_appointments_unified_provider_refs.sql
--
-- Adds provider-side metadata columns required by the new PrescribeRx unified
-- intake endpoint (POST /telehealth/intake/unified). The endpoint creates a
-- patient + encounter + answers in a single call and returns several human-
-- readable identifiers in addition to the UUIDs we already store.
--
-- Existing column reuse:
--   * appointments.provider_reference_id     ← encounter UUID (was 2-step encounter id)
--   * appointments.provider_patient_ref      ← patient_chart UUID (was 2-step patient id)
--
-- New columns added below — all nullable text/int because rows can predate the
-- provider call (we insert the local row before the upstream POST so we have a
-- paper trail even if the provider 5xxs).

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS provider_encounter_number text,
  ADD COLUMN IF NOT EXISTS provider_patient_number text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_completeness_score smallint,
  ADD COLUMN IF NOT EXISTS provider_error text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- Lookup index for support/admin: "find appointment by ENC-XXXXXX number".
CREATE INDEX IF NOT EXISTS idx_appointments_provider_encounter_number
  ON appointments(provider_encounter_number)
  WHERE provider_encounter_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_provider_patient_number
  ON appointments(provider_patient_number)
  WHERE provider_patient_number IS NOT NULL;

COMMENT ON COLUMN appointments.provider_reference_id IS
  'PrescribeRx encounter UUID (returned as data.encounter_id from /telehealth/intake/unified).';
COMMENT ON COLUMN appointments.provider_patient_ref IS
  'PrescribeRx patient_chart UUID (returned as data.patient_chart_id from /telehealth/intake/unified).';
COMMENT ON COLUMN appointments.provider_encounter_number IS
  'Human-readable encounter number, e.g. "ENC-2860532082". Safe to surface to support staff.';
COMMENT ON COLUMN appointments.provider_patient_number IS
  'Human-readable patient number, e.g. "PAT-4184636609". Safe to surface to support staff.';
COMMENT ON COLUMN appointments.provider_status IS
  'Upstream provider workflow status (e.g. "unassigned", "assigned").';
COMMENT ON COLUMN appointments.provider_completeness_score IS
  'PrescribeRx data.completeness_score 0-100. Drives provider-side intake-quality dashboards.';
COMMENT ON COLUMN appointments.provider_error IS
  'Sanitized error category recorded when the upstream call failed. NEVER store raw provider response (may reflect PHI).';
COMMENT ON COLUMN appointments.submitted_at IS
  'Timestamp of successful provider acknowledgement. NULL means provider call failed or has not happened yet.';
