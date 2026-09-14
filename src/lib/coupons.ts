// Coupons — shared server helpers for the admin-managed discount system.
//
// A coupon is a database-backed discount code (migration 047_coupons.sql) that
// super_admins create in the admin console. It applies to the Juvenex-side
// MEMBERSHIP checkout: any percent (incl. 100% = fully comped) or fixed-dollar
// amount off, with optional total/per-user redemption caps and expiry.
//
// This module is the single source of truth for validating a code and computing
// its discount, so the checkout route and the admin preview endpoint behave
// identically. Redemptions are recorded (idempotently, keyed on order_id) when
// an order is confirmed paid — see recordCouponRedemption + membership-checkout.

import { logger } from '@/lib/logger'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export type CouponDiscountType = 'percent' | 'fixed'
export type CouponAppliesTo = 'membership' | 'all'

export interface Coupon {
  id: string
  code: string
  description: string | null
  discount_type: CouponDiscountType
  /** percent: 1..100. fixed: amount in CENTS. */
  discount_value: number
  applies_to: CouponAppliesTo
  max_redemptions: number | null
  per_user_limit: number
  redeemed_count: number
  expires_at: string | null
  active: boolean
  organization_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Columns selected wherever a full coupon row is returned. */
export const COUPON_COLUMNS =
  'id, code, description, discount_type, discount_value, applies_to, max_redemptions, per_user_limit, redeemed_count, expires_at, active, organization_id, created_by, created_at, updated_at'

/** Uppercase + trim; codes are matched case-insensitively. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase()
}

// Unambiguous alphabet (no O/0, I/1) for generated codes.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * Generate a random coupon code like `JUVENEX-8F4K2Q`. Deterministic-length,
 * caller-provided randomness so it works in environments where Math.random is
 * unavailable (e.g. workflow scripts) — pass a source of random bytes.
 */
export function generateCouponCode(
  randomBytes: Uint8Array,
  prefix = 'JUVENEX'
): string {
  let suffix = ''
  for (let i = 0; i < 6; i += 1) {
    suffix += CODE_ALPHABET[randomBytes[i % randomBytes.length] % CODE_ALPHABET.length]
  }
  return `${prefix}-${suffix}`
}

/**
 * Discount (in cents) this coupon takes off `subtotalCents`, clamped to
 * [0, subtotalCents] so it can never produce a negative charge. A 100% (or
 * fixed amount ≥ subtotal) coupon returns the full subtotal → final = 0.
 */
export function computeDiscountCents(
  coupon: Pick<Coupon, 'discount_type' | 'discount_value'>,
  subtotalCents: number
): number {
  if (subtotalCents <= 0) return 0
  let raw: number
  if (coupon.discount_type === 'percent') {
    const pct = Math.max(0, Math.min(100, coupon.discount_value))
    raw = Math.round((subtotalCents * pct) / 100)
  } else {
    raw = Math.max(0, coupon.discount_value)
  }
  return Math.max(0, Math.min(subtotalCents, raw))
}

export interface CouponApplication {
  coupon: Coupon
  discountCents: number
  finalCents: number
  /** True when the discount zeroes the charge (fully comped membership). */
  comped: boolean
}

export type CouponValidationResult =
  | ({ ok: true } & CouponApplication)
  | { ok: false; error: string }

interface ValidateArgs {
  code: string
  userId: string
  /** The buyer's organization (for tenant-scoped codes). null = no org. */
  organizationId?: string | null
  subtotalCents: number
  appliesTo?: CouponAppliesTo
}

/**
 * Validate a coupon code for a specific buyer + subtotal and compute the
 * resulting discount. Enforces: exists, active, not expired, applies to this
 * checkout, tenant scope, total redemption cap, and per-user limit.
 *
 * Returns a discriminated result; `{ ok: false, error }` carries a
 * user-safe message. All DB reads use the passed service-role client.
 */
export async function validateCouponForCheckout(
  supabase: AdminClient,
  args: ValidateArgs
): Promise<CouponValidationResult> {
  const code = normalizeCouponCode(args.code)
  if (!code) return { ok: false, error: 'Enter a promo code' }

  const { data, error } = await supabase
    .from('coupons')
    .select(COUPON_COLUMNS)
    // Case-insensitive exact match on the code.
    .ilike('code', code)
    .limit(1)
    .maybeSingle<Coupon>()

  if (error) {
    logger.error('coupon validation query failed', { error: error.message })
    return { ok: false, error: 'Could not validate promo code' }
  }
  if (!data) return { ok: false, error: 'Invalid promo code' }

  const coupon = data
  if (!coupon.active) return { ok: false, error: 'This code is no longer active' }

  if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: 'This code has expired' }
  }

  const wants = args.appliesTo ?? 'membership'
  if (coupon.applies_to !== 'all' && coupon.applies_to !== wants) {
    return { ok: false, error: 'This code cannot be used here' }
  }

  // Tenant scope: a code tied to an organization is only valid for buyers in
  // that organization. Global codes (organization_id null) apply to everyone.
  if (coupon.organization_id && coupon.organization_id !== (args.organizationId ?? null)) {
    return { ok: false, error: 'This code is not valid for your account' }
  }

  // Total redemption cap (source of truth = redeemed_count, kept accurate by
  // the DB trigger).
  if (
    coupon.max_redemptions !== null &&
    coupon.redeemed_count >= coupon.max_redemptions
  ) {
    return { ok: false, error: 'This code has reached its redemption limit' }
  }

  // Per-user limit (0 = unlimited).
  if (coupon.per_user_limit > 0) {
    const { count, error: usageError } = await supabase
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', coupon.id)
      .eq('user_id', args.userId)
    if (usageError) {
      logger.error('coupon per-user usage query failed', {
        error: usageError.message,
      })
      return { ok: false, error: 'Could not validate promo code' }
    }
    if ((count ?? 0) >= coupon.per_user_limit) {
      return { ok: false, error: 'You have already used this code' }
    }
  }

  const discountCents = computeDiscountCents(coupon, args.subtotalCents)
  const finalCents = Math.max(0, args.subtotalCents - discountCents)
  return {
    ok: true,
    coupon,
    discountCents,
    finalCents,
    comped: finalCents <= 0,
  }
}

