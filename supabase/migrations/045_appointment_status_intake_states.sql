-- 045: allow the intake lifecycle statuses the telehealth route actually writes.
--
-- The appointments_appointment_status_check constraint was missing two states
-- that src/app/api/telehealth/appointments/route.ts produces:
--   * 'intake_pending'        — initial row created before the PRX intake POST
--   * 'intake_provider_error' — set when the upstream PRX intake call fails
-- Because neither value was permitted, EVERY pending-appointment insert on the
-- /telehealth path failed the check constraint and the appointments table
-- stayed empty. Extend the allow-list to cover the full lifecycle.

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_appointment_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_appointment_status_check
  CHECK (appointment_status = ANY (ARRAY[
    'intake_pending'::text,
    'intake_received'::text,
    'intake_provider_error'::text,
    'pending'::text,
    'scheduled'::text,
    'completed'::text,
    'cancelled'::text,
    'provider_assigned'::text,
    'consultation_scheduled'::text,
    'consultation_complete'::text,
    'prescription_sent'::text
  ]));
