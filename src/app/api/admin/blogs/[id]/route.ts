import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import type { AdminBlog } from '../route'

// PATCH  /api/admin/blogs/[id] — edit any blog post
// DELETE /api/admin/blogs/[id] — delete any blog post
// Auth: super_admin only. RLS (011_blogs.sql, blogs_admin_all) already grants
// super_admins full access to every row regardless of author, so there is no
// ownership check to satisfy — the feature simply did not exist before.

const BLOG_COLUMNS =
  'id, title, slug, excerpt, cover_image, section, body, author, published_at, created_at, updated_at'

const idSchema = z.string().uuid()

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens')

const updateBlogSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    slug: slugSchema.optional(),
    excerpt: z.string().trim().min(1).max(500).optional(),
    cover_image: z.string().trim().max(500).nullable().optional(),
    section: z.string().trim().max(80).nullable().optional(),
    body: z.string().trim().min(1).max(50_000).optional(),
    author: z.string().trim().min(1).max(120).optional(),
    published_at: z.string().trim().datetime().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields to update',
  })

async function requireSuperAdmin() {
  const user = await getAuthUser()
  if (!user) {
    return {
      ok: false as const,
      response: Response.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`admin-blogs-update:${auth.user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id } = await params
    const idCheck = idSchema.safeParse(id)
    if (!idCheck.success) {
      return Response.json({ success: false, error: 'Invalid blog id' }, { status: 400 })
    }

    const parsed = updateBlogSchema.safeParse(await request.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid blog payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const patch = parsed.data
    const update: Record<string, unknown> = {}
    if (patch.title !== undefined) update.title = patch.title
    if (patch.slug !== undefined) update.slug = patch.slug
    if (patch.excerpt !== undefined) update.excerpt = patch.excerpt
    if (patch.cover_image !== undefined) update.cover_image = patch.cover_image?.trim() || null
    if (patch.section !== undefined) update.section = patch.section?.trim() || null
    if (patch.body !== undefined) update.body = patch.body
    if (patch.author !== undefined) update.author = patch.author
    if (patch.published_at !== undefined) update.published_at = patch.published_at ?? null

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('blogs')
      .update(update)
      .eq('id', idCheck.data)
      .select(BLOG_COLUMNS)
      .single()

    if (error) {
      if (error.code === '23505') {
        return Response.json(
          { success: false, error: 'A blog with this slug already exists' },
          { status: 409 }
        )
      }
      if (error.code === 'PGRST116') {
        return Response.json({ success: false, error: 'Blog not found' }, { status: 404 })
      }
      logger.error('Admin blog update error', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    return Response.json({ success: true, data: { blog: data as AdminBlog } })
  } catch (error: unknown) {
    logger.error('Admin blog update unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`admin-blogs-delete:${auth.user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id } = await params
    const idCheck = idSchema.safeParse(id)
    if (!idCheck.success) {
      return Response.json({ success: false, error: 'Invalid blog id' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('blogs')
      .delete()
      .eq('id', idCheck.data)
      .select('id')
      .maybeSingle()

    if (error) {
      logger.error('Admin blog delete error', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }
    if (!data) {
      return Response.json({ success: false, error: 'Blog not found' }, { status: 404 })
    }

    return Response.json({ success: true, data: { id: data.id } })
  } catch (error: unknown) {
    logger.error('Admin blog delete unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
