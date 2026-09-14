import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAdmin, getServiceSupabase } from '@/lib/org-admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// GET /api/org/[slug]/admin/reports
// post_reports whose reported post was authored by a member of this org.

const REPORT_STATUSES = ['pending', 'reviewed', 'dismissed'] as const

const querySchema = z.object({
  status: z.enum(REPORT_STATUSES).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

interface ReportRow {
  id: string
  post_id: string
  reporter_id: string
  reason: string
  status: string
  created_at: string
}

interface PostRow {
  id: string
  user_id: string
  body: string
  image_url: string | null
  is_public: boolean
  created_at: string
}

interface ProfileRow {
  id: string
  name: string | null
  email: string
}

export interface OrgAdminReport {
  id: string
  status: string
  reason: string
  created_at: string
  reporter: { id: string; name: string | null; email: string } | null
  post: {
    id: string
    body: string
    image_url: string | null
    is_public: boolean
    created_at: string
    author: { id: string; name: string | null; email: string } | null
  } | null
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

    const rl = rateLimit(`org-admin-reports:${user.id}:${org.id}`, 60, 60_000)
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

    // Step 1: get member ids for this org
    const { data: memberRows } = await supabase
      .from('profiles')
      .select('id')
      .eq('organization_id', org.id)
    const memberIds = ((memberRows ?? []) as { id: string }[]).map(
      (r) => r.id
    )

    if (memberIds.length === 0) {
      return Response.json({
        success: true,
        data: { reports: [], total: 0, hasMore: false },
        meta: { total: 0, page, limit },
      })
    }

    // Step 2: get post ids authored by those members.
    // BOUNDED FAN-OUT: cap at 1000 rows. Trade-off — if an org has more than
    // 1000 posts authored by its members, the oldest posts beyond the cap will
    // not surface as candidates for a report join here. This is acceptable
    // because (a) reports themselves are paginated below, (b) reports of very
    // old posts are uncommon, and (c) without the cap, a large org could
    // produce a multi-MB intermediate id list. Revisit when org-scoped post
    // pagination/indexing on (organization_id, created_at) lands.
    const { data: postRows } = await supabase
      .from('posts')
      .select('id, user_id, body, image_url, is_public, created_at')
      .in('user_id', memberIds)
      .limit(1000)
    const postById = new Map<string, PostRow>()
    for (const p of (postRows ?? []) as PostRow[]) {
      postById.set(p.id, p)
    }
    const postIds = Array.from(postById.keys())

    if (postIds.length === 0) {
      return Response.json({
        success: true,
        data: { reports: [], total: 0, hasMore: false },
        meta: { total: 0, page, limit },
      })
    }

    // Step 3: count + list reports on those posts
    const { count } = await supabase
      .from('post_reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', status)
      .in('post_id', postIds)
    const total = count ?? 0

    const { data: reportsData, error: listError } = await supabase
      .from('post_reports')
      .select('id, post_id, reporter_id, reason, status, created_at')
      .eq('status', status)
      .in('post_id', postIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (listError) {
      logger.error('org-admin reports list error', {
        error: listError.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const rawReports = (reportsData ?? []) as ReportRow[]

    // Batch-fetch reporter + author profiles
    const reporterIds = new Set(rawReports.map((r) => r.reporter_id))
    const authorIds = new Set<string>()
    for (const r of rawReports) {
      const post = postById.get(r.post_id)
      if (post) authorIds.add(post.user_id)
    }
    const profileIds = Array.from(new Set([...reporterIds, ...authorIds]))

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

    const reports: OrgAdminReport[] = rawReports.map((r) => {
      const reporter = profileById.get(r.reporter_id) ?? null
      const post = postById.get(r.post_id) ?? null
      const author = post ? (profileById.get(post.user_id) ?? null) : null
      return {
        id: r.id,
        status: r.status,
        reason: r.reason,
        created_at: r.created_at,
        reporter: reporter
          ? { id: reporter.id, name: reporter.name, email: reporter.email }
          : null,
        post: post
          ? {
              id: post.id,
              body: post.body,
              image_url: post.image_url,
              is_public: post.is_public,
              created_at: post.created_at,
              author: author
                ? { id: author.id, name: author.name, email: author.email }
                : null,
            }
          : null,
      }
    })

    return Response.json({
      success: true,
      data: { reports, total, hasMore: offset + limit < total },
      meta: { total, page, limit },
    })
  } catch (error: unknown) {
    logger.error('org-admin reports error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