/**
 * Record a coupon redemption. Idempotent: the unique index on
 * coupon_redemptions.order_id means re-recording the same order is a no-op
 * (handled via upsert onConflict). The DB trigger bumps coupons.redeemed_count.
 *
 * Best-effort — callers invoke this after activating a paid membership and must
 * not let a failure here break the webhook/verify 200 response.
 */
export async function recordCouponRedemption(
  supabase: AdminClient,
  args: {
    couponId: string
    userId: string
    orderId: string
    discountCents: number
  }
): Promise<boolean> {
  try {
    const { error } = await supabase.from('coupon_redemptions').insert({
      coupon_id: args.couponId,
      user_id: args.userId,
      order_id: args.orderId,
      discount_cents: Math.max(0, args.discountCents),
    })
    if (error) {
      // 23505 = a redemption for this order already exists (the partial unique
      // index on order_id). That means a prior webhook/verify delivery already
      // recorded it — treat as an idempotent success, not a failure.
      if ((error as { code?: string }).code === '23505') return true
      throw new Error(error.message)
    }
    return true
  } catch (err: unknown) {
    logger.error('coupon redemption record failed', {
      couponId: args.couponId,
      orderId: args.orderId,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/** Human-readable discount label, e.g. "100% off" or "$25 off". */
export function formatCouponDiscount(
  coupon: Pick<Coupon, 'discount_type' | 'discount_value'>
): string {
  if (coupon.discount_type === 'percent') return `${coupon.discount_value}% off`
  return `$${(coupon.discount_value / 100).toFixed(2).replace(/\.00$/, '')} off`
}
