// Membership checkout — shared server helpers.
//
// Memberships are sold through the same payment provider as shop products
// (one-time hosted-checkout session), but instead of fulfilling a physical
// order they activate a `subscriptions` row that grants marketplace access.
//
// To avoid a schema migration we ride on the existing `orders` table: a
// membership purchase is an order whose single line item carries
// `kind: 'membership'` plus the chosen plan + resolved peptide slugs. When
// that order is flipped to paid (webhook or success-return verify), the same
// activation helper upserts the user's subscription to `active`.
//
// The price charged is ALWAYS the server-authoritative tier price
// (MarketplaceTier.priceCents) — never a client-supplied amount.

import { recordCouponRedemption } from '@/lib/coupons'
import { logger } from '@/lib/logger'
import { createConversion } from '@/lib/tapfiliate'
import {
  peptidesForPlan,
  tierForPlan,
  type MarketplaceTier,
} from '@/lib/marketplace-access'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

/** Marker placed on a membership order's line item (orders.items[].kind). */
export const MEMBERSHIP_ITEM_KIND = 'membership' as const

/** One calendar month from now, as an ISO timestamp (the billing period end). */
function oneMonthFromNow(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

/** N days from now, as an ISO timestamp (the trial period end). */
function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

/** Length of the free-trial window, in days (Kurv payment_start_date = +7d). */
export const TRIAL_PERIOD_DAYS = 7

export interface MembershipOrderItem {
  product_id: string
  name: string
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  kind: typeof MEMBERSHIP_ITEM_KIND
  /** Canonical tier slug (src/lib/marketplace-access.ts). */
  plan: string
  /** Resolved peptide slugs this membership unlocks. */
  selected_protocols: string[]
  /** True = auto-billed monthly by the provider; false = one-time access. */
  recurring: boolean
  /**
   * True = 7-day free-trial signup. The Kurv contract charges $0 now and the
   * first real charge lands at trial end (payment_start_date = +7d). Activation
   * sets status='trialing' with a 7-day period; the trial-end charge webhook
   * converts it to 'active'. Distinct from `recurring` (which is always true for
   * a trial, since the underlying contract is the monthly recurring one).
   */
  trial?: boolean
  /**
   * Coupon applied to this purchase, if any. Carried on the order line so the
   * paid-transition (webhook/verify) can record the redemption exactly once
   * (keyed on order id) via activateMembershipFromOrder.
   */
  coupon_id?: string
  coupon_code?: string
  /** Cents discounted off the list tier price by the coupon. */
  discount_cents?: number
  /**
   * Affiliate referral code captured at checkout (Tapfiliate `?ref=`). Carried
   * on the order line so the server-side conversion can be recorded when the
   * order is confirmed paid — reliable regardless of client-side pixel blockers.
   */
  referral_code?: string
}

/** Coupon context threaded onto a membership order line. */
export interface MembershipCouponContext {
  id: string
  code: string
  discountCents: number
}

/**
 * Resolve a requested plan + the member's chosen peptides into a purchasable
 * tier and the final peptide-slug list, or an error string.
 *
 * `selectedProtocols` are the individual peptide slugs the member picked (any
 * group). The resolved list is clamped to the tier's maxSelectablePeptides by
 * peptidesForPlan, so over-selection can't buy more access than the tier
 * allows. Unlimited tiers resolve to every peptide.
 */
export function resolveMembershipSelection(
  plan: string,
  selectedProtocols: ReadonlyArray<string> | null | undefined
):
  | { tier: MarketplaceTier; peptides: string[] }
  | { error: string } {
  const tier = tierForPlan(plan)
  if (tier.slug === 'free' || tier.priceCents <= 0) {
    return { error: 'Selected plan is not a purchasable membership' }
  }
  const peptides = [...peptidesForPlan(tier.slug, selectedProtocols ?? [])]
  return { tier, peptides }
}

/**
 * Build the single line item that represents a membership purchase.
 *
 * `unit_price_cents`/`line_total_cents` are always the LIST tier price; a
 * coupon's effect on what is actually charged lives in the order's total_cents,
 * with `discount_cents`/`coupon_code` recorded here for display + redemption.
 */
export function buildMembershipOrderItem(
  tier: MarketplaceTier,
  peptides: ReadonlyArray<string>,
  recurring: boolean,
  coupon?: MembershipCouponContext | null,
  referralCode?: string | null,
  trial?: boolean
): MembershipOrderItem {
  return {
    product_id: `membership:${tier.slug}`,
    name: `Membership — ${tier.label}`,
    quantity: 1,
    unit_price_cents: tier.priceCents,
    line_total_cents: tier.priceCents,
    kind: MEMBERSHIP_ITEM_KIND,
    plan: tier.slug,
    selected_protocols: [...peptides],
    recurring,
    ...(trial ? { trial: true } : {}),
    ...(coupon
      ? {
          coupon_id: coupon.id,
          coupon_code: coupon.code,
          discount_cents: coupon.discountCents,
        }
      : {}),
    ...(referralCode ? { referral_code: referralCode } : {}),
  }
}

/**
 * Detect and parse the membership line item on an order's `items` array.
 * Returns null when the order is a normal product order (no membership line).
 */
export function parseMembershipFromItems(
  items: unknown
): {
  plan: string
  selectedProtocols: string[]
  recurring: boolean
  trial: boolean
  couponId: string | null
  couponCode: string | null
  discountCents: number
  referralCode: string | null
} | null {
  if (!Array.isArray(items)) return null
  for (const raw of items) {
    if (
      raw &&
      typeof raw === 'object' &&
      (raw as { kind?: unknown }).kind === MEMBERSHIP_ITEM_KIND &&
      typeof (raw as { plan?: unknown }).plan === 'string'
    ) {
      const plan = (raw as { plan: string }).plan
      const protocolsRaw = (raw as { selected_protocols?: unknown })
        .selected_protocols
      const selectedProtocols = Array.isArray(protocolsRaw)
        ? (protocolsRaw.filter((p) => typeof p === 'string') as string[])
        : []
      const recurring = (raw as { recurring?: unknown }).recurring === true
      const trial = (raw as { trial?: unknown }).trial === true
      const couponIdRaw = (raw as { coupon_id?: unknown }).coupon_id
      const couponCodeRaw = (raw as { coupon_code?: unknown }).coupon_code
      const discountRaw = (raw as { discount_cents?: unknown }).discount_cents
      const referralRaw = (raw as { referral_code?: unknown }).referral_code
      return {
        plan,
        selectedProtocols,
        recurring,
        trial,
        couponId: typeof couponIdRaw === 'string' ? couponIdRaw : null,
        couponCode: typeof couponCodeRaw === 'string' ? couponCodeRaw : null,
        discountCents: typeof discountRaw === 'number' ? discountRaw : 0,
        referralCode: typeof referralRaw === 'string' ? referralRaw : null,
      }
    }
  }
  return null
}

/**
 * Record an affiliate conversion for a paid membership order (Tapfiliate),
 * server-side — the reliable backstop to the client-side `tap('conversion')`
 * pixel (which is commonly blocked). Fires only when the order carried a
 * referral code at checkout AND actually collected revenue (comped $0 orders
 * are skipped). Idempotent via Tapfiliate's `external_id` = our order id, and
 * fully best-effort: never throws, so it can't break the webhook/verify 200.
 */
export async function recordMembershipAffiliateConversion(order: {
  id: string
  items: unknown
  totalCents: number
}): Promise<void> {
  try {
    if (order.totalCents <= 0) return
    const membership = parseMembershipFromItems(order.items)
    if (!membership?.referralCode) return
    await createConversion({
      referralCode: membership.referralCode,
      externalId: order.id,
      amount: order.totalCents / 100,
    })
  } catch (error: unknown) {
    logger.error('membership affiliate conversion failed', {
      orderId: order.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

interface ActivatableOrder {
  /**
   * Order id — used to record a coupon redemption idempotently (unique on
   * order_id). Optional so older callers still compile; when absent, a coupon
   * redemption simply isn't recorded (activation still proceeds).
   */
  id?: string
  user_id: string
  items: unknown
  /**
   * Provider-side recurring handle (Kurv payment_id) for this order. Stored on
   * the subscription so it can later be cancelled (DELETE
   * /payments/subscription/{payment_id}) and reconciled.
   */
  payment_reference?: string | null
}

/**
 * Activate (or refresh) the membership a paid order represents. Idempotent and
 * best-effort: callers invoke this AFTER an order is confirmed paid, and must
 * not let a failure here break the webhook/verify 200 response.
 *
 * Upserts the user's latest subscription row to `active` with the purchased
 * plan, resolved peptide slugs, and a fresh 30-day period. Returns true when
 * a membership was activated, false when the order had no membership line.
 */
export async function activateMembershipFromOrder(
  supabase: AdminClient,
  order: ActivatableOrder
): Promise<boolean> {
  const membership = parseMembershipFromItems(order.items)
  if (!membership) return false

  // For a recurring membership we store the provider's recurring handle in
  // stripe_subscription_id (a generic "externally-managed subscription id").
  // Its PRESENCE is what tells the access check to treat the subscription as
  // recurring — i.e. active-until-cancelled, not hard-expiring at period end
  // (the reconcile job lapses it if the provider stops billing). One-time
  // memberships leave it null and rely on current_period_end to expire.
  // NOTE: a TRIAL is `recurring` too (the underlying Kurv contract is monthly),
  // so it also stores the handle — but its status stays 'trialing', which the
  // access gate keeps period-bound (no money has changed hands yet). The handle
  // is needed so the day-7 reconcile pass can poll/convert or cancel it.
  const externalRef =
    membership.recurring && order.payment_reference ? order.payment_reference : null

  // Trial start ($0 now, first real charge at day 7): grant a 7-day 'trialing'
  // window and stamp trial_started_at (one-trial-per-user enforcement reads it).
  // The day-7 charge converts trialing→active via the reconcile job. A normal
  // membership goes straight to 'active' with a 30-day period.
  const isTrial = membership.trial === true

  try {
    // Reuse the user's most recent subscription row if one exists (e.g. a
    // pending row from signup); otherwise create a fresh one. We also read the
    // current status + trial stamp so a late-duplicate $0 confirmation can't
    // revert an already-converted (active) membership back to 'trialing', and
    // so trial_started_at is stamped once and never reset.
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, status, trial_started_at')
      .eq('user_id', order.user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string
        status: string | null
        trial_started_at: string | null
      }>()

    // Idempotency: if the trial already converted to a paid 'active' membership,
    // a delayed duplicate of the $0 trial-start webhook must not downgrade it.
    if (isTrial && existing?.status === 'active') return true

    const payload = isTrial
      ? {
          plan: membership.plan,
          status: 'trialing' as const,
          selected_protocols: membership.selectedProtocols,
          current_period_end: daysFromNow(TRIAL_PERIOD_DAYS),
          stripe_subscription_id: externalRef,
          // Stamp once at the first trial start; never reset (keeps the original
          // window so re-runs can't extend the free period).
          trial_started_at: existing?.trial_started_at ?? new Date().toISOString(),
        }
      : {
          plan: membership.plan,
          status: 'active' as const,
          selected_protocols: membership.selectedProtocols,
          current_period_end: oneMonthFromNow(),
          stripe_subscription_id: externalRef,
        }

    if (existing?.id) {
      const { error } = await supabase
        .from('subscriptions')
        .update(payload)
        .eq('id', existing.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase
        .from('subscriptions')
        .insert({ user_id: order.user_id, ...payload })
      if (error) throw new Error(error.message)
    }

    // If this membership was purchased with a coupon, record the redemption now
    // that access is granted. Idempotent (keyed on order id) so the webhook and
    // success-return verify paths can both reach here without double-counting.
    if (membership.couponId && order.id) {
      await recordCouponRedemption(supabase, {
        couponId: membership.couponId,
        userId: order.user_id,
        orderId: order.id,
        discountCents: membership.discountCents,
      })
    }

    return true
  } catch (error: unknown) {
    logger.error('membership activation failed', {
      userId: order.user_id,
      plan: membership.plan,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * The amount the provider actually charges on the hosted page NOW for this
 * order. For a normal membership that is the full tier price; for a 7-day trial
 * it is $0 (the card is tokenized and the first real charge lands at day 7).
 *
 * The paid-transition guards (verify + reconcile rescue) compare the confirmed
 * charge against this — comparing a $0 trial start against the $95 tier price
 * would wrongly reject the trial and leave the member card-captured but locked
 * out. Non-membership orders fall through to `totalCents` unchanged.
 */
export function expectedInitialChargeCents(
  items: unknown,
  totalCents: number
): number {
  const membership = parseMembershipFromItems(items)
  return membership?.trial ? 0 : totalCents
}

/**
 * True when the user has ever started a free trial (any subscription row with a
 * non-null trial_started_at). The trial-checkout branch reads this to refuse a
 * second $0 window — otherwise the paywall resets by re-running checkout.
 * Best-effort: on a query error we FAIL CLOSED (treat as already-trialed) so a
 * transient failure can't hand out repeat free trials.
 */
export async function hasUserTrialed(
  supabase: AdminClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .not('trial_started_at', 'is', null)
    .limit(1)
    .maybeSingle<{ id: string }>()
  if (error) {
    logger.error('hasUserTrialed check failed — failing closed', {
      userId,
      error: error.message,
    })
    return true
  }
  return Boolean(data)
}
