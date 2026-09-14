import { getAuthUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { tierForPlanAndProtocols } from '@/lib/marketplace-access'
import { subscriptionGrantsAccess } from '@/lib/subscription-access'

// GET /api/payments/subscription — returns the authenticated user's current
// subscription (if any). Safe to call before Stripe is wired: returns
// `{ subscription: null, active: false }` when no subscription row exists.
export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id, plan, status, current_period_end, stripe_subscription_id, selected_protocols')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Missing table or row → treat as "no subscription" rather than failing.
    if (error && error.code !== 'PGRST116') {
      logger.error('Failed to fetch subscription', { error: error.message })
    }

    const subscription = data ?? null
    // Recurring 'active' subs (provider auto-bills) stay active until cancelled;
    // 'trialing' and one-time grants are period-bound. See subscription-access.
    const active = subscriptionGrantsAccess(subscription)
    const accessTier = tierForPlanAndProtocols(
      active ? (subscription?.plan as string | null | undefined) : null,
      active ? (subscription?.selected_protocols as string[] | null | undefined) : null
    )

    return Response.json({
      success: true,
      subscription,
      active,
      access: {
        tier: accessTier.slug,
        tier_label: accessTier.label,
        peptides: accessTier.peptides,
      },
    })
  } catch (error: unknown) {
    logger.error('subscription route threw', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: true, subscription: null, active: false })
  }
}
