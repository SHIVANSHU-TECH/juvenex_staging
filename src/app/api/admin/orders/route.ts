import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// GET /api/admin/orders
// Paginated list of orders for the admin dashboard.
// Auth: super_admin only.
//
// Filters:
//   ?status=pending|paid|shipped|fulfilled|refunded|cancelled
//   ?prescriberx_status=not_sent|sent|confirmed|failed
//   ?payment_status=pending|succeeded|failed|refunded
//
// Pagination: ?page=1&limit=25 (max 100, default 25)

const ORDER_STATUSES = [
  'pending',
  'paid',
  'shipped',
  'fulfilled',
  'refunded',
  'cancelled',
] as const

const PRESCRIBERX_STATUSES = [
  'not_sent',
  'sent',
  'confirmed',
  'failed',
] as const

const PAYMENT_STATUSES = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
] as const

const querySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  prescriberx_status: z.enum(PRESCRIBERX_STATUSES).optional(),
  payment_status: z.enum(PAYMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

interface OrderRow {
  id: string
  user_id: string
  total_cents: number
  currency: string
  status: string
  items: unknown
  created_at: string
  payment_status: string | null
  prescriberx_status: string | null
  prescriberx_reference: string | null
  prescriberx_sent_at: string | null
  fulfilled_at: string | null
  contact_email: string | null
}

interface ProfileRow {
  id: string
  name: string | null
  email: string
}

export interface AdminOrder {
  id: string
  user_id: string
  customer_name: string | null
  customer_email: string | null
  total_cents: number
  currency: string
  status: string
  items: unknown
  created_at: string
  payment_status: string | null
  prescriberx_status: string | null
  prescriberx_reference: string | null
  prescriberx_sent_at: string | null
  fulfilled_at: string | null
  contact_email: string | null
}

const ADMIN_ORDERS_LIST_COLUMNS =
  'id, user_id, total_cents, currency, status, items, created_at, ' +
  'payment_status, prescriberx_status, prescriberx_reference, ' +
  'prescriberx_sent_at, fulfilled_at, contact_email'

// A PURE membership order (its only line is the membership) is not physical
// fulfillment work and must NOT appear in the PrescribeRx queue. A COMBINED
// order (membership + one or more products) MUST appear so the PRODUCT still
// ships — only the membership half is settled via Kurv; the product is still
// forwarded to PrescribeRx. "Has a product line" can't be expressed as a simple
// PostgREST filter, so we post-filter membership-only orders in code.
function isMembershipOnly(items: unknown): boolean {
  if (!Array.isArray(items) || items.length === 0) return false
  return items.every(
    (it) =>
      it !== null &&
      typeof it === 'object' &&
      (it as { kind?: unknown }).kind === 'membership'
  )
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (user.role !== 'super_admin') {
      return Response.json(
        { success: false, error: 'Forbidden: super_admin role required' },
        { status: 403 }
      )
    }

    const rl = rateLimit(`admin-orders:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const parsed = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    )
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const { status, prescriberx_status, payment_status, page, limit } =
      parsed.data
    const offset = (page - 1) * limit

    const supabase = createAdminClient()

    // NOTE: pure-membership orders are filtered out in code (isMembershipOnly)
    // after fetch — see below. We can't exclude them in the query because a
    // COMBINED order (membership + product) must remain visible so the product
    // ships, and "membership-only" isn't a simple PostgREST predicate. The
    // count therefore counts membership-bearing orders too; the list drops the
    // pure ones, so a page may show slightly fewer than `limit` rows.
    let countQuery = supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
    if (status) countQuery = countQuery.eq('status', status)
    if (prescriberx_status) {
      countQuery = countQuery.eq('prescriberx_status', prescriberx_status)
    }
    if (payment_status) {
      countQuery = countQuery.eq('payment_status', payment_status)
    }
    const { count, error: countError } = await countQuery
    if (countError) {
      logger.error('Admin orders count error', { error: countError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    const total = count ?? 0

    let listQuery = supabase
      .from('orders')
      .select(ADMIN_ORDERS_LIST_COLUMNS)
    if (status) listQuery = listQuery.eq('status', status)
    if (prescriberx_status) {
      listQuery = listQuery.eq('prescriberx_status', prescriberx_status)
    }
    if (payment_status) {
      listQuery = listQuery.eq('payment_status', payment_status)
    }

    const { data: ordersData, error: listError } = await listQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (listError) {
      logger.error('Admin orders list error', { error: listError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    // Drop pure-membership orders — they carry no shippable product. Combined
    // orders (membership + product) stay so the product reaches PrescribeRx.
    const rawOrders = ((ordersData ?? []) as unknown as OrderRow[]).filter(
      (o) => !isMembershipOnly(o.items)
    )

    // Batch-fetch customer profiles in a single query.
    const userIds = Array.from(new Set(rawOrders.map((o) => o.user_id)))
    const profileById = new Map<string, ProfileRow>()
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds)
      for (const p of (profilesData ?? []) as ProfileRow[]) {
        profileById.set(p.id, p)
      }
    }

    const orders: AdminOrder[] = rawOrders.map((o) => {
      const profile = profileById.get(o.user_id)
      return {
        id: o.id,
        user_id: o.user_id,
        customer_name: profile?.name ?? null,
        customer_email: profile?.email ?? null,
        total_cents: o.total_cents,
        currency: o.currency,
        status: o.status,
        items: o.items,
        created_at: o.created_at,
        payment_status: o.payment_status ?? null,
        prescriberx_status: o.prescriberx_status ?? 'not_sent',
        prescriberx_reference: o.prescriberx_reference ?? null,
        prescriberx_sent_at: o.prescriberx_sent_at ?? null,
        fulfilled_at: o.fulfilled_at ?? null,
        contact_email: o.contact_email ?? null,
      }
    })

    return Response.json({
      success: true,
      data: {
        orders,
        total,
        hasMore: offset + limit < total,
      },
      meta: { total, page, limit },
    })
  } catch (error: unknown) {
    logger.error('Admin orders error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
