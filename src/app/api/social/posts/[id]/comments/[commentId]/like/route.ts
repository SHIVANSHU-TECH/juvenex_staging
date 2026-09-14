import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { createNotification } from '@/lib/notifications'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Toggle a like on a comment. Mirrors posts/[id]/like, with the post tenant
// gate applied first so cross-tenant comments can't be liked or enumerated.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`comment-likes:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id: postId, commentId } = await params

    const supabase = getSupabase()

    // Verify post exists AND belongs to the caller's tenant.
    const { data: post } = await supabase
      .from('posts')
      .select('id, organization_id')
      .eq('id', postId)
      .maybeSingle()

    if (
      !post ||
      (user.role !== 'super_admin' &&
        ((post as { organization_id: string | null }).organization_id ?? null) !==
          (user.organization_id ?? null))
    ) {
      return Response.json({ success: false, error: 'Post not found' }, { status: 404 })
    }

    // Verify the comment belongs to that post, and grab its current count.
    const { data: comment } = await supabase
      .from('comments')
      .select('id, likes_count, user_id')
      .eq('id', commentId)
      .eq('post_id', postId)
      .maybeSingle()

    if (!comment) {
      return Response.json({ success: false, error: 'Comment not found' }, { status: 404 })
    }

    const currentLikes = (comment as { likes_count: number | null }).likes_count ?? 0

    // Check if user already liked this comment
    const { data: existingLike } = await supabase
      .from('comment_likes')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('comment_id', commentId)
      .maybeSingle()

    if (existingLike) {
      // Unlike: remove like and decrement count atomically via RPC.
      await supabase
        .from('comment_likes')
        .delete()
        .eq('user_id', user.id)
        .eq('comment_id', commentId)

      const { error: rpcError } = await supabase.rpc('decrement_comment_likes', {
        comment_id: commentId,
      })
      if (rpcError) {
        const nextCount = Math.max(currentLikes - 1, 0)
        await supabase.from('comments').update({ likes_count: nextCount }).eq('id', commentId)
      }

      const { data: refreshed } = await supabase
        .from('comments')
        .select('likes_count')
        .eq('id', commentId)
        .single()

      return Response.json({
        success: true,
        data: {
          liked: false,
          likesCount: (refreshed?.likes_count as number | undefined) ?? Math.max(currentLikes - 1, 0),
        },
      })
    }

    // Like: insert like and increment count atomically via RPC.
    await supabase
      .from('comment_likes')
      .upsert({ user_id: user.id, comment_id: commentId }, { onConflict: 'user_id,comment_id' })

    const { error: rpcError } = await supabase.rpc('increment_comment_likes', {
      comment_id: commentId,
    })
    if (rpcError) {
      await supabase.from('comments').update({ likes_count: currentLikes + 1 }).eq('id', commentId)
    }

    // Notify the comment author that someone liked their comment.
    const commentAuthorId = (comment as { user_id?: string | null }).user_id ?? null
    if (commentAuthorId) {
      await createNotification(supabase, {
        recipientId: commentAuthorId,
        actorId: user.id,
        type: 'comment_like',
        postId,
        commentId,
      })
    }

    const { data: refreshed } = await supabase
      .from('comments')
      .select('likes_count')
      .eq('id', commentId)
      .single()

    return Response.json({
      success: true,
      data: {
        liked: true,
        likesCount: (refreshed?.likes_count as number | undefined) ?? currentLikes + 1,
      },
    })
  } catch (error: unknown) {
    logger.error('Comment like error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
