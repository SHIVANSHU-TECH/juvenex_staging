import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

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

    const rl = rateLimit(`follow:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id: targetUserId } = await params

    // Cannot follow yourself
    if (user.id === targetUserId) {
      return Response.json(
        { success: false, error: 'You cannot follow yourself' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    // Verify target user exists AND is in the caller's tenant.
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('id, organization_id')
      .eq('id', targetUserId)
      .maybeSingle()

    if (
      !targetUser ||
      (user.role !== 'super_admin' &&
        ((targetUser as { organization_id: string | null }).organization_id ?? null) !==
          (user.organization_id ?? null))
    ) {
      return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Check if already following
    const { data: existingFollow } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', user.id)
      .eq('following_id', targetUserId)
      .maybeSingle()

    if (existingFollow) {
      // Unfollow
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId)

      return Response.json({ success: true, data: { following: false } })
    }

    // Follow (upsert covers the ON CONFLICT DO NOTHING semantics)
    await supabase
      .from('follows')
      .upsert(
        { follower_id: user.id, following_id: targetUserId },
        { onConflict: 'follower_id,following_id' }
      )

    return Response.json({ success: true, data: { following: true } })
  } catch (error: unknown) {
    logger.error('Follow error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
