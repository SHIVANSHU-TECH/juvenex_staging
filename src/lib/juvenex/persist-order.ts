/**
 * Local persistence for WhiteLabelMD (jx storefront) orders.
 *
 * WHY THIS EXISTS
 * Until migration 050 the jx checkout flow persisted nothing: every order
 * lived only at the vendor and `OrdersList` re-fetched it live on each mount.
 * This module writes one local `orders` row per vendor order so history,
 * admin tooling, and reconciliation have something to read.
 *
 * NEVER THROWS — READ THIS BEFORE EDITING
 * Every call site runs AFTER the customer's card has already been charged by
 * `Create_Order`. A local write failure must never surface as an order
 * failure: the money moved, and a missing row is recoverable by
 * reconciliation (the vendor exposes `list-orders-updated-since`). So every
 * path here logs and returns `null` instead of throwing. Do not "improve"
 * this by letting errors propagate.
 *
 * CARDINALITY
 * Upstream `Create_Order` takes ONE product_id and has no quantity field, so
 * an N-line bag becomes N charges and N order ids. We write ONE row per
 * vendor order (1:1 with a charge), not one per bag.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptPHI } from '@/lib/encryption'
import { logger } from '@/lib/logger'
import { juvenexClient } from './client'

/** Postgres unique-violation. Raised by orders_vendor_order_id_uidx. */
const PG_UNIQUE_VIOLATION = '23505'

export const JUVENEX_VENDOR = 'whitelabelmd' as const

/** Shipping/billing snapshot persisted with the order. Shape mirrors what
 *  `buildOrderPayload` collects in CheckoutForm. */
export interface JuvenexAddress {
  address: string
  address2?: string
  city_name: string
  state_name: string
  zip_code: string
}

export interface PersistJuvenexOrderInput {
  user_id: string
  product_id: string
  /** `order_id` returned by Create_Order. Doubles as the idempotency key. */
  vendor_order_id: string
  /** Raw upstream status, stringified (1 = success). */
  vendor_status: string
  contact_email: string
  shipping_address: JuvenexAddress
  billing_address: JuvenexAddress
  first_name: string
  last_name: string
  phone: string
  /**
   * Vendor price for the product, as a decimal string ("199.00").
   * `buildOrderPayload` only sends product_id, so callers usually cannot
   * supply this — when omitted we look it up via Get_Product_Details.
   */
  product_price?: string
}

/**
 * Convert a vendor price string to integer cents.
 *
 * Vendor prices arrive as decimal strings and may carry a currency symbol or
 * thousands separators ("$1,199.00"). Parsing to float and multiplying by 100
 * reintroduces binary-float error (19.99 * 100 = 1998.9999...), so we split on
 * the decimal point and work in integers.
 *
 * Returns null for anything unparseable — the caller decides what to do rather
 * than silently persisting a wrong amount.
 */
export function priceToCents(raw: string | undefined | null): number | null {
  if (!raw) return null
  const cleaned = String(raw).replace(/[^0-9.]/g, '')
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return null

  const [whole = '0', frac = ''] = cleaned.split('.')
  if (whole === '' && frac === '') return null

  // Pad/truncate the fractional part to exactly 2 digits.
  const cents = (frac + '00').slice(0, 2)
  const value = Number(whole || '0') * 100 + Number(cents)
  return Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Best-effort price lookup. Returns null (never throws) so a vendor hiccup
 * degrades the row to total_cents=0 rather than losing the order record
 * entirely — an order we know about with an unknown amount is strictly more
 * useful than no row at all.
 */
async function lookupPriceCents(productId: string): Promise<number | null> {
  try {
    const details = await juvenexClient.getProductDetails(productId)
    return priceToCents(details?.product_data?.product_price)
  } catch (error: unknown) {
    logger.warn('persistJuvenexOrder: product price lookup failed', {
      productId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Insert the local mirror of a WhiteLabelMD order.
 *
 * @returns the new row's id, the existing row's id when this vendor order was
 *          already recorded (idempotent replay), or null if nothing was
 *          written. Never throws.
 */
export async function persistJuvenexOrder(
  input: PersistJuvenexOrderInput
): Promise<string | null> {
  try {
    const priceCents =
      priceToCents(input.product_price) ?? (await lookupPriceCents(input.product_id))

    if (priceCents === null) {
      // Not fatal: record the order with a zero amount and flag it loudly so
      // reconciliation can repair the total later.
      logger.warn('persistJuvenexOrder: unknown price, persisting total_cents=0', {
        productId: input.product_id,
        vendorOrderId: input.vendor_order_id,
      })
    }

    // PHI dual-write (migration 025): cleartext columns are retained for the
    // grace period because existing readers still fall back to them when the
    // _enc column is NULL. Do not drop either half here.
    const shippingAddressEnc = encryptPHI(JSON.stringify(input.shipping_address))
    const billingAddressEnc = encryptPHI(JSON.stringify(input.billing_address))

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('orders')
      .insert({
        user_id: input.user_id,
        total_cents: priceCents ?? 0,
        currency: 'usd',
        // The card already cleared at the vendor, so this is 'paid' locally.
        // Prescription review/shipping progress is tracked in vendor_status.
        status: 'paid',
        items: [
          {
            product_id: input.product_id,
            vendor_order_id: input.vendor_order_id,
            price_cents: priceCents ?? 0,
          },
        ],
        // Cleartext columns retained for grace-period backward compatibility.
        // Remove only when migration 025's Phase 2 drop finally lands.
        shipping_address: input.shipping_address,
        billing_address: input.billing_address,
        // Encrypted PHI columns (authoritative after migration 025).
        shipping_address_enc: shippingAddressEnc,
        billing_address_enc: billingAddressEnc,
        contact_email: input.contact_email,
        contact_phone: input.phone || null,
        payment_provider: JUVENEX_VENDOR,
        payment_reference: input.vendor_order_id,
        payment_status: 'succeeded',
        // Untouched: this order never goes through PrescribeRx automation.
        prescriberx_status: 'not_sent',
        vendor: JUVENEX_VENDOR,
        vendor_order_id: input.vendor_order_id,
        vendor_status: input.vendor_status,
        vendor_synced_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      // Unique violation === this vendor order is already recorded. That is a
      // successful idempotent replay, not a failure: return the existing id.
      if (error.code === PG_UNIQUE_VIOLATION) {
        logger.info('persistJuvenexOrder: vendor order already recorded', {
          vendorOrderId: input.vendor_order_id,
        })
        const { data: existing } = await supabase
          .from('orders')
          .select('id')
          .eq('vendor', JUVENEX_VENDOR)
          .eq('vendor_order_id', input.vendor_order_id)
          .maybeSingle()
        return existing?.id ?? null
      }

      logger.error('persistJuvenexOrder: orders INSERT failed', {
        userId: input.user_id,
        vendorOrderId: input.vendor_order_id,
        error: error.message,
      })
      return null
    }

    return data?.id ?? null
  } catch (error: unknown) {
    // Catches encryptPHI failures, a missing service-role key, network faults —
    // anything. The charge already happened; never let this reach the caller.
    logger.error('persistJuvenexOrder: unexpected failure', {
      userId: input.user_id,
      vendorOrderId: input.vendor_order_id,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
