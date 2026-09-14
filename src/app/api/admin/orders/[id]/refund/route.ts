// POST /api/admin/orders/[id]/refund
//
// Refund a paid order through the payment provider, then mark it refunded. If
// the order included a recurring membership, also stop future charges and
// cancel the subscription so a refund doesn't leave the customer being billed.
//
// Auth: super_admin only.
// Body (optional): { amount_cents?: number } — partial refund; defaults to the
// full order total. Idempotent-ish: refusing to act on an already-refunded
// order.

import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { parseMembershipFromItems } from '@/lib/membership-checkout'
import { getPaymentProvider, isPaymentConfigured } from '@/lib/payments'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

const idSchema = z.string().uuid('Invalid order id')
const bodySchema = z
  .object({ amount_cents: z.number().int().positive().optional() })
  .strict()

interface OrderRow {
  id: string
  user_id: string
  total_cents: number
  status: string
  payment_status: string | null
  payment_reference: string | null
  items: unknown
}

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return jsonError(401, 'Unauthorized')
    if (user.role !== 'super_admin') {
      return jsonError(403, 'Forbidden: super_admin role required')
    }

    const rl = rateLimit(`admin-order-refund:${user.id}`, 20, 60_000)
    if (!rl.success) return jsonError(429, 'Too many requests')

    if (!isPaymentConfigured()) {
      return jsonError(503, 'Payments are not available right now')
    }

    const { id: rawId } = await params
    const idParse = idSchema.safeParse(rawId)
    if (!idParse.success) return jsonError(400, 'Invalid order id')

    const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsedBody.success) return jsonError(400, 'Invalid request')

    const supabase = createAdminClient()
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, user_id, total_cents, status, payment_status, payment_reference, items')
      .eq('id', idParse.data)
      .maybeSingle<OrderRow>()

    if (fetchError) {
      logger.error('admin refund: order fetch failed', { error: fetchError.message })
      return jsonError(500, 'Internal server error')
    }
    if (!order) return jsonError(404, 'Order not found')

    // Only a settled payment can be refunded, and never twice.
    if (order.payment_status !== 'succeeded' || order.status === 'refunded') {
      return jsonError(
        422,
        `Order is not in a refundable state (status=${order.status}, payment=${order.payment_status ?? 'none'})`
      )
    }
    if (!order.payment_reference) {
      return jsonError(422, 'Order has no payment reference to refund against')
    }

    const amountCents = parsedBody.data.amount_cents ?? order.total_cents
    if (amountCents > order.total_cents) {
      return jsonError(400, 'Refund amount exceeds the order total')
    }

    const provider = getPaymentProvider()
    if (typeof provider.refundPayment !== 'function') {
      return jsonError(501, 'The payment provider does not support refunds')
    }

    const result = await provider.refundPayment(order.payment_reference, amountCents)
    if (!result.ok) {
      logger.error('admin refund: provider refund failed', {
        orderId: order.id,
        error: result.error,
      })
      return jsonError(502, `Refund failed: ${result.error ?? 'provider error'}`)
    }

    const fullRefund = amountCents >= order.total_cents

    // Mark the order refunded (full refund) — partials keep status 'paid' but
    // are recorded via audit. We never overwrite payment_reference.
    if (fullRefund) {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'refunded', payment_status: 'refunded' })
        .eq('id', order.id)
        .eq('payment_status', 'succeeded')
      if (updateError) {
        logger.error('admin refund: order update failed', {
          orderId: order.id,
          error: updateError.message,
        })
        // The money is already refunded at the provider; surface but don't
        // pretend it failed. Ops can reconcile the row.
        return jsonError(500, 'Refund processed but order update failed — contact engineering')
      }
    }

    // If this was a membership order, stop future recurring charges and cancel
    // the subscription so a refunded customer isn't billed again next month.
    let membershipCancelled = false
    if (fullRefund && parseMembershipFromItems(order.items) !== null) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('id, stripe_subscription_id')
        .eq('user_id', order.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; stripe_subscription_id: string | null }>()

      if (sub) {
        if (sub.stripe_subscription_id && typeof provider.cancelSubscription === 'function') {
          await provider.cancelSubscription(sub.stripe_subscription_id).catch(() => false)
        }
        const { error: subError } = await supabase
          .from('subscriptions')
          .update({ status: 'canceled', stripe_subscription_id: null })
          .eq('id', sub.id)
        if (subError) {
          logger.error('admin refund: subscription cancel failed', {
            orderId: order.id,
            error: subError.message,
          })
        } else {
          membershipCancelled = true
        }
      }
    }

    void logAudit({
      userId: user.id,
      action: 'admin.order.refunded',
      resourceType: 'order',
      resourceId: order.id,
      details: {
        provider: provider.name,
        amount_cents: amountCents,
        full_refund: fullRefund,
        membership_cancelled: membershipCancelled,
        refunded_amount_cents: result.refundedAmountCents,
      },
    }).catch(() => undefined)

    return Response.json({
      success: true,
      data: {
        order_id: order.id,
        refunded_amount_cents: result.refundedAmountCents ?? amountCents,
        full_refund: fullRefund,
        membership_cancelled: membershipCancelled,
      },
    })
  } catch (error: unknown) {
    logger.error('admin refund: unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonError(500, 'Internal server error')
  }
}
