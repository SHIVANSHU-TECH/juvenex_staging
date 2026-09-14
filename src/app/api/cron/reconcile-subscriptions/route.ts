// POST /api/cron/reconcile-subscriptions
//
// Reconcile job for recurring memberships. Kurv's renewal/failure webhook
// format is not documented, so recurring subscriptions are kept "active until
// cancelled" and this job is the authoritative backstop: it asks the provider
// for the current status of each active recurring subscription and lapses any
// that the provider reports as ended (cancelled / expired / failed-out).
//
// Auth: a shared secret. Set CRON_SECRET in the environment and have the cron
// caller send it as `Authorization: Bearer <secret>` (or `x-cron-secret`).
// Without CRON_SECRET configured the endpoint is disabled (503).

import { type NextRequest } from 'next/server'

import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import {
  activateMembershipFromOrder,
  expectedInitialChargeCents,
  parseMembershipFromItems,
} from '@/lib/membership-checkout'
import { getPaymentProvider } from '@/lib/payments'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_BATCH = 500
// How far back to scan for paid-but-stuck membership orders. A missed/garbled
// webhook leaves the order 'pending' forever; this window lets the backstop
// re-confirm with the provider and activate access.
const RESCUE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

interface RecurringSub {
  id: string
  user_id: string
  stripe_subscription_id: string | null
}

/** One calendar month from now, ISO — the post-trial paid billing period end. */
function oneMonthFromNowIso(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

interface PendingOrderRow {
  id: string
  user_id: string
  total_cents: number
  items: unknown
  payment_reference: string | null
}

/**
 * Rescue membership orders that were actually paid at the provider but never
 * flipped locally (e.g. a webhook whose body we failed to parse). For each
 * recent pending membership order we re-confirm with the provider; on a
 * confirmed, amount-matched success we flip the order to paid and activate the
 * subscription. Idempotent — only acts on rows still 'pending'.
 */
async function rescuePendingMembershipOrders(): Promise<{
  scanned: number
  rescued: number
}> {
  const supabase = createAdminClient()
  const provider = getPaymentProvider()
  if (typeof provider.confirmOrderPaid !== 'function') {
    return { scanned: 0, rescued: 0 }
  }

  const sinceIso = new Date(Date.now() - RESCUE_WINDOW_MS).toISOString()
  const { data, error } = await supabase
    .from('orders')
    .select('id, user_id, total_cents, items, payment_reference')
    .eq('payment_status', 'pending')
    .not('payment_reference', 'is', null)
    .gte('created_at', sinceIso)
    .limit(MAX_BATCH)

  if (error) {
    logger.error('reconcile: pending-order scan failed', { error: error.message })
    return { scanned: 0, rescued: 0 }
  }

  const orders = (data ?? []) as PendingOrderRow[]
  // Only membership orders are rescued here — physical product fulfillment is a
  // separate (manual) flow.
  const membershipOrders = orders.filter(
    (o) => parseMembershipFromItems(o.items) !== null
  )

  let rescued = 0
  for (const order of membershipOrders) {
    if (!order.payment_reference) continue
    const event = await provider
      .confirmOrderPaid!(order.payment_reference, order.id)
      .catch(() => null)

    if (!event || event.type !== 'payment.succeeded') continue
    // Compare against the amount charged NOW ($0 for a trial start, full price
    // otherwise) — not total_cents, which would reject every $0 trial rescue.
    const expectedNowCents = expectedInitialChargeCents(order.items, order.total_cents)
    if (event.amountCents !== expectedNowCents) {
      logger.error('reconcile: rescue amount mismatch — skipping', {
        orderId: order.id,
        eventAmountCents: event.amountCents,
        expectedNowCents,
        orderTotalCents: order.total_cents,
      })
      continue
    }

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        payment_status: 'succeeded',
        payment_reference: event.paymentReference || order.payment_reference,
      })
      .eq('id', order.id)
      .eq('payment_status', 'pending')
      .select('id')

    if (updateError) {
      logger.error('reconcile: rescue order update failed', {
        orderId: order.id,
        error: updateError.message,
      })
      continue
    }
    if (!(updated ?? [])[0]) continue // someone else flipped it first

    void logAudit({
      userId: order.user_id,
      action: 'order.paid',
      resourceType: 'order',
      resourceId: order.id,
      details: { provider: provider.name, via: 'reconcile_rescue' },
    }).catch(() => undefined)

    const activated = await activateMembershipFromOrder(supabase, {
      id: order.id,
      user_id: order.user_id,
      items: order.items,
      payment_reference: event.paymentReference,
    })
    if (activated) {
      rescued += 1
      void logAudit({
        userId: order.user_id,
        action: 'subscription.activated',
        resourceType: 'subscription',
        resourceId: order.id,
        details: { provider: provider.name, via: 'reconcile_rescue' },
      }).catch(() => undefined)
    }
  }

  return { scanned: membershipOrders.length, rescued }
}

