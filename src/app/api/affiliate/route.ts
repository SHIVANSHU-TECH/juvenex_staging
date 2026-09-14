import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import {
  isTapfiliateConfigured,
  getOrCreateAffiliate,
  listConversions,
  referralLink,
  TapfiliateNotConfiguredError,
  type TapConversion,
} from '@/lib/tapfiliate'

// Per-user "refer & earn" view. Returns the signed-in user's own referral link
// plus a summary of the referrals/conversions attributed to them. The server
// REST key is optional: when unset we return a graceful configured:false state
// instead of failing, so the page can show a "coming soon" message.

interface ConversionSummary {
  id: string
  amount: number | null
  commission: number | null
  status: string | null
  createdAt: string | null
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// Split a display name into first / last for the Tapfiliate affiliate record.
function splitName(name: string): { firstname?: string; lastname?: string } {
  const trimmed = name.trim()
  if (!trimmed) return {}
  const parts = trimmed.split(/\s+/)
  const firstname = parts[0]
  const lastname = parts.slice(1).join(' ') || undefined
  return { firstname, lastname }
}

// Sum the commission amounts across a conversion's commissions array.
function conversionCommission(conversion: TapConversion): number | null {
  const commissions = conversion.commissions
  if (!Array.isArray(commissions) || commissions.length === 0) return null
  let total = 0
  let seen = false
  for (const c of commissions) {
    const amount = toNumber(c?.amount)
    if (amount != null) {
      total += amount
      seen = true
    }
  }
  return seen ? total : null
}

export async function GET(_request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`affiliate:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    // No server-side REST key configured yet — graceful, never an error.
    if (!isTapfiliateConfigured()) {
      return Response.json({ success: true, data: { configured: false } })
    }

    const { firstname, lastname } = splitName(user.name)
    const affiliate = await getOrCreateAffiliate({
      email: user.email,
      firstname,
      lastname,
    })

    // Derive the referral link: prefer the affiliate's own referral_link.link,
    // else build one from its token, else fall back to the affiliate id.
    const link =
      affiliate.referral_link?.link ??
      (affiliate.referral_link?.token
        ? referralLink(affiliate.referral_link.token)
        : referralLink(String(affiliate.id)))

    const conversions = await listConversions({ affiliateId: String(affiliate.id) })
    const list = Array.isArray(conversions) ? conversions : []

    const summary: ConversionSummary[] = list.map((c) => ({
      id: String(c.id),
      amount: toNumber(c.amount),
      commission: conversionCommission(c),
      status: typeof c.status === 'string' ? c.status : null,
      createdAt: typeof c.created_at === 'string' ? c.created_at : null,
    }))

    // Earnings = sum of all commission amounts across the user's conversions.
    const earnings = summary.reduce((sum, c) => sum + (c.commission ?? 0), 0)

    return Response.json({
      success: true,
      data: {
        configured: true,
        referralLink: link,
        referrals: summary.length,
        conversions: summary,
        earnings,
      },
    })
  } catch (error: unknown) {
    // A missing key mid-flight is still a graceful configured:false state.
    if (error instanceof TapfiliateNotConfiguredError) {
      return Response.json({ success: true, data: { configured: false } })
    }
    // Upstream (Tapfiliate REST) failures must not surface as a 500 to the
    // client — return a clean envelope the page can render as a friendly error.
    logger.error('Affiliate route upstream error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Could not load your affiliate data right now. Please try again later.' },
      { status: 502 }
    )
  }
}
