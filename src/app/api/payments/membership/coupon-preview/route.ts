import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { config } from '@/lib/config'
import { formatCouponDiscount, validateCouponForCheckout } from '@/lib/coupons'
import { resolveMembershipSelection } from '@/lib/membership-checkout'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

// POST /api/payments/membership/coupon-preview { plan, code }
//
// Validates a promo/coupon code against a plan for the logged-in user and
// returns the resulting price WITHOUT creating an order — so the membership
// checkout page can show "You'll pay $X (–$Y)" before the user commits.
//
// This does NOT redeem the code. Auth: logged-in Juvenex user.

const bodySchema = z
  .object({
    plan: z.string().min(1).max(64),
    code: z.string().trim().min(1).max(64),
  })
  .strict()

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status })
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return jsonError(401, 'Unauthorized')

    // Bounded so a code can't be brute-forced/enumerated cheaply.
    const rl = rateLimit(`coupon-preview:${user.id}`, 20, 60_000)
    if (!rl.success) return jsonError(429, 'Too many requests')

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError(400, 'Invalid request')

    const resolved = resolveMembershipSelection(parsed.data.plan, [])
    if ('error' in resolved) return jsonError(400, resolved.error)
    const { tier } = resolved

    const normalized = parsed.data.code.trim().toUpperCase()

    // Env comp codes → 100% off.
    if (config.membership.freePromoCodes.includes(normalized)) {
      return Response.json({
        success: true,
        data: {
          valid: true,
          label: '100% off',
          discountCents: tier.priceCents,
          finalCents: 0,
          comped: true,
        },
      })
    }

    const supabase = createAdminClient()
    const result = await validateCouponForCheckout(supabase, {
      code: normalized,
      userId: user.id,
      organizationId: user.organization_id,
      subtotalCents: tier.priceCents,
      appliesTo: 'membership',
    })

    if (!result.ok) {
      return Response.json({ success: true, data: { valid: false, error: result.error } })
    }

    return Response.json({
      success: true,
      data: {
        valid: true,
        label: formatCouponDiscount(result.coupon),
        discountCents: result.discountCents,
        finalCents: result.finalCents,
        comped: result.comped,
      },
    })
  } catch {
    return jsonError(500, 'Internal server error')
  }
}
