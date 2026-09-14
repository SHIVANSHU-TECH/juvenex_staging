import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAdmin, getServiceSupabase } from '@/lib/org-admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { isAllowedImageUrl, IMAGE_URL_ALLOWLIST_MESSAGE } from '@/lib/url-allowlist'

// GET  /api/org/[slug]/admin  — Overview: org details + headline stats
// PUT  /api/org/[slug]/admin  — Update editable org fields (Overview tab)

const updateOrgSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  logo_url: z
    .string()
    .url()
    .refine(isAllowedImageUrl, IMAGE_URL_ALLOWLIST_MESSAGE)
    .nullable()
    .optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color')
    .nullable()
    .optional(),
  // `organizations` has no `description` column in 001; reuse `website` as a
  // short free-text field if needed. We intentionally expose only editable
  // brand/contact fields here — slug, id, referral_code are read-only.
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().url().max(500).nullable().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx = await authorizeOrgAdmin(slug)
    if (ctx instanceof Response) return ctx
    const { org, user } = ctx

    // Rate-limit GET to keep the overview tab from being a free
    // multi-table aggregation endpoint to scrape; 60/min is comfortable for
    // an admin browsing the dashboard, but blocks scripted abuse.
    const rl = rateLimit(`org-admin-overview:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const supabase = getServiceSupabase()

    // Total members (including banned-from-org users, so the admin can see them)
    const { count: totalMembers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id)

    // Orders this month (UTC start of month)
    const now = new Date()
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    ).toISOString()

    // Need user_ids of this org's members first (no JOIN in PostgREST).
    const { data: memberRows } = await supabase
      .from('profiles')
      .select('id')
      .eq('organization_id', org.id)
    const memberIds = (memberRows ?? []).map((r) => (r as { id: string }).id)

    let ordersThisMonth = 0
    if (memberIds.length > 0) {
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('user_id', memberIds)
        .gte('created_at', monthStart)
      ordersThisMonth = count ?? 0
    }

    // Pending reports: reports whose post author belongs to this org.
    let pendingReports = 0
    if (memberIds.length > 0) {
      // Get post IDs authored by org members
      const { data: postRows } = await supabase
        .from('posts')
        .select('id')
        .in('user_id', memberIds)
      const postIds = (postRows ?? []).map(
        (r) => (r as { id: string }).id
      )
      if (postIds.length > 0) {
        const { count } = await supabase
          .from('post_reports')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .in('post_id', postIds)
        pendingReports = count ?? 0
      }
    }

    return Response.json({
      success: true,
      data: {
        organization: org,
        stats: {
          total_members: totalMembers ?? 0,
          orders_this_month: ordersThisMonth,
          pending_reports: pendingReports,
        },
      },
    })
  } catch (error: unknown) {
    logger.error('org-admin GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx = await authorizeOrgAdmin(slug)
    if (ctx instanceof Response) return ctx
    const { org, user } = ctx

    const rl = rateLimit(`org-admin-put:${user.id}:${org.id}`, 20, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const body: unknown = await request.json()
    const parsed = updateOrgSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    // Build patch with only provided keys so we never clobber other fields.
    const patch: Record<string, string | null> = {}
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) patch[key] = value
    }

    if (Object.keys(patch).length === 0) {
      return Response.json(
        { success: false, error: 'No editable fields provided' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()
    const { data: updated, error: updateError } = await supabase
      .from('organizations')
      .update(patch)
      .eq('id', org.id)
      .select(
        'id, name, slug, type, logo_url, primary_color, phone, email, website, created_at'
      )
      .single()

    if (updateError || !updated) {
      logger.error('org-admin update error', { error: updateError?.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    return Response.json({ success: true, data: { organization: updated } })
  } catch (error: unknown) {
    logger.error('org-admin PUT error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
