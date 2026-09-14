import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// GET /api/messages/support
//   Resolve who "message support" should open a thread with for the current
//   user: their organization's org_admin when one exists, otherwise the
//   platform care team (super_admin). Support links deep-link to
//   /messages/<id> instead of dropping members on the empty inbox list.

interface SupportProfile {
  id: string
  name: string | null
  role: string
}

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const rl = rateLimit(`support-resolve:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const supabase = createAdminClient()

    let recipient: SupportProfile | null = null
    if (user.organization_id) {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, role')
        .eq('organization_id', user.organization_id)
        .eq('role', 'org_admin')
        .neq('id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle<SupportProfile>()
      recipient = data ?? null
    }
    if (!recipient) {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, role')
        .eq('role', 'super_admin')
        .neq('id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle<SupportProfile>()
      recipient = data ?? null
    }

    if (!recipient) {
      return Response.json(
        { success: false, error: 'No support contact configured' },
        { status: 404 }
      )
    }

    return Response.json({
      success: true,
      data: {
        id: recipient.id,
        name: recipient.name ?? 'Support',
      },
    })
  } catch (error: unknown) {
    logger.error('support resolver failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
