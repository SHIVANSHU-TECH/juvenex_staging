import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { resolveMembershipSelection } from '@/lib/membership-checkout'

// POST /api/payments/membership/select
//
// Native IAP pre-step: stores the member's chosen plan + peptides on their
// subscription row BEFORE the StoreKit purchase runs, so when the RevenueCat
// webhook activates the membership it preserves the right peptide selection
// (the webhook keeps `existing.selected_protocols`). Does NOT grant access —
// status stays 'pending' until the webhook flips it to 'active' on payment.
//
// Only used inside the mobile app; the web flow carries selection through the
// Kurv order line instead.

const bodySchema = z.object({
  plan: z.string().min(1).max(64),
  selectedProtocols: z.array(z.string().min(1).max(64)).max(13).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const rl = rateLimit(`membership-select:${user.id}`, 20, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Validation failed' }, { status: 400 })
    }

    const resolved = resolveMembershipSelection(parsed.data.plan, parsed.data.selectedProtocols)
    if ('error' in resolved) {
      return Response.json({ success: false, error: resolved.error }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string | null }>()

    // NEVER downgrade/revoke an ALREADY-ACTIVE subscription. An existing paying
    // member re-opening checkout (to change peptides or re-buy) must keep their
    // access if they cancel the Apple sheet or the webhook is delayed. For an
    // active member we insert a SEPARATE pending intent row and leave the live
    // row untouched; the webhook activates on the actual store event. For a
    // new/pending/lapsed member we can safely reuse their latest row.
    const isActive = existing?.status === 'active' || existing?.status === 'trialing'
    const payload = {
      plan: resolved.tier.slug,
      selected_protocols: resolved.peptides,
      status: 'pending' as const,
    }

    if (existing?.id && !isActive) {
      const { error } = await supabase.from('subscriptions').update(payload).eq('id', existing.id)
      if (error) throw new Error(error.message)
    } else {
      // No row yet, or the existing row is active (don't touch it) → new pending intent.
      const { error } = await supabase
        .from('subscriptions')
        .insert({ user_id: user.id, ...payload })
      if (error) throw new Error(error.message)
    }

    return Response.json({ success: true, data: { plan: resolved.tier.slug, peptides: resolved.peptides } })
  } catch (error: unknown) {
    logger.error('membership select failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
