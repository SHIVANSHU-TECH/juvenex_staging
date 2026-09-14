-- 019: rename appointments.prescriberx_patient_id → provider_patient_ref
-- (and the partial index) for provider-agnostic naming. Migration 018's
-- column is unused in production today; safe in-place rename.

ALTER TABLE appointments
  RENAME COLUMN prescriberx_patient_id TO provider_patient_ref;

ALTER INDEX idx_appointments_prescriberx_patient
  RENAME TO idx_appointments_provider_patient_ref;
