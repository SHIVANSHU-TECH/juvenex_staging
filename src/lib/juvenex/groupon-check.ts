/**
 * Top-layer Groupon/product promo check (Nextvial pattern).
 * POST https://panel.whitelabelmd.com/nextvial/api/groupon/check-coupon
 * Confirms a promo works for a given product_id (e.g. Sema vs Tirz) before
 * check_coupons_v3 / Groupon voucher validation.
 */
export const GROUPON_CHECK_COUPON_URL =
  process.env.GROUPON_CHECK_COUPON_URL ||
  'https://panel.whitelabelmd.com/nextvial/api/groupon/check-coupon'

export interface GrouponCheckCouponResult {
  ok: boolean
  message: string
  productId: string
  raw?: Record<string, unknown>
}

export async function checkGrouponCouponForProduct(
  productId: string,
  promoCode: string
): Promise<GrouponCheckCouponResult> {
  const code = promoCode.trim()
  const id = String(productId).trim()
  if (!code) {
    return { ok: false, message: 'Please enter a coupon code.', productId: id }
  }
  if (!id) {
    return { ok: false, message: 'product_id is required', productId: id }
  }

  try {
    const response = await fetch(GROUPON_CHECK_COUPON_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product_id: id,
        promo_codes: code,
      }),
      cache: 'no-store',
    })

    let payload: Record<string, unknown> = {}
    try {
      payload = (await response.json()) as Record<string, unknown>
    } catch {
      return {
        ok: false,
        message: 'Unable to validate coupon for this product. Please try again.',
        productId: id,
      }
    }

    const status = payload.status
    const ok = status === 1 || status === '1' || payload.ok === true
    const message =
      (typeof payload.message === 'string' && payload.message) ||
      (ok ? 'Coupon is valid.' : 'This coupon is not valid for the selected product.')

    return { ok, message, productId: id, raw: payload }
  } catch {
    return {
      ok: false,
      message: 'Unable to validate coupon for this product. Please try again.',
      productId: id,
    }
  }
}

/**
 * Run the top-layer check across bag product ids.
 * Returns which ids the promo is allowed for (Sema vs Tirz filtering).
 */
export async function filterProductsByGrouponCheck(
  productIds: string[],
  promoCode: string
): Promise<{ ok: true; productIds: string[] } | { ok: false; message: string }> {
  const unique = [...new Set(productIds.map(String).filter(Boolean))]
  if (!unique.length) {
    return { ok: false, message: 'product_id is required' }
  }

  const results = await Promise.all(
    unique.map((id) => checkGrouponCouponForProduct(id, promoCode))
  )
  const allowed = results.filter((r) => r.ok).map((r) => r.productId)

  if (!allowed.length) {
    const message =
      results.find((r) => !r.ok)?.message ||
      'This coupon is not valid for the selected product.'
    return { ok: false, message }
  }

  return { ok: true, productIds: allowed }
}
