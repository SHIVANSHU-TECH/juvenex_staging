-- Adds prescriberx_patient_id for the 2-step PrescribeRx telehealth flow.
-- provider_reference_id (added in migration 006) continues to hold the
-- encounter_id (PrescribeRx /api/v1/encounters resource id).

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS prescriberx_patient_id text;

CREATE INDEX IF NOT EXISTS idx_appointments_prescriberx_patient
  ON appointments(prescriberx_patient_id)
  WHERE prescriberx_patient_id IS NOT NULL;