/**
 * Resolve free trials whose 7-day window has reached its end. At day 7 the Kurv
 * contract fires the first REAL charge (payment_start_date = +7d). Kurv has no
 * documented renewal webhook, so this poll is the authoritative backstop:
 *   - provider reports the recurring handle healthy  → the day-7 charge went
 *     through → convert 'trialing' → 'active' with a fresh 30-day period (the
 *     access gate now treats it as active-until-cancelled).
 *   - provider reports it ended (failed / cancelled) → lapse it.
 *   - 'unknown' (transient API hiccup) → leave it; the access gate already drops
 *     access once the 7-day period lapses, so we never grant unpaid access, and
 *     the next run retries.
 *
 * IMPORTANT (needs live-card validation): whether Kurv's payment record status
 * flips to reflect the day-7 charge — versus still showing the $0-initial
 * success — has NOT been observed against a real card. Until a live trial is
 * run end-to-end, treat conversions from this pass as provisional. We only scan
 * rows whose current_period_end has already passed so we never convert before
 * the window closes.
 */
async function convertOrLapseTrials(): Promise<{
  converted: number
  lapsedTrials: number
}> {
  const supabase = createAdminClient()
  const provider = getPaymentProvider()
  if (typeof provider.getRecurringStatus !== 'function') {
    return { converted: 0, lapsedTrials: 0 }
  }

  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, user_id, stripe_subscription_id')
    .eq('status', 'trialing')
    .not('stripe_subscription_id', 'is', null)
    .lte('current_period_end', nowIso)
    .limit(MAX_BATCH)

  if (error) {
    logger.error('reconcile: trial-conversion scan failed', { error: error.message })
    return { converted: 0, lapsedTrials: 0 }
  }

  const trials = (data ?? []) as RecurringSub[]
  let converted = 0
  let lapsedTrials = 0

  for (const sub of trials) {
    if (!sub.stripe_subscription_id) continue
    if (sub.stripe_subscription_id.startsWith('revenuecat:')) continue
    const status = await provider
      .getRecurringStatus!(sub.stripe_subscription_id)
      .catch(() => 'unknown' as const)

    if (status === 'active') {
      const { error: convErr } = await supabase
        .from('subscriptions')
        .update({ status: 'active', current_period_end: oneMonthFromNowIso() })
        .eq('id', sub.id)
        .eq('status', 'trialing')
      if (convErr) {
        logger.error('reconcile: trial convert failed', {
          subscriptionId: sub.id,
          error: convErr.message,
        })
        continue
      }
      converted += 1
      void logAudit({
        userId: sub.user_id,
        action: 'subscription.activated',
        resourceType: 'subscription',
        resourceId: sub.id,
        details: { via: 'reconcile_trial_convert' },
      }).catch(() => undefined)
    } else if (status === 'ended') {
      const { error: lapseErr } = await supabase
        .from('subscriptions')
        .update({ status: 'canceled', stripe_subscription_id: null })
        .eq('id', sub.id)
        .eq('status', 'trialing')
      if (lapseErr) {
        logger.error('reconcile: trial lapse failed', {
          subscriptionId: sub.id,
          error: lapseErr.message,
        })
        continue
      }
      lapsedTrials += 1
      void logAudit({
        userId: sub.user_id,
        action: 'subscription.lapsed',
        resourceType: 'subscription',
        resourceId: sub.id,
        details: { via: 'reconcile_trial_ended' },
      }).catch(() => undefined)
    }
    // 'unknown' → leave for the next run (access already period-gated).
  }

  return { converted, lapsedTrials }
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.headers.get('x-cron-secret') ??
    ''
  return header === secret
}

