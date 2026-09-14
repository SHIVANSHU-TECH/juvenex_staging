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

// Returns the subset of the supplied post ids that the current user has liked.
// Used by surfaces that fetch posts from a route which does not itself embed
// the viewer's like state (e.g. the group detail page, whose posts come from
// /api/groups/[id]/posts). Only the caller's own like rows are read, so this
// discloses nothing about other users or tenants.
//
// Query: ?ids=<comma-separated post ids> (max 100).
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const idsParam = request.nextUrl.searchParams.get('ids') ?? ''
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100)

    if (ids.length === 0) {
      return Response.json({ success: true, data: { likedPostIds: [] } })
    }

    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', user.id)
      .in('post_id', ids)

    if (error) {
      logger.error('Liked lookup error', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    const likedPostIds = ((data ?? []) as { post_id: string }[]).map((r) => r.post_id)

    return Response.json({ success: true, data: { likedPostIds } })
  } catch (error: unknown) {
    logger.error('Liked lookup error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
