import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAdmin, getServiceSupabase } from '@/lib/org-admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// GET /api/org/[slug]/admin/orders
// Orders WHERE orders.user_id IN (profiles of this org).
// Mirrors /api/admin/orders but scoped to a single organization.

const ORDER_STATUSES = [
  'pending',
  'paid',
  'shipped',
  'refunded',
  'cancelled',
] as const

const querySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
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
}

interface ProfileRow {
  id: string
  name: string | null
  email: string
}

export interface OrgAdminOrder {
  id: string
  user_id: string
  customer_name: string | null
  customer_email: string | null
  total_cents: number
  currency: string
  status: string
  items: unknown
  created_at: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx = await authorizeOrgAdmin(slug)
    if (ctx instanceof Response) return ctx
    const { org, user } = ctx

    const rl = rateLimit(`org-admin-orders:${user.id}:${org.id}`, 60, 60_000)
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

    const { status, page, limit } = parsed.data
    const offset = (page - 1) * limit

    const supabase = getServiceSupabase()

    // Step 1: pull the member ids (PostgREST lacks a JOIN).
    const { data: memberRows, error: memberErr } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('organization_id', org.id)
    if (memberErr) {
      logger.error('org-admin orders member fetch error', {
        error: memberErr.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const profileById = new Map<string, ProfileRow>()
    for (const row of (memberRows ?? []) as ProfileRow[]) {
      profileById.set(row.id, row)
    }
    const memberIds = Array.from(profileById.keys())

    if (memberIds.length === 0) {
      return Response.json({
        success: true,
        data: { orders: [], total: 0, hasMore: false },
        meta: { total: 0, page, limit },
      })
    }

    // Step 2: count
    let countQuery = supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('user_id', memberIds)
    if (status) countQuery = countQuery.eq('status', status)
    const { count } = await countQuery
    const total = count ?? 0

    // Step 3: list
    let listQuery = supabase
      .from('orders')
      .select('id, user_id, total_cents, currency, status, items, created_at')
      .in('user_id', memberIds)
    if (status) listQuery = listQuery.eq('status', status)

    const { data: ordersData, error: listError } = await listQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (listError) {
      logger.error('org-admin orders list error', { error: listError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const rawOrders = (ordersData ?? []) as OrderRow[]
    const orders: OrgAdminOrder[] = rawOrders.map((o) => {
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
    logger.error('org-admin orders error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
