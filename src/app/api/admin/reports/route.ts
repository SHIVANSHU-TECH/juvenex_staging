import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// GET /api/admin/reports
// Paginated list of post reports for moderation review.
// Auth: super_admin only.

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

export interface AdminReport {
  id: string
  status: string
  reason: string
  created_at: string
  reporter: {
    id: string
    name: string | null
    email: string
  } | null
  post: {
    id: string
    body: string
    image_url: string | null
    is_public: boolean
    created_at: string
    author: {
      id: string
      name: string | null
      email: string
    } | null
  } | null
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

    const rl = rateLimit(`admin-reports:${user.id}`, 60, 60_000)
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

    const supabase = createAdminClient()

    const { count, error: countError } = await supabase
      .from('post_reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', status)
    if (countError) {
      logger.error('Admin reports count error', { error: countError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    const total = count ?? 0

    const { data: reportsData, error: listError } = await supabase
      .from('post_reports')
      .select('id, post_id, reporter_id, reason, status, created_at')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (listError) {
      logger.error('Admin reports list error', { error: listError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const rawReports = (reportsData ?? []) as ReportRow[]

    // Batch-fetch related posts and profiles.
    const postIds = Array.from(new Set(rawReports.map((r) => r.post_id)))
    const reporterIds = new Set(rawReports.map((r) => r.reporter_id))

    const postById = new Map<string, PostRow>()
    if (postIds.length > 0) {
      const { data: postsData } = await supabase
        .from('posts')
        .select('id, user_id, body, image_url, is_public, created_at')
        .in('id', postIds)
      for (const p of (postsData ?? []) as PostRow[]) {
        postById.set(p.id, p)
      }
    }

    const authorIds = new Set<string>()
    for (const p of postById.values()) authorIds.add(p.user_id)
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

    const reports: AdminReport[] = rawReports.map((r) => {
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
      data: {
        reports,
        total,
        hasMore: offset + limit < total,
      },
      meta: { total, page, limit },
    })
  } catch (error: unknown) {
    logger.error('Admin reports error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
