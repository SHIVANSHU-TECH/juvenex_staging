import type { JuvenexProduct } from './client'

/**
 * Field allow-list for anything served from an unauthenticated route.
 *
 * The partner's product rows carry internal commercial fields —
 * `cost_of_goods_sold`, the rebill/subscription configuration, `form_id` —
 * that have no business reaching a browser. They are all zero/empty in today's
 * data, which is exactly why an allow-list matters: the day the partner
 * populates real margin data, a pass-through endpoint would publish it.
 *
 * Deny-listing would fail open on fields added upstream later; this fails
 * closed.
 */
const PUBLIC_PRODUCT_FIELDS = [
  'product_id',
  'uniq_id',
  'product_name',
  'product_description',
  'product_price',
  'product_sku',
  'product_category_name',
  'vertical_name',
  'product_is_trial',
  'product_is_shippable',
  'product_max_quantity',
  'taxable',
  'product_img',
  // Present only on Get_Product_Details.
  'payment_name',
  'countries',
] as const

export function publicProduct(product: JuvenexProduct): Partial<JuvenexProduct> {
  // Built as a loose record: JuvenexProduct's `[key: string]: unknown` index
  // signature makes every read `unknown`, which will not assign back into the
  // typed fields one by one.
  const out: Record<string, unknown> = {}
  for (const field of PUBLIC_PRODUCT_FIELDS) {
    if (field in product) out[field] = product[field]
  }
  return out as Partial<JuvenexProduct>
}

/**
 * Projects a whole upstream envelope, leaving `status`/`message` intact and
 * filtering any product payload it carries.
 */
export function publicProductEnvelope<T extends Record<string, unknown>>(response: T): T {
  const out: Record<string, unknown> = { ...response }

  if (Array.isArray(out.product)) {
    out.product = (out.product as JuvenexProduct[]).map(publicProduct)
  }
  if (out.product_data && typeof out.product_data === 'object') {
    out.product_data = publicProduct(out.product_data as JuvenexProduct)
  }
  if (Array.isArray(out.related_products)) {
    out.related_products = (out.related_products as JuvenexProduct[]).map(publicProduct)
  }

  return out as T
}
