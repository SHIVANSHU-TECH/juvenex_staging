import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { type PostRow, formatPost } from '@/lib/social'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { isAllowedImageUrl, IMAGE_URL_ALLOWLIST_MESSAGE } from '@/lib/url-allowlist'

const GROUP_POST_COLUMNS =
  'id, user_id, type, group_id, title, body, image_url, is_public, likes_count, comments_count, created_at, updated_at'

const postsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const createGroupPostSchema = z.object({
  title: z.string().min(1, 'Title is required for forum posts').max(200),
  body: z.string().min(1, 'Body is required').max(5000),
  image_url: z.string().url().refine(isAllowedImageUrl, IMAGE_URL_ALLOWLIST_MESSAGE).optional(),
  is_public: z.boolean().default(true),
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id: groupId } = await params

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = postsQuerySchema.safeParse(searchParams)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { page, limit } = parsed.data
    const offset = (page - 1) * limit

    const supabase = getSupabase()

    // Verify group exists and is in the requester's org. We project
    // organization_id so we can run the tenant gate. super_admin bypasses it.
    const { data: group } = await supabase
      .from('groups')
      .select('id, organization_id')
      .eq('id', groupId)
      .maybeSingle()
    if (!group) {
      return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
    }
    const isSuperAdminGet = user.role === 'super_admin'
    const groupRowGet = group as { id: string; organization_id: string | null }
    if (!isSuperAdminGet && groupRowGet.organization_id !== user.organization_id) {
      if (groupRowGet.organization_id !== null) {
        return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
      }
      const { data: membership } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!membership) {
        return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
      }
    }
    // "Group only" posts (is_public=false) are visible ONLY to group members
    // (and super_admin). Non-members who pass the tenant gate above must see
    // just the public posts — mirroring how the main feed treats group posts.
    let viewerIsMember = isSuperAdminGet
    if (!viewerIsMember) {
      const { data: viewerMembership } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle()
      viewerIsMember = Boolean(viewerMembership)
    }

    let countQuery = supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
    if (!viewerIsMember) countQuery = countQuery.eq('is_public', true)
    const { count } = await countQuery
    const total = count ?? 0

    let postsQuery = supabase
      .from('posts')
      .select(GROUP_POST_COLUMNS)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (!viewerIsMember) postsQuery = postsQuery.eq('is_public', true)
    const { data: postsData, error: postsError } = await postsQuery

    if (postsError) {
      logger.error('Group posts list error', { error: postsError.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    const raw = (postsData ?? []) as RawPost[]

    const authorIds = Array.from(new Set(raw.map((p) => p.user_id)))
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

    const rows: PostRow[] = raw.map((p) => {
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
    logger.error('Group posts error', { error: error instanceof Error ? error.message : 'Unknown error' })
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

    const rl = rateLimit(`group-posts:${user.id}`, 20, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id: groupId } = await params

    const body = await request.json()
    const parsed = createGroupPostSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    // Verify group exists and is in the requester's org. Legacy/global groups
    // can have organization_id = NULL; members may still post, but the new post
    // must be stamped with a concrete organization_id below.
    const { data: group } = await supabase
      .from('groups')
      .select('id, organization_id')
      .eq('id', groupId)
      .maybeSingle()
    if (!group) {
      return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
    }
    const isSuperAdminPost = user.role === 'super_admin'
    const groupRowPost = group as { id: string; organization_id: string | null }
    // Verify user is a member of the group
    const { data: membership } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return Response.json(
        { success: false, error: 'You must be a group member to post' },
        { status: 403 }
      )
    }

    if (!isSuperAdminPost && groupRowPost.organization_id !== user.organization_id) {
      if (groupRowPost.organization_id !== null) {
        return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
      }
      if (!user.organization_id) {
        return Response.json(
          { success: false, error: 'User has no organization' },
          { status: 400 }
        )
      }
    }

    const postOrganizationId = groupRowPost.organization_id ?? user.organization_id
    if (!postOrganizationId) {
      return Response.json(
        { success: false, error: 'Group has no organization' },
        { status: 400 }
      )
    }

    const { data: inserted, error: insertError } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        organization_id: postOrganizationId,
        type: 'forum',
        title: parsed.data.title,
        body: parsed.data.body,
        group_id: groupId,
        image_url: parsed.data.image_url ?? null,
        is_public: parsed.data.is_public,
        likes_count: 0,
        comments_count: 0,
      })
      .select(GROUP_POST_COLUMNS)
      .single()

    if (insertError || !inserted) {
      logger.error('Group post insert error', { error: insertError?.message })
      return Response.json({ success: false, error: 'Failed to create post' }, { status: 500 })
    }

    // Attach author profile
    const { data: author } = await supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .eq('id', user.id)
      .maybeSingle()

    const raw = inserted as RawPost
    const row: PostRow = {
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

    return Response.json({ success: true, data: { post: formatPost(row) } }, { status: 201 })
  } catch (error: unknown) {
    logger.error('Group posts error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
