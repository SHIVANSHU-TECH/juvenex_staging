import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const membersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface MembershipRow {
  role: string
  user_id: string
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
    const parsed = membersQuerySchema.safeParse(searchParams)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { page, limit } = parsed.data
    const offset = (page - 1) * limit

    const supabase = getSupabase()

    // Verify group exists and is in the requester's org. Cross-tenant access
    // returns 404 (not 403) to avoid leaking the group's existence.
    // super_admin bypasses for moderation.
    const { data: group } = await supabase
      .from('groups')
      .select('id, organization_id')
      .eq('id', groupId)
      .maybeSingle()
    if (!group) {
      return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
    }
    const groupOrgRow = group as { id: string; organization_id: string | null }
    if (user.role !== 'super_admin' && groupOrgRow.organization_id !== user.organization_id) {
      return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
    }

    const { count } = await supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
    const total = count ?? 0

    const { data: membersData, error: membersError } = await supabase
      .from('group_members')
      .select('role, user_id')
      .eq('group_id', groupId)
      .range(offset, offset + limit - 1)

    if (membersError) {
      logger.error('Group members list error', { error: membersError.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    const members = (membersData ?? []) as MembershipRow[]

    // Fetch profiles for these users
    const userIds = Array.from(new Set(members.map((m) => m.user_id)))
    const profileById = new Map<string, { name: string | null; avatar_url: string | null }>()
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', userIds)
      for (const p of (profilesData ?? []) as Array<{
        id: string
        name: string | null
        avatar_url: string | null
      }>) {
        profileById.set(p.id, { name: p.name, avatar_url: p.avatar_url })
      }
    }

    const formatted = members.map(({ role, user_id }) => {
      const profile = profileById.get(user_id)
      return {
        role,
        profiles: {
          id: user_id,
          name: profile?.name ?? null,
          avatar_url: profile?.avatar_url ?? null,
        },
      }
    })

    return Response.json({
      success: true,
      data: {
        members: formatted,
        hasMore: offset + limit < total,
        total,
      },
    })
  } catch (error: unknown) {
    logger.error('Group members error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
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

    const rl = rateLimit(`group-join:${user.id}`, 20, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id: groupId } = await params

    const supabase = getSupabase()

    // Verify group exists (also fetch member_count for increment + org for
    // tenant gate)
    const { data: group } = await supabase
      .from('groups')
      .select('id, member_count, organization_id')
      .eq('id', groupId)
      .maybeSingle()
    if (!group) {
      return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
    }
    const groupRowJoin = group as { id: string; member_count: number | null; organization_id: string | null }
    if (user.role !== 'super_admin' && groupRowJoin.organization_id !== user.organization_id) {
      return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMember) {
      return Response.json(
        { success: false, error: 'Already a member of this group' },
        { status: 409 }
      )
    }

    // Join group as member
    const { error: insertError } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: user.id, role: 'member' })

    if (insertError) {
      logger.error('Group join insert error', { error: insertError.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    // Increment member_count atomically via RPC.
    const { error: joinRpcError } = await supabase.rpc('increment_group_members', { group_id: groupId })
    if (joinRpcError) {
      // Fallback: read-then-write if RPC unavailable
      const currentCount = ((group as { member_count: number | null }).member_count ?? 0)
      await supabase.from('groups').update({ member_count: currentCount + 1 }).eq('id', groupId)
    }

    return Response.json({ success: true, data: { joined: true, role: 'member' } }, { status: 201 })
  } catch (error: unknown) {
    logger.error('Group members error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`group-leave:${user.id}`, 20, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id: groupId } = await params

    const supabase = getSupabase()

    // Verify group exists and is in the requester's org. Cross-tenant access
    // returns 404 to avoid leaking existence. super_admin bypasses.
    const { data: group } = await supabase
      .from('groups')
      .select('id, member_count, organization_id')
      .eq('id', groupId)
      .maybeSingle()
    if (!group) {
      return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
    }
    const groupRowLeave = group as { id: string; member_count: number | null; organization_id: string | null }
    if (user.role !== 'super_admin' && groupRowLeave.organization_id !== user.organization_id) {
      return Response.json({ success: false, error: 'Group not found' }, { status: 404 })
    }

    // Check membership
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return Response.json(
        { success: false, error: 'You are not a member of this group' },
        { status: 404 }
      )
    }

    // Remove membership
    await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', user.id)

    // Decrement member_count atomically via RPC.
    const { error: leaveRpcError } = await supabase.rpc('decrement_group_members', { group_id: groupId })
    if (leaveRpcError) {
      // Fallback: read-then-write if RPC unavailable
      const currentCount = ((group as { member_count: number | null }).member_count ?? 0)
      await supabase.from('groups').update({ member_count: Math.max(currentCount - 1, 0) }).eq('id', groupId)
    }

    return Response.json({ success: true, data: { left: true } })
  } catch (error: unknown) {
    logger.error('Group members error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
