import { type NextRequest } from 'next/server'
import { z } from 'zod'

import {
  COUPON_COLUMNS,
  formatCouponDiscount,
  type Coupon,
} from '@/lib/coupons'
import { config } from '@/lib/config'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

// POST /api/admin/coupons/[id]/send  { userIds: string[], note?: string }
// Sends the coupon code to one or more users through the in-app messaging
// channel (a direct message from the admin). Auth: super_admin only.

const idSchema = z.string().uuid()

const bodySchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(200),
  note: z.string().trim().max(500).optional(),
})

async function requireSuperAdmin() {
  const user = await getAuthUser()
  if (!user) {
    return {
      ok: false as const,
      response: Response.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    }
  }
  if (user.role !== 'super_admin') {
    return {
      ok: false as const,
      response: Response.json(
        { success: false, error: 'Forbidden: super_admin role required' },
        { status: 403 }
      ),
    }
  }
  return { ok: true as const, user }
}

function buildMessage(coupon: Coupon, note?: string): string {
  const discount = formatCouponDiscount(coupon)
  const redeemUrl = `${config.app.url}/upgrade`
  const lines = [
    note?.trim() ||
      `Here's a promo code for your Juvenex membership: ${discount}.`,
    '',
    `Code: ${coupon.code}`,
    coupon.expires_at
      ? `Expires: ${new Date(coupon.expires_at).toLocaleDateString('en-US')}`
      : null,
    '',
    `Apply it at checkout: ${redeemUrl}`,
  ].filter((l): l is string => l !== null)
  return lines.join('\n')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`admin-coupons-send:${auth.user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id } = await params
    const idParse = idSchema.safeParse(id)
    if (!idParse.success) {
      return Response.json({ success: false, error: 'Invalid coupon id' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select(COUPON_COLUMNS)
      .eq('id', idParse.data)
      .maybeSingle<Coupon>()

    if (couponError) {
      logger.error('Admin coupon send: lookup error', { error: couponError.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }
    if (!coupon) {
      return Response.json({ success: false, error: 'Coupon not found' }, { status: 404 })
    }

    // De-dupe + drop the admin's own id (can't message yourself).
    const recipientIds = [...new Set(parsed.data.userIds)].filter(
      (uid) => uid !== auth.user.id
    )
    if (recipientIds.length === 0) {
      return Response.json({ success: false, error: 'No valid recipients' }, { status: 400 })
    }

    // Confirm the recipients exist (avoids FK errors + reports a real count).
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id')
      .in('id', recipientIds)
    if (profErr) {
      logger.error('Admin coupon send: recipient lookup error', { error: profErr.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }
    const validIds = (profiles ?? []).map((p) => (p as { id: string }).id)
    if (validIds.length === 0) {
      return Response.json({ success: false, error: 'No recipients found' }, { status: 404 })
    }

    const body = buildMessage(coupon, parsed.data.note)
    const rows = validIds.map((uid) => ({
      from_user_id: auth.user.id,
      to_user_id: uid,
      body,
    }))

    const { error: insertError } = await supabase.from('messages').insert(rows)
    if (insertError) {
      logger.error('Admin coupon send: message insert error', { error: insertError.message })
      return Response.json({ success: false, error: 'Failed to send' }, { status: 500 })
    }

    return Response.json({ success: true, data: { sent: validIds.length } })
  } catch (error: unknown) {
    logger.error('Admin coupon send unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
