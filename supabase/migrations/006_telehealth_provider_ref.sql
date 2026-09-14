-- 006_telehealth_provider_ref.sql
-- Adds provider_reference_id for HIPAA-compliant telehealth pass-through.
-- When TELEHEALTH_PROVIDER_URL is set in env, the API forwards PHI to the
-- external telehealth provider and stores only this opaque reference id.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS provider_reference_id text;

CREATE INDEX IF NOT EXISTS idx_appointments_provider_ref
  ON appointments(provider_reference_id)
  WHERE provider_reference_id IS NOT NULL;
