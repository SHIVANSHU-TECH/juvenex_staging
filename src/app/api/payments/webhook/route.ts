// POST /api/payments/webhook
//
// Provider webhook landing pad.
//
// DEV-ONLY NOTICE (stub mode):
//   The stub provider's verifyWebhookSignature trusts the raw body
//   unconditionally. This is intentional for local development. This
//   endpoint MUST NOT be reachable in production with a stub provider.
//   A hard 503 gate at the top of POST enforces this invariant.
//
//   Full webhook_events idempotency table (event-id deduplication) is
//   deferred to the Stripe rollout. Current idempotency relies on
//   payment_status column guards per handler.
//
// Signature verification:
//   All calls are verified via PaymentProvider.verifyWebhookSignature
//   against the raw request body and provider-supplied signature header.
//   The service-role Supabase client is used because there is no user
//   session.
//
// Response policy:
//   Returns 200 even on internal failures so the vendor does not retry
//   indefinitely. Real failures are written to structured logs. 503 is
//   returned for the production/stub gate and for IP rate-limit exhaustion
//   (both are operator errors, not vendor errors).

import { type NextRequest } from 'next/server'

import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import {
  activateMembershipFromOrder,
  recordMembershipAffiliateConversion,
} from '@/lib/membership-checkout'
import { getPaymentProvider } from '@/lib/payments'
import type { WebhookEvent } from '@/lib/payments'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

const SIGNATURE_HEADER_CANDIDATES = [
  'stripe-signature',
  'x-anet-signature',
  'x-square-signature',
  'x-signature',
  'x-webhook-signature',
] as const

function pickSignature(req: NextRequest): string | null {
  for (const name of SIGNATURE_HEADER_CANDIDATES) {
    const value = req.headers.get(name)
    if (value) return value
  }
  return null
}

/**
 * Extract the caller IP from standard proxy headers or the socket. Used only
 * as a rate-limit key — never trusted for access control.
 */
function callerIp(req: NextRequest): string {
  const forwarded =
    req.headers.get('x-forwarded-for') ??
    req.headers.get('x-real-ip') ??
    'unknown'
  // x-forwarded-for may be a comma-separated list; take the leftmost (client).
  return forwarded.split(',')[0]?.trim() ?? 'unknown'
}

function ok(): Response {
  // Provider expects a 200 to acknowledge receipt.
  return Response.json({ received: true })
}

function serviceUnavailable(): Response {
  return Response.json(
    { success: false, error: 'Service unavailable' },
    { status: 503 }
  )
}

/**
 * Best-effort audit log for a webhook state transition. actor_id is null
 * because the webhook is service-role and there is no human actor. Never
 * throws — logAudit catches its own errors and we additionally swallow.
 *
 * `eventType` is already shaped like 'payment.succeeded'; we prefix it with
 * 'order.' so audit consumers can filter on action LIKE 'order.payment.%'
 * without producing the doubled segment ('order.payment.payment.succeeded')
 * that earlier revisions accidentally wrote.
 */
function auditWebhook(
  eventType: WebhookEvent['type'],
  event: WebhookEvent,
  provider: string
): void {
  void logAudit({
    action: `order.${eventType}`,
    resourceType: 'order',
    resourceId: event.orderId,
    details: {
      provider,
      payment_reference: event.paymentReference,
    },
  }).catch((err: unknown) => {
    logger.error('payments/webhook: audit log failed', {
      orderId: event.orderId,
      eventType,
      error: err instanceof Error ? err.message : String(err),
    })
  })
}

