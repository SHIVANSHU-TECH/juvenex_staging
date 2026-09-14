import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const PROGRESS_PHOTO_BUCKET = 'progress-photos'
const PROGRESS_SIGNED_URL_TTL_SECONDS = 300

interface PublicProgressPhotoRow {
  id: string
  photo_url: string | null
  storage_path: string | null
  weight: number | null
  created_at: string
}

// Progress photos live in a PRIVATE bucket; raw photo_url values are not
// directly fetchable. Resolve a fresh signed URL (5-min TTL) from the stored
// object path so public photos render for a viewer without exposing a
// permanent link. Mirrors the signing in /api/patient/progress-photos.
function extractProgressStoragePath(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    const marker = '/storage/v1/object/'
    const idx = url.pathname.indexOf(marker)
    if (idx === -1) return null
    const afterObject = url.pathname.slice(idx + marker.length)
    const parts = afterObject.split('/')
    if (parts.length < 2) return null
    const [, maybeBucket, ...rest] = parts
    if (maybeBucket !== PROGRESS_PHOTO_BUCKET) return null
    return rest.join('/')
  } catch {
    return null
  }
}

async function signPublicProgressPhotos(
  supabase: ReturnType<typeof getSupabase>,
  rows: PublicProgressPhotoRow[]
): Promise<{ id: string; photo_url: string | null; weight: number | null; created_at: string }[]> {
  return Promise.all(
    rows.map(async (row) => {
      const storagePath =
        row.storage_path ||
        (row.photo_url ? extractProgressStoragePath(row.photo_url) : null)
      if (!storagePath) {
        return { id: row.id, photo_url: null, weight: row.weight, created_at: row.created_at }
      }
      const { data } = await supabase.storage
        .from(PROGRESS_PHOTO_BUCKET)
        .createSignedUrl(storagePath, PROGRESS_SIGNED_URL_TTL_SECONDS)
      return {
        id: row.id,
        photo_url: data?.signedUrl ?? null,
        weight: row.weight,
        created_at: row.created_at,
      }
    })
  )
}

interface ProfileRow {
  id: string
  name: string | null
  email: string
  avatar_url: string | null
  role: string
}

interface RecentPostRow {
  id: string
  user_id: string
  type: string
  title: string | null
  body: string
  image_url: string | null
  is_public: boolean
  likes_count: number
  comments_count: number
  created_at: string
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id: profileUserId } = await params

    // Non-UUID ids would reach postgres and surface as a 500 — treat them as
    // simply not found (same response as an unknown user, no existence leak).
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileUserId)) {
      return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const supabase = getSupabase()

    // Fetch profile (incl. organization_id for the tenant check).
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email, avatar_url, role, organization_id')
      .eq('id', profileUserId)
      .maybeSingle()

    if (profileError) {
      logger.error('Social user profile error', { error: profileError.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    // Tenant isolation: 404 for users outside the caller's organization so
    // cross-tenant identities can't be enumerated.
    if (
      !profileData ||
      (user.role !== 'super_admin' &&
        ((profileData as { organization_id: string | null }).organization_id ?? null) !==
          (user.organization_id ?? null))
    ) {
      return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const profile = profileData as ProfileRow

    // Get counts in parallel
    let postCountQuery = supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profileUserId)
      .eq('type', 'status')
    let recentPostsQuery = supabase
      .from('posts')
      .select(
        'id, user_id, type, title, body, image_url, is_public, likes_count, comments_count, created_at'
      )
      .eq('user_id', profileUserId)
      .eq('type', 'status')
      .order('created_at', { ascending: false })
      .limit(5)

    if (profileUserId !== user.id) {
      postCountQuery = postCountQuery.eq('is_public', true)
      recentPostsQuery = recentPostsQuery.eq('is_public', true)
    }

    const [
      postCountRes,
      followerCountRes,
      followingCountRes,
      followRowRes,
      recentPostsRes,
      progressPhotosRes,
    ] = await Promise.all([
      postCountQuery,
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileUserId),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profileUserId),
      supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', user.id)
        .eq('following_id', profileUserId)
        .maybeSingle(),
      recentPostsQuery,
      // Public progress photos only — the owner manages private ones in /profile.
      supabase
        .from('progress_photos')
        .select('id, photo_url, storage_path, weight, created_at')
        .eq('user_id', profileUserId)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(12),
    ])

    const recentPostRows = (recentPostsRes.data ?? []) as RecentPostRow[]
    const progressPhotos = await signPublicProgressPhotos(
      supabase,
      (progressPhotosRes.data ?? []) as PublicProgressPhotoRow[]
    )

    // Enrich recent posts so the client can render the fully interactive
    // PostCard: attach the author profile, the viewer's like state, and the
    // canonical `profiles`/`user_id` shape PostCard expects.
    const recentPostIds = recentPostRows.map((p) => p.id)
    const likedPostIds = new Set<string>()
    if (recentPostIds.length > 0) {
      const { data: likedRows } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', recentPostIds)
      for (const l of (likedRows ?? []) as { post_id: string }[]) {
        likedPostIds.add(l.post_id)
      }
    }

    const recentPosts = recentPostRows.map((p) => ({
      id: p.id,
      user_id: p.user_id,
      type: p.type,
      title: p.title,
      body: p.body,
      image_url: p.image_url,
      is_public: p.is_public,
      likes_count: p.likes_count,
      comments_count: p.comments_count,
      created_at: p.created_at,
      liked: likedPostIds.has(p.id),
      profiles: {
        id: profile.id,
        name: profile.name,
        avatar_url: profile.avatar_url,
      },
    }))

    return Response.json({
      success: true,
      data: {
        profile: {
          id: profile.id,
          name: profile.name,
          avatar_url: profile.avatar_url,
          role: profile.role,
        },
        stats: {
          postCount: postCountRes.count ?? 0,
          followerCount: followerCountRes.count ?? 0,
          followingCount: followingCountRes.count ?? 0,
        },
        isFollowing: !!followRowRes.data,
        recentPosts,
        progressPhotos,
      },
    })
  } catch (error: unknown) {
    logger.error('Social user error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
