-- 029_organizations_prescriberx_client_id.sql
--
-- Adds the per-tenant PrescribeRx Client UUID to the organizations table.
-- When set, all PrescribeRx API calls for that organization are scoped to
-- this client_id (sub-sales-org tier), giving each white-label tenant its
-- own catalog / encounters bucket inside our shared sales-org account.
-- When NULL, calls fall through to the platform/sales-org default scope of
-- PRESCRIBERX_API_TOKEN — i.e. today's single-tenant behavior.
--
-- Also adds a column to appointments so we can audit which client_id each
-- intake submission was routed to (in case an org's mapping changes later).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS prescriberx_client_id text NULL;

COMMENT ON COLUMN organizations.prescriberx_client_id IS
  'PrescribeRx Client UUID this organization maps to. When set, all PrescribeRx API calls scope to this client_id. When null, calls fall through to the platform/sales-org default scope of PRESCRIBERX_API_TOKEN.';

-- Optional index for webhook receivers that need to map an inbound
-- PrescribeRx client_id back to an organization row.
CREATE INDEX IF NOT EXISTS idx_organizations_prescriberx_client_id
  ON organizations (prescriberx_client_id)
  WHERE prescriberx_client_id IS NOT NULL;

-- Audit trail: persist which client_id each appointment was routed to.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS provider_scope_client_id text NULL;

COMMENT ON COLUMN appointments.provider_scope_client_id IS
  'PrescribeRx client_id used when this appointment intake was forwarded. Null = sent without client_id (token default scope). Captured at submission time so org mapping changes do not rewrite history.';
