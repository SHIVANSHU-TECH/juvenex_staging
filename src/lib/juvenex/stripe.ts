/**
 * Stripe access for the jx store checkout.
 *
 * UNCONFIGURED IS A SUPPORTED STATE
 * The Stripe keys are not provisioned yet (Braeden still owes us the account),
 * and `.env.example` ships obvious placeholders. Nothing here throws at module
 * load and nothing throws on a missing key: `getStripeClient()` returns null and
 * the routes turn that into a 503 the UI can explain. A 500 stack trace on an
 * unconfigured box would be indistinguishable from a real outage.
 *
 * MANUAL CAPTURE — WHY THE MONEY MOVES IN TWO STEPS
 * The vendor creates one order per product, so a bag of N items needs N calls
 * that can each fail independently, after the customer has entered their card.
 * Authorizing once (capture_method: 'manual') and capturing only once every
 * vendor call has succeeded means the customer is either charged AND holds
 * orders, or is never charged at all. A failed bag releases the hold instead of
 * leaving a charge we would have to refund by hand.
 */
import Stripe from 'stripe'
import { logger } from '@/lib/logger'

/**
 * Values that look like a key but are not one. `.env.example` seeds
 * `pk_test_placeholder_...`/`sk_test_placeholder_...`, and the older payments
 * module uses a `your_` prefix; treating both as absent keeps a copied example
 * file from being mistaken for a working configuration.
 */
function isPlaceholder(value: string): boolean {
  return value.startsWith('your_') || value.includes('placeholder')
}

export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY
  return Boolean(key && !isPlaceholder(key))
}

let cached: Stripe | null = null

/** The client, or null when no usable key is configured. Never throws. */
export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey || isPlaceholder(secretKey)) return null
  if (!cached) cached = new Stripe(secretKey)
  return cached
}

/** The single 503 both checkout routes return when Stripe is not set up. */
export function paymentNotConfigured(): Response {
  logger.warn('stripe: STRIPE_SECRET_KEY not configured — checkout unavailable')
  return Response.json(
    {
      error: 'payment_not_configured',
      message:
        'Payment is not yet configured for this environment. No card was charged.',
    },
    { status: 503 }
  )
}

/**
 * Parses an upstream `discount_amount` into cents off a known line price.
 *
 * FORMAT IS NOT DOCUMENTED — READ BEFORE CHANGING
 * `Check_Coupons` returns `discount_amount` as a bare string and the vendor
 * docs do not say whether it is dollars or a percentage. Both are handled:
 * anything containing '%' is a percentage of `linePriceCents`, everything else
 * is an absolute dollar amount. An unparseable value returns null, and callers
 * MUST treat null as "refuse to build a charge" rather than "no discount" —
 * silently charging full price on a coupon the vendor accepted is the one
 * outcome worse than failing the checkout.
 */
export function discountToCents(
  discountAmount: string,
  linePriceCents: number
): number | null {
  const raw = discountAmount.trim()
  if (!raw) return null

  const isPercent = raw.includes('%')
  const numeric = Number(raw.replace(/[$,\s%]/g, ''))
  if (!Number.isFinite(numeric) || numeric < 0) return null

  const cents = isPercent
    ? Math.round((linePriceCents * numeric) / 100)
    : Math.round(numeric * 100)

  // A discount may zero a line but must never exceed it — an over-large value
  // would otherwise subtract from other lines in the cart total.
  return Math.max(0, Math.min(cents, linePriceCents))
}
