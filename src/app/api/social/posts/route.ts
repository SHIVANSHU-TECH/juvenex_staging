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

const createPostSchema = z
  .object({
    body: z.string().min(1, 'Body is required').max(5000),
    type: z.enum(['status', 'forum']),
    title: z.string().max(200).optional(),
    group_id: z.string().uuid().optional(),
    image_url: z.string().url().refine(isAllowedImageUrl, IMAGE_URL_ALLOWLIST_MESSAGE).optional(),
    // DEFAULT PRIVATE — see migration 010_community_features.sql.
    is_public: z.boolean().default(false),
  })
  .refine(
    (data) => data.type !== 'forum' || (data.title && data.title.length > 0),
    { message: 'Title is required for forum posts', path: ['title'] }
  )

const postsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  userId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
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

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`social-posts:${user.id}`, 20, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const body = await request.json()
    const parsed = createPostSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { type, title, body: postBody, group_id, image_url, is_public } = parsed.data

    const supabase = getSupabase()

    // Tenant gate: every post must be scoped to an organization. If the user's
    // profile lacks an organization_id (e.g. registered before the tenant-
    // scoping migration), fall back to the default org rather than hard-failing.
    // This is symmetric with the fallback applied at registration time.
    let effectiveOrgId: string | null = user.organization_id
    if (!effectiveOrgId) {
      const envId = process.env.DEFAULT_ORGANIZATION_ID
      if (envId && envId.length > 0) {
        effectiveOrgId = envId
      } else {
        const { data: firstOrg } = await supabase
          .from('organizations')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        effectiveOrgId = (firstOrg?.id as string | undefined) ?? null
      }

      if (!effectiveOrgId) {
        return Response.json(
          { success: false, error: 'No organization configured — contact support' },
          { status: 400 }
        )
      }
    }

    // If group_id provided, verify user is a member
    if (group_id) {
      const { data: membership } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', group_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!membership) {
        return Response.json(
          { success: false, error: 'You must be a group member to post' },
          { status: 403 }
        )
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        organization_id: effectiveOrgId,
        type,
        title: title ?? null,
        body: postBody,
        group_id: group_id ?? null,
        image_url: image_url ?? null,
        is_public,
        likes_count: 0,
        comments_count: 0,
      })
      .select(POST_COLUMNS)
      .single()

    if (insertError || !inserted) {
      logger.error('Social posts insert error', { error: insertError?.message })
      return Response.json({ success: false, error: 'Failed to create post' }, { status: 500 })
    }

    const row = await toPostRow(supabase, inserted as RawPost)
    return Response.json({ success: true, data: { post: formatPost(row) } }, { status: 201 })
  } catch (error: unknown) {
    logger.error('Social posts error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = postsQuerySchema.safeParse(searchParams)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { page, limit, userId, groupId } = parsed.data
    const offset = (page - 1) * limit

    const supabase = getSupabase()

    // Visibility rule: when the requester asks for another user's posts,
    // only public posts are visible. When asking for their own posts, show
    // everything they own regardless of is_public. Also always include the
    // requester's own posts so a feed query with no userId filter still
    // returns them.
    const isOwnProfileQuery = !userId || userId === user.id

    // Count
    let countQuery = supabase.from('posts').select('*', { count: 'exact', head: true })
    if (userId) countQuery = countQuery.eq('user_id', userId)
    if (groupId) countQuery = countQuery.eq('group_id', groupId)
    if (!isOwnProfileQuery) {
      countQuery = countQuery.or(`is_public.eq.true,user_id.eq.${user.id}`)
    }
    const { count } = await countQuery
    const total = count ?? 0

    // List
    let listQuery = supabase.from('posts').select(POST_COLUMNS)
    if (userId) listQuery = listQuery.eq('user_id', userId)
    if (groupId) listQuery = listQuery.eq('group_id', groupId)
    if (!isOwnProfileQuery) {
      listQuery = listQuery.or(`is_public.eq.true,user_id.eq.${user.id}`)
    }
    const { data: postsData, error: listError } = await listQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (listError) {
      logger.error('Social posts list error', { error: listError.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    const rawPosts = (postsData ?? []) as RawPost[]

    // Fetch author profiles in one call
    const authorIds = Array.from(new Set(rawPosts.map((p) => p.user_id)))
    const profileById = new Map<string, { name: string | null; avatar_url: string | null }>()
    if (authorIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', authorIds)
      for (const p of (profilesData ?? []) as Array<{
        id: string
        name: string | null
        avatar_url: string | null
      }>) {
        profileById.set(p.id, { name: p.name, avatar_url: p.avatar_url })
      }
    }

    const rows: PostRow[] = rawPosts.map((p) => {
      const author = profileById.get(p.user_id)
      return {
        id: p.id,
        user_id: p.user_id,
        type: p.type,
        group_id: p.group_id,
        title: p.title,
        body: p.body,
        image_url: p.image_url,
        is_public: p.is_public,
        likes_count: p.likes_count,
        comments_count: p.comments_count,
        created_at: p.created_at,
        updated_at: p.updated_at ?? p.created_at,
        author_id: p.user_id,
        author_name: author?.name ?? null,
        author_avatar_url: author?.avatar_url ?? null,
      }
    })

    return Response.json({
      success: true,
      data: {
        posts: rows.map(formatPost),
        hasMore: offset + limit < total,
        total,
      },
    })
  } catch (error: unknown) {
    logger.error('Social posts error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
