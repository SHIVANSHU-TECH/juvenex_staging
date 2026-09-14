import Stripe from 'stripe'

import type {
  CheckoutSession,
  CheckoutSessionRequest,
  PaymentProvider,
  WebhookEvent,
} from './provider'

function stripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey || secretKey.startsWith('your_')) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return new Stripe(secretKey)
}

function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || secret.startsWith('your_')) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  }
  return secret
}

function metadataString(
  metadata: Stripe.Metadata | null | undefined,
  key: string
): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe'

  async createCheckoutSession(
    req: CheckoutSessionRequest
  ): Promise<CheckoutSession> {
    const stripe = stripeClient()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: req.customerEmail,
      client_reference_id: req.orderId,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      metadata: {
        ...(req.metadata ?? {}),
        orderId: req.orderId,
        amountCents: String(req.amountCents),
      },
      payment_intent_data: {
        metadata: {
          ...(req.metadata ?? {}),
          orderId: req.orderId,
          amountCents: String(req.amountCents),
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: req.currency,
            unit_amount: req.amountCents,
            product_data: {
              name: `Juvenex order ${req.orderId}`,
            },
          },
        },
      ],
    })

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL')
    }

    return {
      sessionId: session.id,
      sessionUrl: session.url,
      provider: this.name,
    }
  }

  verifyWebhookSignature(
    payload: string,
    signature: string | null
  ): WebhookEvent | null {
    if (!signature) return null

    let event: Stripe.Event
    try {
      event = stripeClient().webhooks.constructEvent(
        payload,
        signature,
        webhookSecret()
      )
    } catch {
      return null
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId =
        metadataString(session.metadata, 'orderId') ??
        session.client_reference_id ??
        null
      const amountCents = session.amount_total ?? Number(session.metadata?.amountCents)
      if (!orderId || !Number.isFinite(amountCents)) return null
      return {
        type: 'payment.succeeded',
        orderId,
        paymentReference:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.id,
        amountCents: Math.trunc(amountCents),
      }
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId =
        metadataString(session.metadata, 'orderId') ??
        session.client_reference_id ??
        null
      const amountCents = session.amount_total ?? Number(session.metadata?.amountCents)
      if (!orderId || !Number.isFinite(amountCents)) return null
      return {
        type: 'payment.failed',
        orderId,
        paymentReference: session.id,
        amountCents: Math.trunc(amountCents),
      }
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge
      const orderId = metadataString(charge.metadata, 'orderId')
      const amountCents = charge.amount_refunded || charge.amount
      if (!orderId || !Number.isFinite(amountCents)) return null
      return {
        type: 'payment.refunded',
        orderId,
        paymentReference: charge.id,
        amountCents: Math.trunc(amountCents),
      }
    }

    return null
  }
}
