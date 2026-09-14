import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { createNotification } from '@/lib/notifications'

const commentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const createCommentSchema = z.object({
  body: z.string().min(1, 'Comment body is required').max(2000),
})

interface CommentRow {
  id: string
  post_id: string
  user_id: string
  body: string
  created_at: string
  updated_at: string | null
  likes_count: number
  liked: boolean
  author_id: string
  author_name: string | null
  author_avatar_url: string | null
}

interface RawComment {
  id: string
  post_id: string
  user_id: string
  body: string
  created_at: string
  updated_at: string | null
  likes_count: number
}

const COMMENT_COLUMNS = 'id, post_id, user_id, body, created_at, updated_at, likes_count'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function formatComment(row: CommentRow) {
  const { author_id, author_name, author_avatar_url, ...comment } = row
  return {
    ...comment,
    profiles: {
      id: author_id,
      name: author_name,
      avatar_url: author_avatar_url,
    },
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id: postId } = await params

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = commentsQuerySchema.safeParse(searchParams)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { page, limit } = parsed.data
    const offset = (page - 1) * limit

    const supabase = getSupabase()

    // Verify post exists AND belongs to the caller's tenant (404 otherwise so
    // cross-tenant existence/content is never disclosed).
    const { data: post } = await supabase
      .from('posts')
      .select('id, organization_id')
      .eq('id', postId)
      .maybeSingle()

    if (
      !post ||
      (user.role !== 'super_admin' &&
        (post.organization_id ?? null) !== (user.organization_id ?? null))
    ) {
      return Response.json({ success: false, error: 'Post not found' }, { status: 404 })
    }

    const { count } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)
    const total = count ?? 0

    const { data: commentsData, error: commentsError } = await supabase
      .from('comments')
      .select(COMMENT_COLUMNS)
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)

    if (commentsError) {
      logger.error('Comments list error', { error: commentsError.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    const raw = (commentsData ?? []) as RawComment[]

    const authorIds = Array.from(new Set(raw.map((c) => c.user_id)))
    const commentIds = raw.map((c) => c.id)

    // Author profiles and the viewer's comment-likes are independent — fetch
    // both concurrently.
    const [profilesData, likedData] = await Promise.all([
      authorIds.length > 0
        ? supabase
            .from('profiles')
            .select('id, name, avatar_url')
            .in('id', authorIds)
            .then(
              (r) =>
                (r.data ?? []) as Array<{
                  id: string
                  name: string | null
                  avatar_url: string | null
                }>
            )
        : Promise.resolve<Array<{ id: string; name: string | null; avatar_url: string | null }>>(
            []
          ),
      commentIds.length > 0
        ? supabase
            .from('comment_likes')
            .select('comment_id')
            .eq('user_id', user.id)
            .in('comment_id', commentIds)
            .then((r) => (r.data ?? []) as { comment_id: string }[])
        : Promise.resolve<{ comment_id: string }[]>([]),
    ])

    const profileById = new Map<string, { name: string | null; avatar_url: string | null }>()
    for (const p of profilesData) {
      profileById.set(p.id, { name: p.name, avatar_url: p.avatar_url })
    }
    const likedCommentIds = new Set(likedData.map((l) => l.comment_id))

    const comments: CommentRow[] = raw.map((c) => {
      const author = profileById.get(c.user_id)
      return {
        id: c.id,
        post_id: c.post_id,
        user_id: c.user_id,
        body: c.body,
        created_at: c.created_at,
        updated_at: c.updated_at ?? null,
        likes_count: c.likes_count ?? 0,
        liked: likedCommentIds.has(c.id),
        author_id: c.user_id,
        author_name: author?.name ?? null,
        author_avatar_url: author?.avatar_url ?? null,
      }
    })

    return Response.json({
      success: true,
      data: {
        comments: comments.map(formatComment),
        hasMore: offset + limit < total,
        total,
      },
    })
  } catch (error: unknown) {
    logger.error('Comments error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`comments:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id: postId } = await params

    const body = await request.json()
    const parsed = createCommentSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    // Verify post exists, belongs to the caller's tenant, and fetch
    // comments_count for the increment.
    const { data: post } = await supabase
      .from('posts')
      .select('id, comments_count, organization_id, user_id')
      .eq('id', postId)
      .maybeSingle()

    if (
      !post ||
      (user.role !== 'super_admin' &&
        (post.organization_id ?? null) !== (user.organization_id ?? null))
    ) {
      return Response.json({ success: false, error: 'Post not found' }, { status: 404 })
    }

    // Insert comment
    const { data: inserted, error: insertError } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: user.id,
        body: parsed.data.body,
      })
      .select(COMMENT_COLUMNS)
      .single()

    if (insertError || !inserted) {
      logger.error('Comments insert error', { error: insertError?.message })
      return Response.json({ success: false, error: 'Failed to create comment' }, { status: 500 })
    }

    // Increment comments_count atomically via RPC.
    const { error: rpcError } = await supabase.rpc('increment_post_comments', { post_id: postId })
    if (rpcError) {
      // Fallback: read-then-write if RPC unavailable
      const nextCount =
        ((post as { comments_count: number | null }).comments_count ?? 0) + 1
      await supabase.from('posts').update({ comments_count: nextCount }).eq('id', postId)
    }

    // Notify the post author that someone commented on their post.
    const postAuthorId = (post as { user_id?: string | null }).user_id ?? null
    if (postAuthorId) {
      await createNotification(supabase, {
        recipientId: postAuthorId,
        actorId: user.id,
        type: 'post_comment',
        postId,
        commentId: (inserted as { id: string }).id,
      })
    }

    // Fetch author profile
    const { data: author } = await supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .eq('id', user.id)
      .maybeSingle()

    const raw = inserted as RawComment
    const row: CommentRow = {
      id: raw.id,
      post_id: raw.post_id,
      user_id: raw.user_id,
      body: raw.body,
      created_at: raw.created_at,
      updated_at: raw.updated_at ?? null,
      likes_count: raw.likes_count ?? 0,
      liked: false,
      author_id: raw.user_id,
      author_name: (author?.name as string | null | undefined) ?? null,
      author_avatar_url: (author?.avatar_url as string | null | undefined) ?? null,
    }

    return Response.json({ success: true, data: { comment: formatComment(row) } }, { status: 201 })
  } catch (error: unknown) {
    logger.error('Comments error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
