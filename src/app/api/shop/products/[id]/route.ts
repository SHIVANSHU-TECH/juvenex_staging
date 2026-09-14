import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { fetchPrescribeRxCatalog, isPrescribeRxConfigured } from '@/lib/prescriberx'

const SHOP_PRODUCT_COLUMNS =
  'id, name, description, price_cents, category, image_url, is_active, created_at'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 1) Local shop_products (admin/seed) — authoritative when present.
    const supabase = createAdminClient()
    const { data: product } = await supabase
      .from('shop_products')
      .select(SHOP_PRODUCT_COLUMNS)
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle()

    if (product) {
      // Trust the seed row as-is. (The upstream Juvenex hardcoded drug-price
      // override was intentionally not carried into this merge — prod's shop
      // listing no longer applies those rules, so applying them here would make
      // the detail price differ from the listing price.)
      return Response.json({ data: product })
    }

    // 2) Not seeded locally — resolve from the live PrescribeRx catalog, the
    //    SAME source the shop listing served it from. Without this fallback,
    //    every catalog-only product (the bulk of the ~332-item live catalog,
    //    e.g. anastrozole) 404s on its detail page even though it appears in
    //    the listing and can now be checked out. Catalog prices already carry
    //    Juvenex overrides via fetchPrescribeRxCatalog.
    if (isPrescribeRxConfigured()) {
      try {
        const catalog = await fetchPrescribeRxCatalog()
        const match = catalog.find((p) => p.id === id && p.is_active !== false)
        if (match) {
          return Response.json({ data: match })
        }
      } catch (error: unknown) {
        // Non-fatal: fall through to 404 with a clear log. A catalog outage
        // must not turn a valid product detail request into a 500.
        logger.warn('shop/products/[id]: PrescribeRx catalog lookup failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // No seed fallback: seed products had no UUIDs and a numeric `id`
    // crashed downstream callers (checkout, cart) that require real UUIDs.
    return Response.json({ error: 'Product not found' }, { status: 404 })
  } catch (error: unknown) {
    logger.error('shop/products/[id] GET error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