async function reconcile(): Promise<{
  checked: number
  lapsed: number
  rescued: number
  rescueScanned: number
  trialsConverted: number
  trialsLapsed: number
}> {
  // Rescue paid-but-stuck membership orders first so a newly-activated
  // subscription is immediately visible to the passes below.
  const rescue = await rescuePendingMembershipOrders()
  // Resolve trials whose 7-day window has closed (convert to paid / lapse).
  const trials = await convertOrLapseTrials()

  const supabase = createAdminClient()
  const provider = getPaymentProvider()
  if (typeof provider.getRecurringStatus !== 'function') {
    return {
      checked: 0,
      lapsed: 0,
      rescued: rescue.rescued,
      rescueScanned: rescue.scanned,
      trialsConverted: trials.converted,
      trialsLapsed: trials.lapsedTrials,
    }
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, user_id, stripe_subscription_id')
    .eq('status', 'active')
    .not('stripe_subscription_id', 'is', null)
    .limit(MAX_BATCH)

  if (error) {
    logger.error('reconcile-subscriptions: query failed', { error: error.message })
    return {
      checked: 0,
      lapsed: 0,
      rescued: rescue.rescued,
      rescueScanned: rescue.scanned,
      trialsConverted: trials.converted,
      trialsLapsed: trials.lapsedTrials,
    }
  }

  const subs = (data ?? []) as RecurringSub[]
  let lapsed = 0

  for (const sub of subs) {
    if (!sub.stripe_subscription_id) continue
    // RevenueCat (App Store) subscriptions carry a `revenuecat:<id>` handle and
    // are lapsed by the RC webhook's EXPIRATION event — NOT by the configured
    // web provider (Kurv), which has no concept of that id. Feeding it to
    // Kurv is a wasted call at best and, for a provider that maps "not found"
    // to "ended", would wrongly lapse every paying App Store member.
    if (sub.stripe_subscription_id.startsWith('revenuecat:')) continue
    const status = await provider
      .getRecurringStatus!(sub.stripe_subscription_id)
      .catch(() => 'unknown' as const)

    // Only act on a positive "ended" signal — never lapse on 'unknown' (a
    // transient API failure must not revoke a paying member's access).
    if (status !== 'ended') continue

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({ status: 'canceled', stripe_subscription_id: null })
      .eq('id', sub.id)
      .eq('status', 'active')

    if (updateError) {
      logger.error('reconcile-subscriptions: lapse update failed', {
        subscriptionId: sub.id,
        error: updateError.message,
      })
      continue
    }
    lapsed += 1
    void logAudit({
      userId: sub.user_id,
      action: 'subscription.lapsed',
      resourceType: 'subscription',
      resourceId: sub.id,
      details: { via: 'reconcile', provider: provider.name },
    }).catch(() => undefined)
  }

  return {
    checked: subs.length,
    lapsed,
    rescued: rescue.rescued,
    rescueScanned: rescue.scanned,
    trialsConverted: trials.converted,
    trialsLapsed: trials.lapsedTrials,
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return Response.json(
      { success: false, error: 'Reconcile job not configured' },
      { status: 503 }
    )
  }
  if (!authorized(request)) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await reconcile()
    logger.info('reconcile-subscriptions: complete', result)
    return Response.json({ success: true, data: result })
  } catch (error: unknown) {
    logger.error('reconcile-subscriptions: unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
