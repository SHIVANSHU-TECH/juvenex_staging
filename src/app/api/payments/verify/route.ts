// POST /api/payments/verify
//
// Success-return safety net. When a customer lands back on /checkout/success
// after paying, the page calls this with the orderId. We ask the payment
// provider to authoritatively re-check the payment (provider.confirmOrderPaid),
// and if it confirms success — and the amount matches the order total — we flip
// the order to paid. This makes fulfillment resilient even if the provider
// webhook never arrives or fails to parse.
//
// Security:
//   - Requires an authenticated user who OWNS the order.
//   - The status is always re-fetched from the provider (never trusted from the
//     client); the amount must match the stored order total.
//   - Idempotent: only flips pending → succeeded.

import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import {
  activateMembershipFromOrder,
  expectedInitialChargeCents,
  recordMembershipAffiliateConversion,
} from '@/lib/membership-checkout'
import { getPaymentProvider } from '@/lib/payments'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

const bodySchema = z.object({ orderId: z.string().uuid() })

interface OrderRow {
  id: string
  user_id: string
  payment_status: string
  payment_reference: string | null
  total_cents: number
  items: unknown
}

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status })
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return jsonError(401, 'Unauthorized')

    const rl = rateLimit(`payments-verify:${user.id}`, 30, 60_000)
    if (!rl.success) return jsonError(429, 'Too many requests')

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError(400, 'Invalid request')
    const { orderId } = parsed.data

    const supabase = createAdminClient()
    const { data: order } = await supabase
      .from('orders')
      .select('id, user_id, payment_status, payment_reference, total_cents, items')
      .eq('id', orderId)
      .maybeSingle<OrderRow>()

    if (!order) return jsonError(404, 'Order not found')
    if (order.user_id !== user.id) return jsonError(403, 'Forbidden')

    // Already settled (likely the webhook beat us here) — nothing to do.
    if (order.payment_status !== 'pending') {
      return Response.json({ success: true, data: { status: order.payment_status } })
    }
    if (!order.payment_reference) {
      return Response.json({ success: true, data: { status: 'pending' } })
    }

    const provider = getPaymentProvider()
    if (typeof provider.confirmOrderPaid !== 'function') {
      // Provider relies solely on its webhook; no return-verify available.
      return Response.json({ success: true, data: { status: 'pending' } })
    }

    const event = await provider.confirmOrderPaid(order.payment_reference, orderId)
    if (!event || event.type !== 'payment.succeeded') {
      return Response.json({ success: true, data: { status: 'pending' } })
    }

    // Amount integrity. Compare against what the provider charges NOW: the full
    // tier price for a normal membership, but $0 for a 7-day trial (card is
    // tokenized; first real charge lands at day 7). Using total_cents here would
    // reject every trial start and leave the member card-captured but locked out.
    const expectedNowCents = expectedInitialChargeCents(order.items, order.total_cents)
    if (event.amountCents !== expectedNowCents) {
      logger.error('payments/verify: amount mismatch — not flipping order', {
        orderId,
        eventAmountCents: event.amountCents,
        expectedNowCents,
        orderTotalCents: order.total_cents,
      })
      return Response.json({ success: true, data: { status: 'pending' } })
    }

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        payment_status: 'succeeded',
        payment_reference: event.paymentReference || order.payment_reference,
      })
      .eq('id', orderId)
      .eq('payment_status', 'pending')
      .select('id, user_id, total_cents')

    if (updateError) {
      logger.error('payments/verify: order update failed', {
        orderId,
        error: updateError.message,
      })
      return jsonError(500, 'Internal server error')
    }

    const row = (updated ?? [])[0]
    if (row) {
      void logAudit({
        userId: row.user_id ?? user.id,
        action: 'order.paid',
        resourceType: 'order',
        resourceId: orderId,
        details: {
          provider: provider.name,
          via: 'success_return_verify',
          payment_reference: event.paymentReference,
          total_cents: row.total_cents,
        },
      }).catch(() => undefined)

      // Membership orders activate the subscription on first paid transition.
      // Self-contained (never throws); the order is already flipped to paid.
      const activated = await activateMembershipFromOrder(supabase, {
        id: orderId,
        user_id: row.user_id ?? user.id,
        items: order.items,
        // Use the Kurv payment_id from the confirmed event as the recurring
        // handle (cancel/status endpoints key off payment_id, not the
        // payment-request transaction_id).
        payment_reference: event.paymentReference,
      })
      if (activated) {
        void logAudit({
          userId: row.user_id ?? user.id,
          action: 'subscription.activated',
          resourceType: 'subscription',
          resourceId: orderId,
          details: { provider: provider.name, via: 'success_return_verify' },
        }).catch(() => undefined)
      }

      // Affiliate attribution (server-side backstop to the client pixel).
      void recordMembershipAffiliateConversion({
        id: orderId,
        items: order.items,
        totalCents: row.total_cents,
      })
    }

    return Response.json({ success: true, data: { status: 'paid' } })
  } catch (error: unknown) {
    logger.error('payments/verify: unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonError(500, 'Internal server error')
  }
}
