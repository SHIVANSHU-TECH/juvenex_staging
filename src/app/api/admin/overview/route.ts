import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// GET /api/admin/overview
// Aggregated KPI counts + recent activity feed for the admin dashboard
// Overview tab.
// Auth: super_admin only.

interface OrderRow {
  id: string
  user_id: string
  total_cents: number
  currency: string
  status: string
  created_at: string
}

interface ReportRow {
  id: string
  post_id: string
  reporter_id: string
  reason: string
  status: string
  created_at: string
}

interface ProfileRow {
  id: string
  name: string | null
  email: string
}

export interface AdminOverviewOrder {
  id: string
  customer_name: string | null
  customer_email: string | null
  total_cents: number
  currency: string
  status: string
  created_at: string
}

export interface AdminOverviewReport {
  id: string
  reason: string
  status: string
  created_at: string
  reporter_name: string | null
  reporter_email: string | null
}

export interface AdminOverviewData {
  orgs: { total: number; new_this_week: number }
  patients: { total: number; new_this_week: number }
  reports: { pending: number }
  messages: { unread_total: number }
  recent_orders: AdminOverviewOrder[]
  recent_reports: AdminOverviewReport[]
}

function weekAgoIso(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
}

async function unwrapCount(
  promise: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  label: string
): Promise<number> {
  const { count: c, error } = await promise
  if (error) throw new Error(`${label} count: ${error.message}`)
  return c ?? 0
}

export async function GET() {
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

    const rl = rateLimit(`admin-overview:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const supabase = createAdminClient()
    const since = weekAgoIso()

    // Run the independent count queries in parallel so a slow table cannot
    // serialize the whole dashboard load.
    const head = { count: 'exact', head: true } as const
    const [
      orgsTotal,
      orgsNew,
      patientsTotal,
      patientsNew,
      reportsPending,
      messagesUnread,
    ] = await Promise.all([
      unwrapCount(
        supabase.from('organizations').select('*', head),
        'organizations'
      ),
      unwrapCount(
        supabase
          .from('organizations')
          .select('*', head)
          .gte('created_at', since),
        'organizations_new'
      ),
      unwrapCount(
        supabase.from('profiles').select('*', head).eq('role', 'patient'),
        'patients'
      ),
      unwrapCount(
        supabase
          .from('profiles')
          .select('*', head)
          .eq('role', 'patient')
          .gte('created_at', since),
        'patients_new'
      ),
      unwrapCount(
        supabase
          .from('post_reports')
          .select('*', head)
          .eq('status', 'pending'),
        'reports_pending'
      ),
      unwrapCount(
        supabase.from('messages').select('*', head).is('read_at', null),
        'messages_unread'
      ),
    ])

    // Recent orders + reports
    const { data: recentOrdersRaw, error: ordersErr } = await supabase
      .from('orders')
      .select('id, user_id, total_cents, currency, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
    if (ordersErr) {
      logger.error('Admin overview orders list error', {
        error: ordersErr.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    const recentOrders = (recentOrdersRaw ?? []) as OrderRow[]

    const { data: recentReportsRaw, error: reportsErr } = await supabase
      .from('post_reports')
      .select('id, post_id, reporter_id, reason, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
    if (reportsErr) {
      logger.error('Admin overview reports list error', {
        error: reportsErr.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    const recentReports = (recentReportsRaw ?? []) as ReportRow[]

    // Batch-fetch every profile referenced by the activity feed in one query.
    const profileIds = Array.from(
      new Set<string>([
        ...recentOrders.map((o) => o.user_id),
        ...recentReports.map((r) => r.reporter_id),
      ])
    )
    const profileById = new Map<string, ProfileRow>()
    if (profileIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', profileIds)
      for (const p of (profilesData ?? []) as ProfileRow[]) {
        profileById.set(p.id, p)
      }
    }

    const data: AdminOverviewData = {
      orgs: { total: orgsTotal, new_this_week: orgsNew },
      patients: { total: patientsTotal, new_this_week: patientsNew },
      reports: { pending: reportsPending },
      messages: { unread_total: messagesUnread },
      recent_orders: recentOrders.map((o) => {
        const p = profileById.get(o.user_id) ?? null
        return {
          id: o.id,
          customer_name: p?.name ?? null,
          customer_email: p?.email ?? null,
          total_cents: o.total_cents,
          currency: o.currency,
          status: o.status,
          created_at: o.created_at,
        }
      }),
      recent_reports: recentReports.map((r) => {
        const p = profileById.get(r.reporter_id) ?? null
        return {
          id: r.id,
          reason: r.reason,
          status: r.status,
          created_at: r.created_at,
          reporter_name: p?.name ?? null,
          reporter_email: p?.email ?? null,
        }
      }),
    }

    return Response.json({ success: true, data })
  } catch (error: unknown) {
    logger.error('Admin overview error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
