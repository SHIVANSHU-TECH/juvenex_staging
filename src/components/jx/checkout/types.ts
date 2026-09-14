import type { BagLine } from '@/components/jx/JxStore'

/**
 * Outcome of a single line's `Create_Order` call. Upstream status semantics
 * (docs/juvenex-api-integration.md): 1 = success, 5 = payment declined
 * (an order_id may still come back), 0 = validation error. `skipped` and
 * `error` are client-side additions — see CheckoutForm's submit loop.
 */
export type LineOutcomeStatus = 'success' | 'declined' | 'invalid' | 'error' | 'skipped'

export interface LineResult {
  line: BagLine
  status: LineOutcomeStatus
  orderId?: string
  message: string
}

/** Per-line coupon UI state, keyed by BagLine.id in CheckoutForm. */
export interface CouponState {
  code: string
  status: 'idle' | 'checking' | 'applied' | 'error'
  /** The code exactly as upstream validated it — this, not the raw input, is what gets sent with the order. */
  appliedCode?: string
  discountAmount?: string
  message?: string
}

/**
 * Shipping + billing fields the customer fills in once for the whole bag.
 *
 * NO CARD FIELDS — BY DESIGN. Card data is collected inside Stripe's
 * PaymentElement iframe and never enters React state, so there is nothing here
 * to accidentally log, serialise, or persist.
 */
export interface CheckoutFields {
  firstName: string
  lastName: string
  phone: string
  address: string
  address2: string
  cityName: string
  stateName: string
  zipCode: string
  billingSameAsShipping: 'YES' | 'NO'
  billingAddress: string
  billingCityName: string
  billingStateName: string
  billingZipCode: string
}

export const EMPTY_FIELDS: CheckoutFields = {
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  address2: '',
  cityName: '',
  stateName: '',
  zipCode: '',
  billingSameAsShipping: 'YES',
  billingAddress: '',
  billingCityName: '',
  billingStateName: '',
  billingZipCode: '',
}

/** sessionStorage payload handed off to /store/checkout/success. Card data never touches this. */
export interface StoredCheckoutSuccess {
  completedAt: number
  lines: Array<{ id: string; title: string; subtitle: string; price: number; orderId: string }>
}

export const CHECKOUT_SUCCESS_KEY = 'jx.checkout.lastSuccess'
