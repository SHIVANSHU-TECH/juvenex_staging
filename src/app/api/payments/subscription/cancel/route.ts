// POST /api/payments/subscription/cancel
//
// Cancels the authenticated user's recurring membership (Netflix-style):
//   1. Tell the payment provider to stop future monthly charges.
//   2. Keep access until the end of the already-paid period (cancel-at-period
//      -end): we clear the recurring handle so the normal period-expiry applies
//      and leave current_period_end intact. The reconcile job / expiry check
//      lapses access once that date passes.
//
// Auth: requires the logged-in owner of the subscription.

import { type NextRequest } from 'next/server'

import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { getPaymentProvider } from '@/lib/payments'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

interface SubRow {
  id: string
  status: string
  stripe_subscription_id: string | null
  current_period_end: string | null
}

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status })
}

export async function POST(request: NextRequest) {
  void request
  try {
    const user = await getAuthUser()
    if (!user) return jsonError(401, 'Unauthorized')

    const rl = rateLimit(`subscription-cancel:${user.id}`, 10, 60_000)
    if (!rl.success) return jsonError(429, 'Too many requests')

    const supabase = createAdminClient()
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, status, stripe_subscription_id, current_period_end')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<SubRow>()

    if (!sub) return jsonError(404, 'No subscription found')
    if (sub.status === 'canceled') {
      return Response.json({ success: true, data: { status: 'canceled' } })
    }

    // Stop future provider charges for a recurring subscription. Best-effort:
    // even if the provider call fails we still update local state so the user
    // isn't stuck "subscribed"; the failure is logged for follow-up.
    if (sub.stripe_subscription_id) {
      const provider = getPaymentProvider()
      if (typeof provider.cancelSubscription === 'function') {
        const ok = await provider
          .cancelSubscription(sub.stripe_subscription_id)
          .catch(() => false)
        if (!ok) {
          logger.error('subscription cancel: provider cancel failed', {
            userId: user.id,
            reference: sub.stripe_subscription_id,
            provider: provider.name,
          })
        }
      }
    }

    // Cancel-at-period-end: clear the recurring handle (so normal period expiry
    // now applies) and keep current_period_end. If the period has already
    // lapsed (or is unset), end access now.
    const periodActive =
      sub.current_period_end != null &&
      !Number.isNaN(new Date(sub.current_period_end).getTime()) &&
      new Date(sub.current_period_end).getTime() > Date.now()

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        stripe_subscription_id: null,
        status: periodActive ? 'active' : 'canceled',
      })
      .eq('id', sub.id)

    if (updateError) {
      logger.error('subscription cancel: update failed', {
        userId: user.id,
        error: updateError.message,
      })
      return jsonError(500, 'Internal server error')
    }

    void logAudit({
      userId: user.id,
      action: 'subscription.canceled',
      resourceType: 'subscription',
      resourceId: sub.id,
      details: { cancel_at_period_end: periodActive },
    }).catch(() => undefined)

    return Response.json({
      success: true,
      data: {
        status: periodActive ? 'cancel_at_period_end' : 'canceled',
        access_until: periodActive ? sub.current_period_end : null,
      },
    })
  } catch (error: unknown) {
    logger.error('subscription cancel: unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonError(500, 'Internal server error')
  }
}
