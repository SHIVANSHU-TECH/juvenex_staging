import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// GET /api/admin/blogs
// POST /api/admin/blogs
// Auth: super_admin only. Schema support comes from migration 011_blogs.sql.

const BLOG_COLUMNS =
  'id, title, slug, excerpt, cover_image, section, body, author, published_at, created_at, updated_at'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['all', 'draft', 'published', 'scheduled']).default('all'),
  search: z.string().trim().max(200).optional(),
})

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens')

const createBlogSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: slugSchema,
  excerpt: z.string().trim().min(1).max(500),
  cover_image: z.string().trim().max(500).nullable().optional(),
  section: z.string().trim().max(80).nullable().optional(),
  body: z.string().trim().min(1).max(50_000),
  author: z.string().trim().min(1).max(120).default('Juvenex Team'),
  published_at: z.string().trim().datetime().nullable().optional(),
})

export interface AdminBlog {
  id: string
  title: string
  slug: string
  excerpt: string
  cover_image: string | null
  section: string | null
  body: string
  author: string
  published_at: string | null
  created_at: string
  updated_at: string
}

async function requireSuperAdmin() {
  const user = await getAuthUser()
  if (!user) {
    return {
      ok: false as const,
      response: Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    }
  }

  if (user.role !== 'super_admin') {
    return {
      ok: false as const,
      response: Response.json(
        { success: false, error: 'Forbidden: super_admin role required' },
        { status: 403 }
      ),
    }
  }

  return { ok: true as const, user }
}

interface BlogFilterQuery<T> {
  is(column: string, value: null): T
  not(column: string, operator: string, value: null): T
  lte(column: string, value: string): T
  gt(column: string, value: string): T
}

function applyStatusFilter<T extends BlogFilterQuery<T>>(
  query: T,
  status: z.infer<typeof querySchema>['status'],
  nowIso: string
) {
  if (status === 'draft') return query.is('published_at', null)
  if (status === 'published') {
    return query.not('published_at', 'is', null).lte('published_at', nowIso)
  }
  if (status === 'scheduled') return query.gt('published_at', nowIso)
  return query
}

function escapeSearch(value: string): string {
  return value.replace(/[\\%_,]/g, (c) => `\\${c}`)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`admin-blogs:${auth.user.id}`, 60, 60_000)
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

    const { page, limit, status, search } = parsed.data
    const offset = (page - 1) * limit
    const nowIso = new Date().toISOString()
    const supabase = createAdminClient()
    const escapedSearch = search ? escapeSearch(search) : null

    let countQuery = supabase
      .from('blogs')
      .select('*', { count: 'exact', head: true })
    countQuery = applyStatusFilter(countQuery, status, nowIso)
    if (escapedSearch) {
      countQuery = countQuery.or(
        `title.ilike.%${escapedSearch}%,slug.ilike.%${escapedSearch}%,author.ilike.%${escapedSearch}%`
      )
    }
    const { count, error: countError } = await countQuery
    if (countError) {
      logger.error('Admin blogs count error', { error: countError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    let listQuery = supabase.from('blogs').select(BLOG_COLUMNS)
    listQuery = applyStatusFilter(listQuery, status, nowIso)
    if (escapedSearch) {
      listQuery = listQuery.or(
        `title.ilike.%${escapedSearch}%,slug.ilike.%${escapedSearch}%,author.ilike.%${escapedSearch}%`
      )
    }

    const { data, error } = await listQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error('Admin blogs list error', { error: error.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const total = count ?? 0
    return Response.json({
      success: true,
      data: {
        blogs: (data ?? []) as AdminBlog[],
        total,
        hasMore: offset + limit < total,
      },
      meta: { total, page, limit },
    })
  } catch (error: unknown) {
    logger.error('Admin blogs list unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`admin-blogs-create:${auth.user.id}`, 20, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const parsed = createBlogSchema.safeParse(await request.json())
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: 'Invalid blog payload',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const payload = parsed.data
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('blogs')
      .insert({
        title: payload.title,
        slug: payload.slug,
        excerpt: payload.excerpt,
        cover_image: payload.cover_image?.trim() || null,
        section: payload.section?.trim() || null,
        body: payload.body,
        author: payload.author,
        published_at: payload.published_at ?? null,
      })
      .select(BLOG_COLUMNS)
      .single()

    if (error) {
      if (error.code === '23505') {
        return Response.json(
          { success: false, error: 'A blog with this slug already exists' },
          { status: 409 }
        )
      }
      logger.error('Admin blog create error', { error: error.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    return Response.json(
      { success: true, data: { blog: data as AdminBlog } },
      { status: 201 }
    )
  } catch (error: unknown) {
    logger.error('Admin blog create unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
