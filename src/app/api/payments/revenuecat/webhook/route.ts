import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { peptidesForPlan, tierForPlan } from '@/lib/marketplace-access'

// POST /api/payments/revenuecat/webhook
//
// RevenueCat carries the APP-STORE edition of the membership (Apple/Google
// in-app subscriptions). Kurv remains the WEB checkout — this endpoint is the
// IAP twin of the Kurv webhook: RevenueCat notifies us, we upsert the user's
// `subscriptions` row. Access checks everywhere else stay unchanged.
//
// Auth: RevenueCat sends the configured Authorization header verbatim; we
// compare against REVENUECAT_WEBHOOK_TOKEN (runtime-read env — a pm2 restart
// picks it up, no rebuild).
//
// app_user_id: the mobile wrapper logs into RevenueCat with the Supabase user
// id, so events arrive keyed by our own uuid.
//
// selected_protocols is PRESERVED: the member picks peptides in the app UI
// before the native purchase sheet opens (stored on the row up-front); the
// webhook only flips plan/status/period.

/** App-store product id → membership tier slug. */
const PRODUCT_TO_PLAN: Readonly<Record<string, string>> = {
  juvenex_basic_monthly: 'metabolic_reset',
  juvenex_intermediate_monthly: 'optimization',
  juvenex_advanced_monthly: 'optimization_metabolic',
  juvenex_total_monthly: 'completely_optimized',
}

const ACTIVATE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
])
const LAPSE_EVENTS = new Set(['EXPIRATION'])

interface RevenueCatEvent {
  type?: string
  app_user_id?: string
  original_app_user_id?: string
  product_id?: string
  new_product_id?: string
  expiration_at_ms?: number
  store?: string
  environment?: string
  id?: string
}

function planForProduct(productId: string | undefined): string | null {
  if (!productId) return null
  const direct = PRODUCT_TO_PLAN[productId]
  if (direct) return direct
  // Fall back to a tier slug embedded in a custom product id.
  const tier = tierForPlan(productId)
  return tier.slug !== 'free' ? tier.slug : null
}

function isUuid(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function POST(request: NextRequest) {
  const secret = process.env.REVENUECAT_WEBHOOK_TOKEN
  if (!secret) {
    logger.error('revenuecat webhook: REVENUECAT_WEBHOOK_TOKEN not configured')
    return Response.json({ success: false, error: 'Not configured' }, { status: 503 })
  }
  const auth = request.headers.get('authorization') ?? ''
  // RevenueCat sends the header value exactly as configured; accept with or
  // without a Bearer prefix so dashboard configuration mistakes don't 401.
  if (auth !== secret && auth !== `Bearer ${secret}`) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { event?: RevenueCatEvent } | null
  const event = body?.event
  if (!event?.type) {
    return Response.json({ success: false, error: 'Malformed event' }, { status: 400 })
  }

  // Only PRODUCTION store events grant access. Any user can complete a $0
  // SANDBOX purchase against the real product ids with a sandbox Apple ID
  // (Settings → App Store → Sandbox Account) — activating on those would be a
  // free-membership bypass. Sandbox events are acknowledged (200, no retry)
  // but never activate, except for the known QA accounts used to test the loop.
  const QA_SANDBOX_USER_IDS = new Set(
    (process.env.REVENUECAT_SANDBOX_ALLOW_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
  const isProduction = (event.environment ?? 'PRODUCTION').toUpperCase() === 'PRODUCTION'

  const userId = isUuid(event.app_user_id)
    ? event.app_user_id
    : isUuid(event.original_app_user_id)
      ? event.original_app_user_id
      : null

  if (!isProduction && !(userId && QA_SANDBOX_USER_IDS.has(userId))) {
    logger.warn('revenuecat webhook: ignoring non-production (sandbox) event', {
      type: event.type,
      environment: event.environment,
      userId,
    })
    return Response.json({ success: true, skipped: 'sandbox environment' })
  }

  // Anonymous RC ids (no logged-in mapping) can't be attributed — acknowledge
  // so RevenueCat stops retrying, and log for manual follow-up.
  if (!userId) {
    logger.warn('revenuecat webhook: event without a Supabase app_user_id', {
      type: event.type,
      appUserId: event.app_user_id,
    })
    return Response.json({ success: true, skipped: 'unattributable app_user_id' })
  }

  const plan = planForProduct(event.new_product_id ?? event.product_id)
  const supabase = createAdminClient()

  try {
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, selected_protocols')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; selected_protocols: string[] | null }>()

    if (ACTIVATE_EVENTS.has(event.type)) {
      if (!plan) {
        // A purchase whose product id we can't map is a CONFIG bug (product-id
        // typo / missing mapping), not a permanent condition — 500 so RC keeps
        // retrying; once the map is fixed the retry activates the membership.
        // (A paid-but-never-activated dead end is far worse than a retry.)
        logger.error('revenuecat webhook: unknown product id (returning 500 for retry)', {
          productId: event.new_product_id ?? event.product_id,
          userId,
        })
        return Response.json({ success: false, error: 'Unknown product id' }, { status: 500 })
      }
      const periodEnd = event.expiration_at_ms
        ? new Date(event.expiration_at_ms).toISOString()
        : null
      const payload = {
        plan,
        status: 'active' as const,
        current_period_end: periodEnd,
        // Store-managed subscription: mark the external handle so the access
        // check treats it as recurring (active until lapse), same as Kurv.
        stripe_subscription_id: `revenuecat:${event.original_app_user_id ?? userId}`,
        // Re-clamp the stored selection to what THIS plan allows, so a tier
        // change made via iOS Settings (PRODUCT_CHANGE, which bypasses the
        // in-app peptide picker) can't leave a stale/over-wide selection.
        selected_protocols: [...peptidesForPlan(plan, existing?.selected_protocols ?? [])],
      }
      const { error } = existing?.id
        ? await supabase.from('subscriptions').update(payload).eq('id', existing.id)
        : await supabase.from('subscriptions').insert({ user_id: userId, ...payload })
      if (error) throw new Error(error.message)
      logger.info('revenuecat webhook: membership activated', {
        userId,
        plan,
        type: event.type,
        store: event.store,
        environment: event.environment,
      })
    } else if (LAPSE_EVENTS.has(event.type) && existing?.id) {
      // 'canceled' (single-L) — the ONLY spelling the subscriptions_status
      // CHECK constraint allows. 'cancelled' throws a constraint violation →
      // 500 → the lapse never persists and the membership stays active forever.
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('id', existing.id)
      if (error) throw new Error(error.message)
      logger.info('revenuecat webhook: membership lapsed', { userId, type: event.type })
    }
    // CANCELLATION (auto-renew off, still paid up), BILLING_ISSUE (grace
    // period), TRANSFER etc.: no state change — access runs until EXPIRATION.

    return Response.json({ success: true })
  } catch (error: unknown) {
    logger.error('revenuecat webhook failed', {
      userId,
      type: event.type,
      error: error instanceof Error ? error.message : String(error),
    })
    // 500 → RevenueCat retries with backoff.
    return Response.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
