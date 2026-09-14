import { type NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import {
  isTapfiliateConfigured,
  listAffiliates,
  listConversions,
  referralLink,
  TapfiliateNotConfiguredError,
  type TapAffiliate,
  type TapConversion,
} from '@/lib/tapfiliate'

// GET /api/admin/affiliates
// Admin view of the Tapfiliate affiliate program: every affiliate plus the
// conversions attributed to them. Auth: super_admin or org_admin.
//
// Degrades gracefully when TAPFILIATE_API_KEY is unset — returns
// `configured: false` with empty arrays (200) instead of 500-ing, so the
// admin tab can render a "not connected yet" notice.

const ADMIN_ROLES: ReadonlySet<string> = new Set(['super_admin', 'org_admin'])

/** One affiliate row, flattened for the admin table. */
export interface AdminAffiliate {
  id: string
  name: string
  email: string | null
  referralLink: string | null
  referrals: number
  conversions: number
  earnings: number
}

export interface AdminAffiliatesData {
  configured: boolean
  affiliates: AdminAffiliate[]
  conversions: number
}

function affiliateName(a: TapAffiliate): string {
  const full = [a.firstname, a.lastname].filter(Boolean).join(' ').trim()
  return full || a.email || 'Unknown affiliate'
}

function affiliateLink(a: TapAffiliate): string | null {
  // Prefer the link Tapfiliate already minted; fall back to building one from
  // the referral token.
  const existing = a.referral_link?.link
  if (typeof existing === 'string' && existing.length > 0) return existing
  const token = a.referral_link?.token
  if (typeof token === 'string' && token.length > 0) return referralLink(token)
  return null
}

function toNumber(value: number | string | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** Commission/earnings total for a single conversion. */
function conversionEarnings(c: TapConversion): number {
  if (Array.isArray(c.commissions) && c.commissions.length > 0) {
    return c.commissions.reduce((sum, cm) => sum + toNumber(cm?.amount), 0)
  }
  return toNumber(c.amount)
}

export async function GET(_request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (!ADMIN_ROLES.has(user.role)) {
      return Response.json(
        {
          success: false,
          error: 'Forbidden: super_admin or org_admin role required',
        },
        { status: 403 }
      )
    }

    const rl = rateLimit(`admin-affiliates:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    // Graceful degrade: no API key → empty, configured:false (not an error).
    if (!isTapfiliateConfigured()) {
      return Response.json({
        success: true,
        data: {
          configured: false,
          affiliates: [],
          conversions: 0,
        } satisfies AdminAffiliatesData,
      })
    }

    const [affiliates, conversions] = await Promise.all([
      listAffiliates(),
      listConversions(),
    ])

    // Index conversions by affiliate id so each row gets its own tally.
    const byAffiliate = new Map<string, { count: number; earnings: number }>()
    for (const c of conversions) {
      const affId = c.affiliate?.id
      if (!affId) continue
      const entry = byAffiliate.get(affId) ?? { count: 0, earnings: 0 }
      entry.count += 1
      entry.earnings += conversionEarnings(c)
      byAffiliate.set(affId, entry)
    }

    const rows: AdminAffiliate[] = affiliates.map((a) => {
      const tally = byAffiliate.get(a.id) ?? { count: 0, earnings: 0 }
      return {
        id: a.id,
        name: affiliateName(a),
        email: a.email ?? null,
        referralLink: affiliateLink(a),
        // Tapfiliate exposes a click/referral count under various keys; we
        // surface conversion count as the reliable signal and leave referrals
        // at the click figure when present.
        referrals:
          typeof a.clicks === 'number'
            ? a.clicks
            : typeof a.referrals === 'number'
              ? a.referrals
              : tally.count,
        conversions: tally.count,
        earnings: Math.round(tally.earnings * 100) / 100,
      }
    })

    return Response.json({
      success: true,
      data: {
        configured: true,
        affiliates: rows,
        conversions: conversions.length,
      } satisfies AdminAffiliatesData,
    })
  } catch (error: unknown) {
    if (error instanceof TapfiliateNotConfiguredError) {
      // Race against env changes — treat exactly like the unconfigured path.
      return Response.json({
        success: true,
        data: {
          configured: false,
          affiliates: [],
          conversions: 0,
        } satisfies AdminAffiliatesData,
      })
    }
    logger.error('Admin affiliates error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Failed to load affiliate data' },
      { status: 502 }
    )
  }
}
