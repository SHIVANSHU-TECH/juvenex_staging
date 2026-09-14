-- 035_prescriberx_automation_hardening.sql
-- Provider automation groundwork:
-- - Normalize PrescribeRx product IDs/SKUs before prescription unlock checks.
-- - Preserve raw provider webhook payloads for schema discovery/debugging.
-- - Add provider order/tracking columns used by order.* webhook updates.

CREATE TABLE IF NOT EXISTS public.prescriberx_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  external_product_id text,
  sku text,
  package_id text,
  package_item_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP INDEX IF EXISTS public.idx_prescriberx_product_mappings_org_product;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prescriberx_product_mappings_org_product
  ON public.prescriberx_product_mappings (organization_id, product_id)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_prescriberx_product_mappings_external
  ON public.prescriberx_product_mappings (organization_id, external_product_id)
  WHERE external_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prescriberx_product_mappings_sku
  ON public.prescriberx_product_mappings (organization_id, sku)
  WHERE sku IS NOT NULL;

ALTER TABLE public.prescriberx_product_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prescriberx_product_mappings_super_admin_all
  ON public.prescriberx_product_mappings;
CREATE POLICY prescriberx_product_mappings_super_admin_all
  ON public.prescriberx_product_mappings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.provider_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_webhook_events_org_type
  ON public.provider_webhook_events (organization_id, event_type, processed_at DESC);

ALTER TABLE public.provider_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_webhook_events_super_admin_all
  ON public.provider_webhook_events;
CREATE POLICY provider_webhook_events_super_admin_all
  ON public.provider_webhook_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  );

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_patient_ref text,
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prescription_ref text,
  ADD COLUMN IF NOT EXISTS provider_order_id text,
  ADD COLUMN IF NOT EXISTS provider_order_status text,
  ADD COLUMN IF NOT EXISTS tracking_carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_payload jsonb;

UPDATE public.orders o
SET organization_id = p.organization_id
FROM public.profiles p
WHERE o.user_id = p.id
  AND o.organization_id IS NULL
  AND p.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_provider_order_id
  ON public.orders (provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_organization_created
  ON public.orders (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;
