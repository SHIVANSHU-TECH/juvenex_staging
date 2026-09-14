-- 050: Vendor discriminator + vendor order identity on `orders`
--
-- Background:
--   The jx storefront (/store) checks out against WhiteLabelMD via
--   `Create_Order` (src/lib/juvenex/client.ts). Until now that flow persisted
--   NOTHING locally: every order lived only at the vendor, and order history
--   (src/components/jx/account/OrdersList.tsx) re-fetched it live on every
--   mount. This migration adds the columns needed to keep a local row per
--   vendor order so history, admin tooling, and reconciliation have something
--   to read when the vendor is slow or unreachable.
--
-- Why NOT reuse the existing `provider_order_id` / `provider_order_status`:
--   Those were added by 035 for PrescribeRx automation and are written only by
--   the PrescribeRx webhook handler (src/app/api/webhooks/prescriberx/
--   _handlers.ts). That handler resolves an incoming event with
--
--       .or(`provider_order_id.eq.${ref},prescriberx_reference.eq.${ref}`)
--
--   and applies NO vendor filter. Storing WhiteLabelMD order ids in the same
--   column would let a PrescribeRx webhook match — and then mutate — a jx
--   order whose id happened to collide. Separate `vendor_*` columns keep the
--   two vendors' identity spaces disjoint.
--
-- Cardinality note:
--   Upstream `Create_Order` takes ONE product_id and has no quantity field, so
--   an N-line bag becomes N separate charges and N order ids. We therefore
--   write ONE row per vendor order (1:1 with a charge), not one per bag.
--
-- Idempotent: every column add uses IF NOT EXISTS; the CHECK constraint is
-- dropped and recreated by name so a re-run picks up edits rather than
-- silently keeping a stale auto-named constraint; the index uses
-- IF NOT EXISTS. Safe to apply repeatedly.
--
-- Does NOT touch: prescriberx_* columns, the orders_status_check constraint,
-- or any existing index.

-- ---------------------------------------------------------------------------
-- 1. Vendor columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vendor           text,
  ADD COLUMN IF NOT EXISTS vendor_order_id  text,
  ADD COLUMN IF NOT EXISTS vendor_status    text,
  ADD COLUMN IF NOT EXISTS vendor_synced_at timestamptz;

-- Nullable by design: every row written before this migration (Kurv membership
-- and PrescribeRx checkout orders) has vendor IS NULL, and backfilling them is
-- out of scope here. Readers must treat NULL as "pre-vendor-tagging".
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_vendor_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_vendor_check
  CHECK (vendor IS NULL OR vendor IN ('whitelabelmd', 'prescriberx', 'kurv'));

COMMENT ON COLUMN public.orders.vendor IS
  'Which downstream vendor owns this order: whitelabelmd (jx /store), '
  'prescriberx, or kurv (membership). NULL for rows written before '
  'migration 050.';

COMMENT ON COLUMN public.orders.vendor_order_id IS
  'The vendor''s own order identifier — for whitelabelmd this is the '
  '`order_id` returned by Create_Order. Unique per vendor (see '
  'orders_vendor_order_id_uidx); doubles as the idempotency key so a retried '
  'write cannot create a duplicate row for an already-charged order.';

COMMENT ON COLUMN public.orders.vendor_status IS
  'Raw, unmapped status string as last reported by the vendor. The normalized '
  'local lifecycle stays in `status`; this column preserves vendor vocabulary '
  'without overloading the orders_status_check constraint.';

COMMENT ON COLUMN public.orders.vendor_synced_at IS
  'When vendor_status was last refreshed from the vendor. NULL means never '
  'synced since insert.';

-- ---------------------------------------------------------------------------
-- 2. Idempotency / lookup index
-- ---------------------------------------------------------------------------
-- UNIQUE so a duplicate persist attempt for an already-recorded vendor order
-- fails loudly at the DB rather than silently double-recording a single
-- charge. Partial: rows with no vendor_order_id (all pre-050 rows, and any
-- vendor that does not return an id) are exempt and can coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS orders_vendor_order_id_uidx
  ON public.orders (vendor, vendor_order_id)
  WHERE vendor_order_id IS NOT NULL;
