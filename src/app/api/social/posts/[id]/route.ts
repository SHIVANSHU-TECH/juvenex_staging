import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { type PostRow, formatPost } from '@/lib/social'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { isAllowedImageUrl, IMAGE_URL_ALLOWLIST_MESSAGE } from '@/lib/url-allowlist'

const POST_COLUMNS =
  'id, user_id, type, group_id, title, body, image_url, is_public, likes_count, comments_count, created_at, updated_at'

const updatePostSchema = z
  .object({
    body: z.string().min(1, 'Body is required').max(5000).optional(),
    title: z.string().max(200).nullable().optional(),
    image_url: z
      .string()
      .url()
      .refine(isAllowedImageUrl, IMAGE_URL_ALLOWLIST_MESSAGE)
      .nullable()
      .optional(),
    is_public: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields to update',
  })

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface RawPost {
  id: string
  user_id: string
  type: string
  group_id: string | null
  title: string | null
  body: string
  image_url: string | null
  is_public: boolean
  likes_count: number
  comments_count: number
  created_at: string
  updated_at: string | null
}

async function toPostRow(
  supabase: ReturnType<typeof getSupabase>,
  raw: RawPost
): Promise<PostRow> {
  const { data: author } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .eq('id', raw.user_id)
    .maybeSingle()

  return {
    id: raw.id,
    user_id: raw.user_id,
    type: raw.type,
    group_id: raw.group_id,
    title: raw.title,
    body: raw.body,
    image_url: raw.image_url,
    is_public: raw.is_public,
    likes_count: raw.likes_count,
    comments_count: raw.comments_count,
    created_at: raw.created_at,
    updated_at: raw.updated_at ?? raw.created_at,
    author_id: raw.user_id,
    author_name: (author?.name as string | null | undefined) ?? null,
    author_avatar_url: (author?.avatar_url as string | null | undefined) ?? null,
  }
}

// Edit a post. Owner-only — enforced here in addition to the RLS policy
// ("Users can manage own posts") for defence in depth, since this route uses
// the service-role key which bypasses RLS.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`social-posts-edit:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id: postId } = await params

    const body = await request.json()
    const parsed = updatePostSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    const { data: existing } = await supabase
      .from('posts')
      .select('id, user_id, type, title')
      .eq('id', postId)
      .maybeSingle()

    if (!existing) {
      return Response.json({ success: false, error: 'Post not found' }, { status: 404 })
    }

    if ((existing as { user_id: string }).user_id !== user.id) {
      return Response.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Forum posts must keep a non-empty title.
    const updates = parsed.data
    if (
      (existing as { type: string }).type === 'forum' &&
      'title' in updates &&
      (!updates.title || updates.title.trim().length === 0)
    ) {
      return Response.json(
        { success: false, error: 'Title is required for forum posts' },
        { status: 400 }
      )
    }

    const { data: updated, error: updateError } = await supabase
      .from('posts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('user_id', user.id)
      .select(POST_COLUMNS)
      .single()

    if (updateError || !updated) {
      logger.error('Social post update error', { error: updateError?.message })
      return Response.json({ success: false, error: 'Failed to update post' }, { status: 500 })
    }

    const row = await toPostRow(supabase, updated as RawPost)
    return Response.json({ success: true, data: { post: formatPost(row) } })
  } catch (error: unknown) {
    logger.error('Social post update error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// Delete a post. Owner-only. Comments and likes are removed via FK cascade.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`social-posts-delete:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id: postId } = await params

    const supabase = getSupabase()

    const { data: existing } = await supabase
      .from('posts')
      .select('id, user_id')
      .eq('id', postId)
      .maybeSingle()

    if (!existing) {
      return Response.json({ success: false, error: 'Post not found' }, { status: 404 })
    }

    if ((existing as { user_id: string }).user_id !== user.id) {
      return Response.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', user.id)

    if (deleteError) {
      logger.error('Social post delete error', { error: deleteError.message })
      return Response.json({ success: false, error: 'Failed to delete post' }, { status: 500 })
    }

    return Response.json({ success: true, data: { id: postId } })
  } catch (error: unknown) {
    logger.error('Social post delete error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
