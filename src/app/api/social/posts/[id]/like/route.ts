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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`likes:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id: postId } = await params

    const supabase = getSupabase()

    // Verify post exists AND belongs to the caller's tenant.
    const { data: post } = await supabase
      .from('posts')
      .select('id, likes_count, organization_id, user_id')
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

    const currentLikes = ((post as { likes_count: number | null }).likes_count ?? 0)

    // Check if user already liked this post
    const { data: existingLike } = await supabase
      .from('likes')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('post_id', postId)
      .maybeSingle()

    if (existingLike) {
      // Unlike: remove like and decrement count atomically via RPC.
      await supabase
        .from('likes')
        .delete()
        .eq('user_id', user.id)
        .eq('post_id', postId)

      const { error: rpcError } = await supabase.rpc('decrement_post_likes', { post_id: postId })
      if (rpcError) {
        // Fallback: read-then-write if RPC unavailable
        const nextCount = Math.max(currentLikes - 1, 0)
        await supabase.from('posts').update({ likes_count: nextCount }).eq('id', postId)
      }

      const { data: refreshed } = await supabase
        .from('posts')
        .select('likes_count')
        .eq('id', postId)
        .single()

      return Response.json({
        success: true,
        data: { liked: false, likesCount: (refreshed?.likes_count as number | undefined) ?? Math.max(currentLikes - 1, 0) },
      })
    }

    // Like: insert like and increment count atomically via RPC.
    // Supabase has no ON CONFLICT DO NOTHING via REST, but upsert covers it.
    await supabase
      .from('likes')
      .upsert({ user_id: user.id, post_id: postId }, { onConflict: 'user_id,post_id' })

    const { error: rpcError } = await supabase.rpc('increment_post_likes', { post_id: postId })
    if (rpcError) {
      // Fallback: read-then-write if RPC unavailable
      await supabase.from('posts').update({ likes_count: currentLikes + 1 }).eq('id', postId)
    }

    // Notify the post author that someone liked their post.
    const postAuthorId = (post as { user_id?: string | null }).user_id ?? null
    if (postAuthorId) {
      await createNotification(supabase, {
        recipientId: postAuthorId,
        actorId: user.id,
        type: 'post_like',
        postId,
      })
    }

    const { data: refreshed } = await supabase
      .from('posts')
      .select('likes_count')
      .eq('id', postId)
      .single()

    return Response.json({
      success: true,
      data: { liked: true, likesCount: (refreshed?.likes_count as number | undefined) ?? currentLikes + 1 },
    })
  } catch (error: unknown) {
    logger.error('Like error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
