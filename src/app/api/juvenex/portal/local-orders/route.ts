/**
 * Local mirror of the customer's WhiteLabelMD order list.
 *
 * Reads the rows written by `persistJuvenexOrder` instead of round-tripping to
 * the vendor. The client (`OrdersList`) prefers this and falls back to the
 * live `list-orders` call when it comes back empty — which is the case for
 * every customer who ordered before migration 050, since those orders were
 * never mirrored locally.
 *
 * RESPONSE SHAPE
 * Deliberately mimics the vendor's `list-orders` payload (`status: 1` plus an
 * `orders` array keyed the way `OrdersList` already reads it) so the two
 * sources are interchangeable and the component needs no branching beyond
 * "empty → try the vendor".
 *
 * AUTHORIZATION
 * This uses the service-role client, which BYPASSES RLS — so the `user_id`
 * filter below is the only thing standing between a caller and someone else's
 * orders. Never remove it, and never let a client-supplied id reach it.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/juvenex/route-utils'
import { JUVENEX_VENDOR } from '@/lib/juvenex/persist-order'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

interface LocalOrderRow {
  vendor_order_id: string | null
  vendor_status: string | null
  total_cents: number
  status: string
  created_at: string
}

/**
 * Human-readable status for a locally-mirrored order.
 *
 * `vendor_status` holds the raw `Create_Order` acknowledgement ("1"), which is
 * a creation ack rather than a fulfilment state and would be meaningless in
 * the UI. Until a sync pass populates a real vendor status, derive the label
 * from the local lifecycle column instead.
 */
function displayStatus(row: LocalOrderRow): string {
  switch (row.status) {
    case 'paid':
      return 'Processing'
    case 'shipped':
      return 'Shipped'
    case 'fulfilled':
      return 'Delivered'
    case 'cancelled':
      return 'Cancelled'
    case 'refunded':
      return 'Refunded'
    default:
      return 'Processing'
  }
}

export async function POST() {
  const auth = await requireUser(60, 'portal-read')
  if ('response' in auth) return auth.response

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('orders')
      .select('vendor_order_id, vendor_status, total_cents, status, created_at')
      .eq('user_id', auth.user.id)
      .eq('vendor', JUVENEX_VENDOR)
      .not('vendor_order_id', 'is', null)
      .order('created_at', { ascending: false })

    if (error) {
      // Degrade to "no local rows" so the client falls back to the vendor.
      // A local-cache miss must never block the customer from seeing orders.
      logger.error('portal/local-orders: query failed', {
        userId: auth.user.id,
        error: error.message,
      })
      return Response.json({ status: 1, orders: [], total: 0 })
    }

    const rows = (data ?? []) as LocalOrderRow[]
    const orders = rows.map((row) => ({
      order_id: row.vendor_order_id,
      order_status_meaning: displayStatus(row),
      order_total: (row.total_cents / 100).toFixed(2),
      order_type: 'one_time',
      time: row.created_at,
    }))

    return Response.json({ status: 1, orders, total: orders.length })
  } catch (error: unknown) {
    logger.error('portal/local-orders: unexpected failure', {
      userId: auth.user.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ status: 1, orders: [], total: 0 })
  }
}
