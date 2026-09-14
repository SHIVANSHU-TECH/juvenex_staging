// Payment provider abstraction.
//
// The Juvenex shop processes payments through a vendor that is still TBD.
// Rather than couple the checkout flow to a specific SDK (Stripe, Square,
// etc.), every concrete provider implements this interface and the rest of
// the codebase only ever talks to PaymentProvider.
//
// To swap providers:
//   1. Add a new file in this directory implementing PaymentProvider.
//   2. Wire it into the factory in ./index.ts under a new PAYMENT_PROVIDER
//      env value.
//   3. No changes are needed in /api/payments/checkout or /api/payments/webhook.
//
// Conventions:
//   - amounts are always cents (integers).
//   - currency is always lowercase ISO-4217 ('usd', 'eur', ...).
//   - createCheckoutSession returns a redirect URL — callers are responsible
//     for sending the user there.
//   - verifyWebhookSignature returns null on any failure (bad signature,
//     malformed body, unknown event) and a typed event on success. Callers
//     must always 200-OK back to the provider regardless.

export interface CheckoutSessionRequest {
  orderId: string
  amountCents: number
  currency: string
  customerEmail: string
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
  // When set, the provider sets up a RECURRING charge that auto-bills on this
  // interval after the customer authorizes once (Netflix-style). Omitted = a
  // one-time charge. Only providers that support recurring honor this; others
  // fall back to a single charge.
  recurring?: {
    interval: 'monthly'
    /** Full ISO 8601 timestamp of the first RECURRING charge. The initial
     *  charge is taken immediately on the hosted page; this is when the
     *  monthly series begins, so it must be comfortably in the future (Kurv
     *  rejects a past/near date with "Start date must be in the future").
     *  Set to ~one interval out (e.g. +1 month). */
    startDate: string
    /** Amount charged immediately on the hosted page, in cents. Usually equal
     *  to amountCents (first month billed now). */
    initialAmountCents: number
    /** How many recurring charges to schedule. Set high for an
     *  until-cancelled membership (cancellation stops it early). */
    totalPayments: number
  }
  /** Optional itemized lines shown on the provider's hosted pay page (Kurv
   *  cart_items). Display-only — totals are always driven by amountCents /
   *  recurring.initialAmountCents, never summed from these. */
  cartItems?: Array<{ name: string; quantity: number; unitPriceCents: number }>
}

export interface CheckoutSession {
  /** Provider-side identifier (e.g. Stripe Checkout Session id). */
  sessionId: string
  /** Redirect URL the user is sent to in order to pay. */
  sessionUrl: string
  /** Provider name — mirrors PaymentProvider.name; useful for logging. */
  provider: string
}

export type WebhookEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded'

export interface WebhookEvent {
  type: WebhookEventType
  /** The orderId that was passed into createCheckoutSession.metadata. */
  orderId: string
  /** Provider-side payment id (intent / charge / transaction). */
  paymentReference: string
  /** Charged amount in cents — used for sanity checks at fulfillment time. */
  amountCents: number
}

export interface PaymentProvider {
  /** Stable string identifier; persisted on the order row. */
  readonly name: string

  /**
   * Create a hosted-checkout session and return the redirect URL.
   * Implementations MUST forward orderId in provider metadata so that the
   * webhook can correlate the event back to the order.
   */
  createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSession>

  /**
   * Validate a webhook delivery and decode it into a normalized
   * WebhookEvent. Returns null on any failure — the caller treats null as
   * "ignore this delivery" and still returns 200 to the provider.
   */
  // Sync providers (Stripe/AuthNet/stub) return directly; providers without a
  // signature scheme (e.g. Kurv) re-fetch the authoritative record and return a
  // Promise. The webhook route awaits the result either way.
  verifyWebhookSignature(
    payload: string,
    signature: string | null
  ): WebhookEvent | null | Promise<WebhookEvent | null>

  /**
   * Optional authoritative re-check used by the success-return fallback
   * (/api/payments/verify). For providers whose webhook can't be cryptographically
   * verified (e.g. Kurv), this re-fetches the order's payment status from the
   * provider when the customer lands back on the success page — so an order still
   * flips to paid even if the webhook never arrives or fails to parse.
   * `reference` is the order's stored payment_reference; `orderId` is ours.
   */
  confirmOrderPaid?(
    reference: string,
    orderId: string
  ): Promise<WebhookEvent | null>

  /**
   * Cancel a recurring subscription set up via createCheckoutSession with a
   * `recurring` interval. `reference` is the provider-side handle we stored
   * (for Kurv, the payment-request id). Returns true on success. Optional —
   * providers without recurring support omit it.
   */
  cancelSubscription?(reference: string): Promise<boolean>

  /**
   * Best-effort status of a recurring subscription, used by the reconcile job
   * to lapse access when the provider has stopped billing. 'active' = still
   * billing, 'ended' = cancelled/expired/failed-out, 'unknown' = could not
   * determine (leave access untouched). Optional.
   */
  getRecurringStatus?(
    reference: string
  ): Promise<'active' | 'ended' | 'unknown'>

  /**
   * Issue a refund for a settled payment. `reference` is the provider payment
   * id (Kurv payment_id); `amountCents` is the amount to refund (full or
   * partial). Returns ok plus the refunded amount the provider confirmed.
   * Best-effort: returns { ok: false, error } instead of throwing. Optional —
   * providers without refund support omit it.
   */
  refundPayment?(
    reference: string,
    amountCents: number
  ): Promise<{ ok: boolean; refundedAmountCents?: number; error?: string }>
}
