import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { type PostRow, formatPost } from '@/lib/social'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const POST_COLUMNS =
  'id, user_id, type, group_id, title, body, image_url, is_public, likes_count, comments_count, created_at, updated_at'

const feedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(['all', 'status', 'forum']).default('all'),
  // scope=feed     → the user's own posts + posts from people they follow +
  //                  posts in groups they are a member of.
  // scope=discover → PUBLIC posts from OTHER users (excludes the caller's own).
  scope: z.enum(['feed', 'discover']).default('feed'),
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

interface ProfileLite {
  id: string
  name: string | null
  avatar_url: string | null
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`feed:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = feedQuerySchema.safeParse(searchParams)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { page, limit, type, scope } = parsed.data
    const offset = (page - 1) * limit

    // Tenant gate. Non-super_admin users MUST be scoped to an organization so
    // the feed does not leak cross-tenant data. super_admin can see all orgs
    // for moderation.
    //
    // If the profile's organization_id is null (e.g. a user registered before
    // the community tenant-scoping migration, or one whose profile upsert lost
    // a race with the auth trigger), we fall back to the default organization
    // (DEFAULT_ORGANIZATION_ID env var, or oldest org row). This matches the
    // same fallback used at registration time so the behavior is consistent.
    const isSuperAdmin = user.role === 'super_admin'

    const supabase = getSupabase()

    let effectiveOrgId: string | null = user.organization_id
    if (!isSuperAdmin && !effectiveOrgId) {
      // Attempt to resolve the default org rather than hard-failing.
      // If no org exists at all, return an empty feed (no posts).
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
        // No organizations exist; return empty feed rather than an error.
        return Response.json({ success: true, data: { posts: [], hasMore: false, total: 0 } })
      }
    }

    // Build the visibility OR-filter according to the requested scope.
    //
    //   feed     → own posts + followed users' posts + posts in groups the
    //              caller is a member of.
    //   discover → PUBLIC posts from OTHER users.
    //
    // The org gate is applied separately via .eq() so it always AND-combines
    // with the visibility filter, preventing cross-tenant leakage.
    let orFilter: string | null = null

    if (scope === 'feed') {
      // Users the caller follows (+ self).
      const { data: followsData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
      const followedIds = (followsData ?? []).map((f: { following_id: string }) => f.following_id)
      const allIds = [user.id, ...followedIds]

      // Groups the caller is a member of → include those groups' posts.
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id)
      const memberGroupIds = (memberRows ?? []).map((m: { group_id: string }) => m.group_id)

      const orParts = [`user_id.in.(${allIds.join(',')})`]
      if (memberGroupIds.length > 0) {
        orParts.push(`group_id.in.(${memberGroupIds.join(',')})`)
      }
      orFilter = orParts.join(',')
    }

    // Count query
    let countQuery = supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
    if (type !== 'all') countQuery = countQuery.eq('type', type)
    if (!isSuperAdmin && effectiveOrgId) {
      countQuery = countQuery.eq('organization_id', effectiveOrgId)
    }
    if (scope === 'discover') {
      countQuery = countQuery.eq('is_public', true).neq('user_id', user.id)
    } else if (orFilter) {
      countQuery = countQuery.or(orFilter)
    }

    // List query
    let listQuery = supabase
      .from('posts')
      .select(POST_COLUMNS)
    if (type !== 'all') listQuery = listQuery.eq('type', type)
    if (!isSuperAdmin && effectiveOrgId) {
      listQuery = listQuery.eq('organization_id', effectiveOrgId)
    }
    if (scope === 'discover') {
      listQuery = listQuery.eq('is_public', true).neq('user_id', user.id)
    } else if (orFilter) {
      listQuery = listQuery.or(orFilter)
    }
    listQuery = listQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Count and list are independent — run concurrently to cut feed latency.
    const [countResult, listResult] = await Promise.all([countQuery, listQuery])
    const total = countResult.count ?? 0
    const { data: postsData, error: postsError } = listResult
    if (postsError) {
      logger.error('Feed list error', { error: postsError.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    const rawPosts = (postsData ?? []) as RawPost[]

    // Author profiles and the viewer's likes are independent of each other —
    // fetch both concurrently to cut latency.
    const authorIds = Array.from(new Set(rawPosts.map((p) => p.user_id)))
    const postIds = rawPosts.map((p) => p.id)

    const [profilesData, likesData] = await Promise.all([
      authorIds.length > 0
        ? supabase.from('profiles').select('id, name, avatar_url').in('id', authorIds)
            .then((r) => (r.data ?? []) as ProfileLite[])
        : Promise.resolve<ProfileLite[]>([]),
      postIds.length > 0
        ? supabase.from('likes').select('post_id').eq('user_id', user.id).in('post_id', postIds)
            .then((r) => (r.data ?? []) as { post_id: string }[])
        : Promise.resolve<{ post_id: string }[]>([]),
    ])

    const profileById = new Map(profilesData.map((p) => [p.id, p]))
    const likedPostIds = new Set(likesData.map((l) => l.post_id))

    const enrichedPosts = rawPosts.map((p) => {
      const author = profileById.get(p.user_id)
      const row: PostRow = {
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
      return {
        ...formatPost(row),
        liked: likedPostIds.has(p.id),
      }
    })

    return Response.json({
      success: true,
      data: {
        posts: enrichedPosts,
        hasMore: offset + limit < total,
        total,
      },
    })
  } catch (error: unknown) {
    logger.error('Feed error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