async function handleSucceeded(
  event: WebhookEvent,
  provider: string
): Promise<void> {
  const supabase = createAdminClient()

  // Amount integrity check: event.amountCents must match the stored order
  // total. Mismatch indicates a tampered or misrouted webhook — reject it.
  const { data: orderRow, error: fetchError } = await supabase
    .from('orders')
    .select('id, user_id, total_cents, items, payment_reference')
    .eq('id', event.orderId)
    .maybeSingle<{
      id: string
      user_id: string
      total_cents: number
      items: unknown
      payment_reference: string | null
    }>()

  if (fetchError) {
    logger.error('payments/webhook: order fetch for amount check failed', {
      orderId: event.orderId,
      error: fetchError.message,
    })
    return
  }

  if (!orderRow) {
    logger.warn('payments/webhook: succeeded event for unknown order', {
      orderId: event.orderId,
      provider,
    })
    return
  }

  if (event.amountCents !== orderRow.total_cents) {
    void logAudit({
      action: 'order.payment.amount_mismatch',
      resourceType: 'order',
      resourceId: event.orderId,
      details: {
        provider,
        event_amount_cents: event.amountCents,
        order_total_cents: orderRow.total_cents,
      },
    }).catch(() => undefined)

    logger.error('payments/webhook: amount mismatch — webhook rejected', {
      orderId: event.orderId,
      provider,
      eventAmountCents: event.amountCents,
      orderTotalCents: orderRow.total_cents,
    })
    // Non-production: return without updating so the mismatch is visible.
    // Production: same — we do not flip the order; ops must investigate.
    return
  }

  // Idempotency: only flip orders whose payment_status is still 'pending'.
  // .select() returns the affected rows so we can detect a duplicate webhook
  // delivery (zero rows) and skip emitting the order.paid audit event twice.
  const { data: updated, error } = await supabase
    .from('orders')
    .update({
      status: 'paid',
      payment_status: 'succeeded',
      payment_reference: event.paymentReference,
    })
    .eq('id', event.orderId)
    .eq('payment_status', 'pending')
    .select('id, user_id, total_cents')

  if (error) {
    logger.error('payments/webhook: succeeded UPDATE failed', {
      orderId: event.orderId,
      error: error.message,
    })
    return
  }

  // Zero rows = duplicate webhook (already paid/refunded/cancelled). The
  // earlier delivery already emitted the order.paid audit event; do not
  // double-fire.
  const row = (updated ?? [])[0]
  if (!row) {
    logger.info('payments/webhook: succeeded duplicate ignored', {
      orderId: event.orderId,
      provider,
    })
    return
  }

  auditWebhook('payment.succeeded', event, provider)

  // Fulfillment-queue signal — the admin queue tails 'order.paid' events to
  // pick up newly paid orders for manual PrescribeRx forwarding (reverse-flow
  // money model). Best-effort and idempotent because we already gated on the
  // row being newly updated.
  void logAudit({
    userId: row.user_id ?? undefined,
    action: 'order.paid',
    resourceType: 'order',
    resourceId: event.orderId,
    details: {
      provider,
      payment_reference: event.paymentReference,
      total_cents: row.total_cents,
    },
  }).catch((err: unknown) => {
    logger.error('payments/webhook: order.paid audit log failed', {
      orderId: event.orderId,
      error: err instanceof Error ? err.message : String(err),
    })
  })

  // If this paid order is a membership purchase, activate the subscription.
  // Idempotent and self-contained — never throws (returns false on failure),
  // so a membership-activation problem can't break the 200 we owe the vendor.
  const activated = await activateMembershipFromOrder(supabase, {
    id: event.orderId,
    user_id: orderRow.user_id,
    items: orderRow.items,
    // Kurv's recurring cancel/status endpoints key off payment_id, which is what
    // the event carries (recordToEvent → payment_id). Store THAT as the
    // recurring handle so cancellation (DELETE /payments/subscription/{payment_id})
    // and the reconcile status check resolve correctly.
    payment_reference: event.paymentReference,
  })
  if (activated) {
    void logAudit({
      userId: orderRow.user_id,
      action: 'subscription.activated',
      resourceType: 'subscription',
      resourceId: event.orderId,
      details: { provider, via: 'webhook' },
    }).catch(() => undefined)
  }

  // Affiliate attribution (server-side backstop to the client pixel).
  void recordMembershipAffiliateConversion({
    id: event.orderId,
    items: orderRow.items,
    totalCents: row.total_cents,
  })
}

