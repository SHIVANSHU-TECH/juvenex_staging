// POST /api/patient/membership/protocols
//
// Lets an ACTIVE member change the peptides included in their membership (the
// "included products"), up to their tier's cap. Previously the selection could
// only be set at registration/checkout — there was no way to edit it, so a swap
// meant a DB write by staff. This is the self-service edit surface.
//
// The membership TIER (price, how many peptides) is unchanged; only WHICH
// peptides are unlocked changes. `subscriptions.selected_protocols` drives the
// shop's server-side access gate, so this updates what the member can browse
// and order. The actual prescription still requires provider review via VIP telehealth (/telehealth).

import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { peptidesForPlan, tierForPlan } from '@/lib/marketplace-access'
import { rateLimit } from '@/lib/rate-limit'
import {
  SUBSCRIPTION_ACCESS_COLUMNS,
  subscriptionGrantsAccess,
} from '@/lib/subscription-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

const bodySchema = z.object({
  selectedProtocols: z.array(z.string().min(1).max(64)).max(13),
})

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status })
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return jsonError(401, 'Unauthorized')

    const rl = rateLimit(`membership-protocols:${user.id}`, 20, 60_000)
    if (!rl.success) return jsonError(429, 'Too many requests')

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError(400, 'Invalid request')

    const supabase = createAdminClient()

    // Newest subscription row — the same one the access gate reads.
    const { data: sub } = await supabase
      .from('subscriptions')
      .select(`id, plan, selected_protocols, ${SUBSCRIPTION_ACCESS_COLUMNS}`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string
        plan: string | null
        selected_protocols: string[] | null
        status?: unknown
        current_period_end?: unknown
        stripe_subscription_id?: unknown
      }>()

    if (!sub || !subscriptionGrantsAccess(sub)) {
      return jsonError(403, 'An active membership is required to edit peptides.')
    }

    const tier = tierForPlan(sub.plan)
    if (tier.maxSelectablePeptides === null) {
      return jsonError(400, 'Your plan already includes every peptide.')
    }
    if (tier.maxSelectablePeptides === 0) {
      return jsonError(400, 'Upgrade to a paid plan to select peptides.')
    }

    // Authoritative resolve+clamp: exactly what the shop gate would grant. Over-
    // selection is clamped to the tier cap and unknown slugs are dropped, so the
    // stored value can never exceed the plan or contain junk.
    const resolved = [...peptidesForPlan(sub.plan, parsed.data.selectedProtocols)]

    const { error: updErr } = await supabase
      .from('subscriptions')
      .update({ selected_protocols: resolved })
      .eq('id', sub.id)

    if (updErr) {
      logger.error('membership protocols update failed', {
        userId: user.id,
        error: updErr.message,
      })
      return jsonError(500, 'Could not update your peptides. Please try again.')
    }

    void logAudit({
      userId: user.id,
      action: 'membership.protocols_updated',
      resourceType: 'subscription',
      resourceId: sub.id,
      details: { plan: sub.plan, selected_protocols: resolved },
    }).catch(() => undefined)

    return Response.json({
      success: true,
      data: { selectedProtocols: resolved, cap: tier.maxSelectablePeptides },
    })
  } catch (error: unknown) {
    logger.error('membership protocols unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError(500, 'Internal server error')
  }
}
