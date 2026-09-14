// Stub payment provider used in development and integration tests until the
// real vendor is selected. Behavior:
//
//   - createCheckoutSession returns a sessionUrl that points back into the
//     Juvenex app (/checkout/stub-pay?orderId=...). That page can show a
//     fake "Pay" button which calls /api/payments/confirm to flip the order
//     to paid — exactly mimicking what a real provider's webhook would do.
//
//   - verifyWebhookSignature accepts everything. We don't run a real webhook
//     in stub mode; this exists so /api/payments/webhook can be wired
//     identically in dev and prod, and so a forced webhook test from curl
//     never hard-fails.
//
// IMPORTANT: this provider is deliberately permissive. Never enable it in
// production by setting PAYMENT_PROVIDER=stub — the factory raises if the
// env var is set to anything other than a known production provider once
// the real vendor is integrated.

import {
  CheckoutSession,
  CheckoutSessionRequest,
  PaymentProvider,
  WebhookEvent,
  WebhookEventType,
} from './provider'
import { withBasePath } from '@/lib/base-path'

const ALLOWED_EVENT_TYPES: ReadonlyArray<WebhookEventType> = [
  'payment.succeeded',
  'payment.failed',
  'payment.refunded',
]

function isWebhookEventType(value: unknown): value is WebhookEventType {
  return (
    typeof value === 'string' &&
    (ALLOWED_EVENT_TYPES as ReadonlyArray<string>).includes(value)
  )
}

export class StubProvider implements PaymentProvider {
  readonly name = 'stub'

  async createCheckoutSession(
    req: CheckoutSessionRequest
  ): Promise<CheckoutSession> {
    // Use the orderId itself as the session id. The real-provider equivalent
    // would be a Stripe `cs_test_...` string; for the stub we want something
    // deterministic and traceable.
    const sessionId = `stub_${req.orderId}`

    // The fake-pay page is purely a client UI surface; this module never
    // renders it. We just point the user there.
    const base = req.successUrl // any URL we own; reuse to derive origin
    let origin = ''
    try {
      origin = new URL(base).origin
    } catch {
      // Fall back to a relative URL if successUrl is malformed.
      origin = ''
    }

    const sessionUrl = `${origin}${withBasePath('/checkout/stub-pay')}?orderId=${encodeURIComponent(
      req.orderId
    )}`

    return {
      sessionId,
      sessionUrl,
      provider: this.name,
    }
  }

  verifyWebhookSignature(
    payload: string,
    _signature: string | null
  ): WebhookEvent | null {
    // Stub mode trusts the body unconditionally. A real provider would HMAC
    // the raw payload against `_signature` and reject mismatches.
    try {
      const parsed: unknown = JSON.parse(payload)
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return null
      }

      const obj = parsed as Record<string, unknown>
      const type = obj.type
      const orderId = obj.orderId
      const paymentReference = obj.paymentReference
      const amountCents = obj.amountCents

      if (!isWebhookEventType(type)) return null
      if (typeof orderId !== 'string' || orderId.length === 0) return null
      if (typeof paymentReference !== 'string' || paymentReference.length === 0)
        return null
      if (typeof amountCents !== 'number' || !Number.isFinite(amountCents))
        return null

      return {
        type,
        orderId,
        paymentReference,
        amountCents: Math.trunc(amountCents),
      }
    } catch {
      return null
    }
  }
}
