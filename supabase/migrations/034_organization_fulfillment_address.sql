-- 034: White-label fulfillment address
--
-- Parent PrescribeRx account model: Juvenex/Mitch keeps one parent account and
-- each white-label is configured as a PrescribeRx Client. Orders for patients
-- under a white-label should ship to the account holder / organization
-- fulfillment address, not to the patient's checkout address.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fulfillment_name text,
  ADD COLUMN IF NOT EXISTS fulfillment_phone text,
  ADD COLUMN IF NOT EXISTS fulfillment_street text,
  ADD COLUMN IF NOT EXISTS fulfillment_apt text,
  ADD COLUMN IF NOT EXISTS fulfillment_city text,
  ADD COLUMN IF NOT EXISTS fulfillment_state text,
  ADD COLUMN IF NOT EXISTS fulfillment_zip text,
  ADD COLUMN IF NOT EXISTS fulfillment_country text NOT NULL DEFAULT 'US';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_fulfillment_country_us;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_fulfillment_country_us
  CHECK (fulfillment_country = 'US');

COMMENT ON COLUMN public.organizations.fulfillment_street IS
  'Business fulfillment address used as the shipping destination for orders from this white-label.';
