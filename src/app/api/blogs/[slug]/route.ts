import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// Public read for a single published blog by slug.

const BLOG_COLUMNS =
  'id, title, slug, excerpt, cover_image, body, author, published_at, created_at, updated_at'

// Slugs are kebab-case, ASCII-only, max 200 chars. Pattern enforcement is a
// cheap reject for path-param fuzzing (`../`, query injection attempts, etc.)
// before the value ever reaches PostgREST.
const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug')

// Resolve the caller's IP from forward headers. Same shape as the helper in
// blogs/route.ts — kept locally so this file has no cross-route import. Falls
// back to `unknown` so we still impose SOME ceiling for unidentifiable IPs.
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

export interface BlogDetail {
  id: string
  title: string
  slug: string
  excerpt: string
  cover_image: string | null
  body: string
  author: string
  published_at: string
  created_at: string
  updated_at: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // Public endpoint: rate-limit per IP. Mirrors blogs/route.ts ceiling.
    const ip = clientIp(request)
    const rl = rateLimit(`blogs-slug-public:${ip}`, 120, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const { slug } = await params

    const slugParse = slugSchema.safeParse(slug)
    if (!slugParse.success) {
      return Response.json(
        { success: false, error: 'Invalid slug' },
        { status: 400 }
      )
    }
    const safeSlug = slugParse.data

    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    const { data, error } = await supabase
      .from('blogs')
      .select(BLOG_COLUMNS)
      .eq('slug', safeSlug)
      .not('published_at', 'is', null)
      .lte('published_at', nowIso)
      .maybeSingle()

    if (error) {
      logger.error('Blog detail fetch error', { error: error.message, slug: safeSlug })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!data) {
      return Response.json(
        { success: false, error: 'Blog not found' },
        { status: 404 }
      )
    }

    return Response.json({
      success: true,
      data: {
        // safe: BLOG_COLUMNS lists exactly the keys in BlogDetail; row is a
        // public display read with no auth-decision use.
        blog: data as BlogDetail,
      },
    })
  } catch (error: unknown) {
    logger.error('Blog detail unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
