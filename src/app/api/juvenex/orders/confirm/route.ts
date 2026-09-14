/**
 * Order-confirmation email for a completed jx checkout.
 *
 * CADENCE — ONE EMAIL PER BAG, NOT PER LINE
 * Upstream `Create_Order` charges per product, so an N-line bag produces N
 * order ids. Sending from the order route would mean N receipts for one
 * checkout. Instead `CheckoutForm` calls this endpoint once, after every line
 * has succeeded, with the full list of ids.
 *
 * BEST-EFFORT BY CONTRACT
 * The customer has already been charged and already sees the success page by
 * the time this runs. It therefore ALWAYS returns 200 on an authorized
 * request — `sent` reports whether the mail actually went out, purely for
 * observability. A mail failure is never surfaced to the customer, who can
 * still see the order in their dashboard.
 */
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseBody, requireUser } from '@/lib/juvenex/route-utils'
import { JUVENEX_VENDOR } from '@/lib/juvenex/persist-order'
import { sendEmail } from '@/lib/email/client'
import { renderOrderConfirmation } from '@/lib/email/templates/order-confirmation'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

const confirmSchema = z.object({
  order_ids: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
})

export async function POST(request: NextRequest) {
  // 5/min/user — a confirmation is sent once per checkout, so anything beyond
  // a couple per minute is a retry storm or abuse.
  const auth = await requireUser(5, 'order-confirm')
  if ('response' in auth) return auth.response

  const parsed = await parseBody(request, confirmSchema)
  if ('response' in parsed) return parsed.response

  // De-duplicate before querying: a client retry could repeat an id, which
  // would otherwise double-count the total.
  const requestedIds = [...new Set(parsed.data.order_ids)]

  try {
    const supabase = createAdminClient()

    // Service-role bypasses RLS, so the user_id filter is the authorization
    // boundary. Scoping the query by user_id (rather than fetching by id and
    // comparing afterwards) means another user's order can never be read here
    // in the first place.
    const { data, error } = await supabase
      .from('orders')
      .select('vendor_order_id, total_cents, currency')
      .eq('user_id', auth.user.id)
      .eq('vendor', JUVENEX_VENDOR)
      .in('vendor_order_id', requestedIds)

    if (error) {
      logger.error('orders/confirm: order lookup failed', {
        userId: auth.user.id,
        error: error.message,
      })
      return Response.json({ sent: false })
    }

    const rows = data ?? []
    const foundIds = new Set(rows.map((r) => r.vendor_order_id as string))
    const missing = requestedIds.filter((id) => !foundIds.has(id))

    // Any id the caller named that is not among this user's orders is either
    // someone else's order or does not exist. Refuse the whole request rather
    // than silently emailing a partial total.
    if (missing.length > 0) {
      logger.warn('orders/confirm: rejected — ids not owned by caller', {
        userId: auth.user.id,
        missingCount: missing.length,
      })
      return Response.json(
        { error: 'One or more orders do not belong to this account' },
        { status: 403 }
      )
    }

    const totalCents = rows.reduce((sum, r) => sum + Number(r.total_cents ?? 0), 0)
    const currency = (rows[0]?.currency as string) || 'usd'

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
    const dashboardUrl = `${baseUrl}/store/account/orders`

    const rendered = renderOrderConfirmation({
      customerName: auth.user.name,
      // Order the ids the way the customer submitted them, not the way
      // Postgres returned them.
      orderIds: requestedIds,
      totalCents,
      currency,
      dashboardUrl,
    })

    const result = await sendEmail({
      to: auth.user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })

    if (!result.ok) {
      logger.warn('orders/confirm: confirmation email not sent', {
        userId: auth.user.id,
        orderCount: requestedIds.length,
        reason: result.error,
      })
    }

    return Response.json({ sent: result.ok })
  } catch (cause: unknown) {
    // Never let a confirmation problem look like an order problem.
    logger.error('orders/confirm: unexpected failure', {
      userId: auth.user.id,
      error: cause instanceof Error ? cause.message : String(cause),
    })
    return Response.json({ sent: false })
  }
}
