import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

// GET /api/social/users/[id]/following
//   List the users that [id] follows.

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
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
    const supabase = getSupabase()

    // Tenant isolation: only list the following of users in your own org.
    const { data: target } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', profileUserId)
      .maybeSingle()
    if (
      !target ||
      (user.role !== 'super_admin' &&
        ((target as { organization_id: string | null }).organization_id ?? null) !==
          (user.organization_id ?? null))
    ) {
      return Response.json({ success: true, data: { users: [] } })
    }

    const { data: rows, error } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', profileUserId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      logger.error('Following list error', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    const ids = (rows ?? []).map((r) => (r as { following_id: string }).following_id)
    if (ids.length === 0) {
      return Response.json({ success: true, data: { users: [] } })
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .in('id', ids)

    const byId = new Map(
      (profiles ?? []).map((p) => {
        const row = p as { id: string; name: string | null; avatar_url: string | null }
        return [row.id, row]
      })
    )
    const users = ids.map((id) => byId.get(id)).filter(Boolean)

    return Response.json({ success: true, data: { users } })
  } catch (error: unknown) {
    logger.error('Following list error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
