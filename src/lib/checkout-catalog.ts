// Checkout catalog resolver.
//
// The shop surface (`/api/shop/products` → `src/app/shop/page.tsx`) serves the
// LIVE PrescribeRx catalog (~332 products keyed by PrescribeRx UUIDs) and only
// falls back to the local `shop_products` seed table when PrescribeRx is not
// configured. The checkout server, however, historically re-validated and
// re-priced cart items against `shop_products` ONLY. Any product that lives in
// the PrescribeRx catalog but not the seed table (e.g. anastrozole) therefore
// resolved to "Unknown product" at checkout, blocking payment even though the
// user could select it in the shop.
//
// This module unifies the two so checkout resolves prices from the SAME source
// the shop served the product from:
//   1. `shop_products` (admin/seed rows) — authoritative when present.
//   2. For any id not found locally, the live PrescribeRx catalog — the exact
//      source the shop listed it from (prices already carry Juvenex overrides
//      via `applyJuvenexDrugPrice`, so checkout pricing matches the shop).
//
// Pricing stays server-trusted: the client-supplied price is never consulted
// here — every returned price comes from a trusted server-side source.

import { logger } from './logger'
import { createAdminClient } from './supabase/admin'
import { fetchPrescribeRxCatalog, isPrescribeRxConfigured } from './prescriberx'

export type TrustedProductSource = 'shop_products' | 'prescriberx'

export interface TrustedCatalogProduct {
  id: string
  name: string
  description: string | null
  price_cents: number
  category: string | null
  is_active: boolean
  source: TrustedProductSource
}

interface ShopProductRow {
  id: string
  name: string
  description: string | null
  price_cents: number
  is_active: boolean
  category: string | null
}

/**
 * Resolves a set of product ids to trusted (server-authoritative) pricing and
 * classification records, merging the local `shop_products` table with the
 * live PrescribeRx catalog. Local rows win when an id exists in both.
 *
 * Ids that resolve in NEITHER source are simply absent from the returned map;
 * the caller decides how to surface an unavailable line item.
 *
 * @throws when the `shop_products` lookup itself fails (a real infrastructure
 *   error the caller should treat as a 500). A PrescribeRx catalog failure is
 *   non-fatal — locally resolvable items still work and unresolved ids fall
 *   through to the caller's "unavailable" handling.
 */
export async function resolveTrustedProducts(
  productIds: readonly string[]
): Promise<Map<string, TrustedCatalogProduct>> {
  const byId = new Map<string, TrustedCatalogProduct>()
  const ids = Array.from(new Set(productIds))
  if (ids.length === 0) return byId

  // 1) Local shop_products (admin/seed) — authoritative when present.
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('shop_products')
    .select('id, name, description, price_cents, is_active, category')
    .in('id', ids)

  if (error) {
    logger.error('checkout-catalog: shop_products lookup failed', {
      error: error.message,
    })
    throw new Error('CATALOG_LOOKUP_FAILED')
  }

  for (const row of (data ?? []) as ShopProductRow[]) {
    // Trust the seed row's own price/category. (The upstream Juvenex hardcoded
    // drug-price override was intentionally NOT carried into this merge: prod's
    // shop DISPLAY path no longer applies those rules — pricing is PRX-retail
    // authoritative — so re-applying them here would make checkout charge a
    // price different from what the shop showed.) The PrescribeRx branch below
    // carries live retail pricing via fetchPrescribeRxCatalog.
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      description: row.description,
      price_cents: row.price_cents,
      category: row.category,
      is_active: row.is_active,
      source: 'shop_products',
    })
  }

  // 2) Resolve the remainder from the live PrescribeRx catalog — the same
  //    source the shop served them from. Skipped entirely when PrescribeRx is
  //    not configured (in which case the shop also only shows shop_products,
  //    so there is nothing to reconcile).
  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length === 0 || !isPrescribeRxConfigured()) {
    if (missing.length > 0) {
      logger.warn('checkout-catalog: ids unresolved and PrescribeRx not configured', {
        unresolvedCount: missing.length,
      })
    }
    return byId
  }

  try {
    const catalog = await fetchPrescribeRxCatalog()
    const catalogById = new Map(catalog.map((p) => [p.id, p]))
    for (const id of missing) {
      const p = catalogById.get(id)
      if (!p) continue
      byId.set(id, {
        id: p.id,
        name: p.name,
        description: p.description,
        price_cents: p.price_cents,
        category: p.category,
        is_active: p.is_active,
        source: 'prescriberx',
      })
    }
  } catch (err: unknown) {
    // Non-fatal: DB-resolved items still work. Unresolved ids will be reported
    // as unavailable by the caller with a clear, actionable message.
    logger.error('checkout-catalog: PrescribeRx catalog resolve failed', {
      error: err instanceof Error ? err.message : String(err),
      unresolvedCount: missing.length,
    })
  }

  const stillMissing = ids.filter((id) => !byId.has(id))
  if (stillMissing.length > 0) {
    logger.warn('checkout-catalog: some ids resolved in neither source', {
      unresolvedCount: stillMissing.length,
    })
  }

  return byId
}
