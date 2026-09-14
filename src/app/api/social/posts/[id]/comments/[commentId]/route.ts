import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const updateCommentSchema = z.object({
  body: z.string().min(1, 'Comment body is required').max(2000),
})

const COMMENT_COLUMNS = 'id, post_id, user_id, body, created_at, updated_at, likes_count'

interface RawComment {
  id: string
  post_id: string
  user_id: string
  body: string
  created_at: string
  updated_at: string | null
  likes_count: number
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Verify the post exists AND belongs to the caller's tenant (404 otherwise so
// cross-tenant existence/content is never disclosed). Mirrors the parent
// comments route. Returns the post row (incl. user_id for delete authz) or null.
async function getTenantPost(
  supabase: ReturnType<typeof getSupabase>,
  postId: string,
  user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>
): Promise<{ id: string; user_id: string; organization_id: string | null } | null> {
  const { data: post } = await supabase
    .from('posts')
    .select('id, user_id, organization_id')
    .eq('id', postId)
    .maybeSingle()

  if (
    !post ||
    (user.role !== 'super_admin' &&
      ((post as { organization_id: string | null }).organization_id ?? null) !==
        (user.organization_id ?? null))
  ) {
    return null
  }

  return post as { id: string; user_id: string; organization_id: string | null }
}

// Edit a comment body. Author-only — enforced here in addition to the RLS
// policy, since this route uses the service-role key which bypasses RLS.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`comments-edit:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id: postId, commentId } = await params

    const body = await request.json()
    const parsed = updateCommentSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    const post = await getTenantPost(supabase, postId, user)
    if (!post) {
      return Response.json({ success: false, error: 'Post not found' }, { status: 404 })
    }

    const { data: existing } = await supabase
      .from('comments')
      .select('id, user_id, post_id')
      .eq('id', commentId)
      .eq('post_id', postId)
      .maybeSingle()

    if (!existing) {
      return Response.json({ success: false, error: 'Comment not found' }, { status: 404 })
    }

    if ((existing as { user_id: string }).user_id !== user.id) {
      return Response.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('comments')
      .update({ body: parsed.data.body, updated_at: new Date().toISOString() })
      .eq('id', commentId)
      .eq('user_id', user.id)
      .select(COMMENT_COLUMNS)
      .single()

    if (updateError || !updated) {
      logger.error('Comment update error', { error: updateError?.message })
      return Response.json({ success: false, error: 'Failed to update comment' }, { status: 500 })
    }

    const raw = updated as RawComment

    // Author profile + the viewer's own like state, for the contract shape.
    const [{ data: author }, { data: likeRow }] = await Promise.all([
      supabase.from('profiles').select('id, name, avatar_url').eq('id', raw.user_id).maybeSingle(),
      supabase
        .from('comment_likes')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('comment_id', commentId)
        .maybeSingle(),
    ])

    return Response.json({
      success: true,
      data: {
        comment: {
          id: raw.id,
          post_id: raw.post_id,
          user_id: raw.user_id,
          body: raw.body,
          created_at: raw.created_at,
          updated_at: raw.updated_at ?? null,
          likes_count: raw.likes_count ?? 0,
          liked: !!likeRow,
          profiles: {
            id: raw.user_id,
            name: (author?.name as string | null | undefined) ?? null,
            avatar_url: (author?.avatar_url as string | null | undefined) ?? null,
          },
        },
      },
    })
  } catch (error: unknown) {
    logger.error('Comment update error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// Delete a comment. Allowed for the comment author, the post owner, or a
// super_admin. Decrements the post's comments_count afterwards. comment_likes
// rows are removed via FK cascade.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`comments-delete:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id: postId, commentId } = await params

    const supabase = getSupabase()

    const post = await getTenantPost(supabase, postId, user)
    if (!post) {
      return Response.json({ success: false, error: 'Post not found' }, { status: 404 })
    }

    const { data: existing } = await supabase
      .from('comments')
      .select('id, user_id, post_id')
      .eq('id', commentId)
      .eq('post_id', postId)
      .maybeSingle()

    if (!existing) {
      return Response.json({ success: false, error: 'Comment not found' }, { status: 404 })
    }

    const isAuthor = (existing as { user_id: string }).user_id === user.id
    const isPostOwner = post.user_id === user.id
    const isSuperAdmin = user.role === 'super_admin'

    if (!isAuthor && !isPostOwner && !isSuperAdmin) {
      return Response.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
      .eq('post_id', postId)

    if (deleteError) {
      logger.error('Comment delete error', { error: deleteError.message })
      return Response.json({ success: false, error: 'Failed to delete comment' }, { status: 500 })
    }

    // Decrement comments_count atomically via RPC, with a read-then-write
    // fallback if the RPC is unavailable.
    const { error: rpcError } = await supabase.rpc('decrement_post_comments', { post_id: postId })
    if (rpcError) {
      const { data: refreshed } = await supabase
        .from('posts')
        .select('comments_count')
        .eq('id', postId)
        .single()
      const current = (refreshed?.comments_count as number | null) ?? 0
      await supabase.from('posts').update({ comments_count: Math.max(current - 1, 0) }).eq('id', postId)
    }

    return Response.json({ success: true, data: { id: commentId } })
  } catch (error: unknown) {
    logger.error('Comment delete error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
