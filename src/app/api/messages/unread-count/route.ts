import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// GET /api/messages/unread-count
// Returns { count: number } — the number of unread incoming messages for the
// current user. Used by BottomNav to render the red dot on the Profile icon.

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Generous limit because BottomNav polls this on focus/interval.
    const rl = rateLimit(`inbox-unread:${user.id}`, 240, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const supabase = createAdminClient()

    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('to_user_id', user.id)
      .is('read_at', null)

    if (error) {
      // Include code/details/hint — a prior occurrence logged an empty
      // message which made the failure undiagnosable.
      logger.error('Inbox unread-count error', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      data: { count: count ?? 0 },
    })
  } catch (error: unknown) {
    logger.error('Inbox unread-count error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
