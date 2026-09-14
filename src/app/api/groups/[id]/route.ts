import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

// Explicit SELECT list — never use '*'. The groups table does not have
// updated_at or is_public columns (see supabase/migrations/001 and 004); only
// these columns are safe to project.
const GROUP_COLUMNS =
  'id, name, description, slug, organization_id, created_by, member_count, created_at'

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

    const { id: groupId } = await params

    const supabase = getSupabase()

    // Fetch group details
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select(GROUP_COLUMNS)
      .eq('id', groupId)
      .maybeSingle()

    if (groupError) {
      logger.error('Group fetch error', { error: groupError.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    if (!group) {
      return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
    }

    // Tenant gate. If the group does not belong to the user's organization,
    // return 404 (not 403) so cross-tenant existence is not leaked.
    // super_admin bypasses this check for moderation.
    const isSuperAdmin = user.role === 'super_admin'
    const groupRow = group as { organization_id: string | null }
    if (!isSuperAdmin && groupRow.organization_id !== user.organization_id) {
      return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
    }

    // Authoritative member count
    const { count: memberCount } = await supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)

    const groupWithCount = { ...group, member_count: memberCount ?? 0 }

    // Check if current user is a member
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()

    return Response.json({
      success: true,
      data: {
        group: groupWithCount,
        isMember: !!membership,
        memberRole: (membership?.role as string | undefined) ?? null,
      },
    })
  } catch (error: unknown) {
    logger.error('Group error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
