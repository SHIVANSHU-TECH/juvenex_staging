import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

// GET /api/orders
//
// Patient-facing list of the authenticated user's own orders. Paginated,
// newest first. Returns ONLY non-sensitive list-level columns — full detail
// (including shipping_address and intake_answers) is on /api/orders/[id].
//
// Auth: required. Even though RLS scopes to the user, we explicitly filter by
// user_id with the service-role client to avoid relying solely on RLS.

// Allowed values for the optional ?status= filter. Mirrors the orders.status
// CHECK constraint introduced in migration 022. Anything outside this set is
// rejected at the validation boundary so a typo never silently returns an
// empty list.
const ORDER_STATUS_VALUES = [
  'pending',
  'paid',
  'shipped',
  'fulfilled',
  'refunded',
  'cancelled',
] as const

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(ORDER_STATUS_VALUES).optional(),
})

interface OrderListRow {
  id: string
  status: string
  total_cents: number
  currency: string
  items: unknown
  payment_status: string | null
  prescriberx_status: string | null
  created_at: string
  updated_at: string | null
  fulfilled_at: string | null
  prescriberx_reference: string | null
}

export interface PatientOrderListItem {
  id: string
  status: string
  total_cents: number
  currency: string
  items: unknown
  payment_status: string | null
  prescriberx_status: string
  created_at: string
  updated_at: string | null
  fulfilled_at: string | null
  prescriberx_reference: string | null
}

const PATIENT_ORDERS_LIST_COLUMNS =
  'id, status, total_cents, currency, items, payment_status, ' +
  'prescriberx_status, created_at, updated_at, fulfilled_at, ' +
  'prescriberx_reference'

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status })
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return jsonError(401, 'Unauthorized')

    const rl = rateLimit(`patient-orders:${user.id}`, 60, 60_000)
    if (!rl.success) return jsonError(429, 'Too many requests')

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

    const { page, limit, status } = parsed.data
    const offset = (page - 1) * limit

    const supabase = createAdminClient()

    // Build the base query, optionally narrowed by status. We apply the same
    // filter to the count and list queries so meta.total reflects the
    // filtered set.
    let countQuery = supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if (status) {
      countQuery = countQuery.eq('status', status)
    }
    const { count, error: countError } = await countQuery
    if (countError) {
      logger.error('patient/orders count error', { error: countError.message })
      return jsonError(500, 'Internal server error')
    }
    const total = count ?? 0

    let listQuery = supabase
      .from('orders')
      .select(PATIENT_ORDERS_LIST_COLUMNS)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (status) {
      listQuery = listQuery.eq('status', status)
    }
    const { data: ordersData, error: listError } = await listQuery

    if (listError) {
      logger.error('patient/orders list error', { error: listError.message })
      return jsonError(500, 'Internal server error')
    }

    const rawOrders = (ordersData ?? []) as unknown as OrderListRow[]

    const orders: PatientOrderListItem[] = rawOrders.map((o) => ({
      id: o.id,
      status: o.status,
      total_cents: o.total_cents,
      currency: o.currency,
      items: o.items,
      payment_status: o.payment_status ?? null,
      prescriberx_status: o.prescriberx_status ?? 'not_sent',
      created_at: o.created_at,
      updated_at: o.updated_at ?? null,
      fulfilled_at: o.fulfilled_at ?? null,
      prescriberx_reference: o.prescriberx_reference ?? null,
    }))

    return Response.json({
      success: true,
      data: { orders },
      meta: { total, page, limit },
    })
  } catch (error: unknown) {
    logger.error('patient/orders unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError(500, 'Internal server error')
  }
}
