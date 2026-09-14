import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// Resolve the caller's IP from forward headers. Falls back to a constant
// shared bucket if no IP can be derived so we still impose SOME ceiling.
function clientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = request.headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}

// Public read endpoint — no auth required. Returns the most recently
// published blogs, ordered by published_at DESC.

const BLOG_COLUMNS =
  'id, title, slug, excerpt, cover_image, section, author, published_at, created_at, updated_at'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

export interface BlogListItem {
  id: string
  title: string
  slug: string
  excerpt: string
  cover_image: string | null
  section: string | null
  author: string
  published_at: string
  created_at: string
  updated_at: string
}

export async function GET(request: NextRequest) {
  try {
    // Public endpoint: no auth, so rate-limit per IP. The shared `unknown`
    // bucket falls back to one global ceiling for callers we cannot identify
    // (corp NAT, anonymising proxy, etc) — a deliberate trade-off so the
    // endpoint is never wide-open.
    const ip = clientIp(request)
    const rl = rateLimit(`blogs-public:${ip}`, 120, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = querySchema.safeParse(searchParams)
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

    const { limit } = parsed.data

    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    const { data, error } = await supabase
      .from('blogs')
      .select(BLOG_COLUMNS)
      .not('published_at', 'is', null)
      .lte('published_at', nowIso)
      .order('published_at', { ascending: false })
      .limit(limit)

    if (error) {
      logger.error('Blogs list error', { error: error.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    // safe: BLOG_COLUMNS lists exactly the keys in BlogListItem; rows are
    // public read-only and never drive an authorization branch.
    const blogs = (data ?? []) as BlogListItem[]

    return Response.json({
      success: true,
      data: { blogs },
    })
  } catch (error: unknown) {
    logger.error('Blogs list unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