async function handleFailed(
  event: WebhookEvent,
  provider: string
): Promise<void> {
  const supabase = createAdminClient()
  // Idempotency guard: only flip an order whose payment is still pending.
  // Once the order has been cancelled/refunded/succeeded we never overwrite
  // it. We also flip status='cancelled' so the order does not sit in
  // 'pending' forever after a definitive payment failure.
  // payment_reference is intentionally NOT overwritten — keep the original
  // session reference immutable; only status fields change.
  const { data: updated, error } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      payment_status: 'failed',
    })
    .eq('id', event.orderId)
    .eq('payment_status', 'pending')
    .select('id')

  if (error) {
    logger.error('payments/webhook: failed UPDATE failed', {
      orderId: event.orderId,
      error: error.message,
    })
    return
  }
  if (!(updated ?? [])[0]) {
    logger.info('payments/webhook: failed duplicate ignored', {
      orderId: event.orderId,
      provider,
    })
    return
  }
  auditWebhook('payment.failed', event, provider)
}

async function handleRefunded(
  event: WebhookEvent,
  provider: string
): Promise<void> {
  const supabase = createAdminClient()
  // Idempotency guard: only process refund when payment_status = 'succeeded'.
  // This prevents a refund webhook from accidentally flipping a pending or
  // already-refunded order. payment_reference is NOT overwritten — keep the
  // original session reference immutable; only status fields change.
  const { data: updated, error } = await supabase
    .from('orders')
    .update({
      status: 'refunded',
      payment_status: 'refunded',
    })
    .eq('id', event.orderId)
    .eq('payment_status', 'succeeded')
    .select('id')

  if (error) {
    logger.error('payments/webhook: refunded UPDATE failed', {
      orderId: event.orderId,
      error: error.message,
    })
    return
  }
  if (!(updated ?? [])[0]) {
    logger.info('payments/webhook: refunded duplicate or invalid-state ignored', {
      orderId: event.orderId,
      provider,
    })
    return
  }
  auditWebhook('payment.refunded', event, provider)
}

export async function POST(request: NextRequest) {
  // ------------------------------------------------------------------
  // IP-keyed rate limit — 60 calls/min regardless of provider or mode.
  // Applied before provider resolution to protect against enumeration.
  // ------------------------------------------------------------------
  const ip = callerIp(request)
  const ipRl = rateLimit(`payments-webhook:ip:${ip}`, 60, 60_000)
  if (!ipRl.success) {
    logger.warn('payments/webhook: IP rate limit exceeded', { ip })
    return serviceUnavailable()
  }

  // ------------------------------------------------------------------
  // Production / stub gate.
  // If NODE_ENV=production and the configured provider is stub (or not
  // set), the webhook endpoint must not be callable. A real provider is
  // required in production — the stub is dev-only.
  // ------------------------------------------------------------------
  const providerName = process.env.PAYMENT_PROVIDER ?? 'stub'
  if (process.env.NODE_ENV === 'production' && providerName === 'stub') {
    logger.error('payments/webhook: stub provider called in production — rejected', {
      ip,
    })
    return serviceUnavailable()
  }

  // Always 200 — even on internal exceptions — to suppress provider retries.
  try {
    const rawBody = await request.text()
    const signature = pickSignature(request)

    const provider = getPaymentProvider()

    // Redundant guard: even if getPaymentProvider() somehow returned a stub
    // in production (should not happen given the factory throws), block it.
    if (process.env.NODE_ENV === 'production' && provider.name === 'stub') {
      logger.error('payments/webhook: stub provider instance in production — rejected', {
        ip,
      })
      return serviceUnavailable()
    }

    const event = await provider.verifyWebhookSignature(rawBody, signature)

    if (!event) {
      logger.warn('payments/webhook: signature verification or decode failed', {
        provider: provider.name,
        bodyLength: rawBody.length,
      })
      return ok()
    }

    switch (event.type) {
      case 'payment.succeeded':
        await handleSucceeded(event, provider.name)
        break
      case 'payment.failed':
        await handleFailed(event, provider.name)
        break
      case 'payment.refunded':
        await handleRefunded(event, provider.name)
        break
      default: {
        // Exhaustiveness: this branch should be unreachable because
        // verifyWebhookSignature only emits the three known types.
        const _exhaustive: never = event.type
        logger.warn('payments/webhook: unhandled event type', {
          type: _exhaustive,
        })
      }
    }

    return ok()
  } catch (error: unknown) {
    logger.error('payments/webhook: unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return ok()
  }
}
