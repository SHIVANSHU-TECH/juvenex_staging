import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// Explicit SELECT list — never use '*'. The groups table does not have
// updated_at or is_public columns (see supabase/migrations/001 and 004); only
// these columns are safe to project.
const GROUP_COLUMNS =
  'id, name, description, slug, organization_id, created_by, member_count, created_at'

const groupsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  organization_id: z.string().uuid().optional(),
})

const createGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().min(1, 'Description is required').max(1000),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must be lowercase alphanumeric with hyphens'
    ),
  organization_id: z.string().uuid().optional(),
})

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface GroupRow {
  id: string
  name: string
  description: string | null
  slug: string | null
  organization_id: string | null
  created_by: string
  created_at: string
  member_count: number | null
}

interface GroupMemberRow {
  group_id: string
  user_id: string
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = groupsQuerySchema.safeParse(searchParams)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { page, limit, organization_id: requestedOrgId } = parsed.data
    const offset = (page - 1) * limit

    // Tenant visibility:
    //  - super_admin: optional ?organization_id filter, else all orgs.
    //  - member WITH an org: their org's groups + global (null-org) groups.
    //  - member WITHOUT an org (most direct patients): global (null-org) groups
    //    ONLY — never leak another tenant's groups. Previously this returned a
    //    400 ("User has no organization"), which broke the Community → Groups
    //    tab for every org-less user.
    const isSuperAdmin = user.role === 'super_admin'
    const orgOrClause =
      !isSuperAdmin && user.organization_id
        ? `organization_id.eq.${user.organization_id},organization_id.is.null`
        : null

    const supabase = getSupabase()

    let countQuery = supabase.from('groups').select('*', { count: 'exact', head: true })
    if (isSuperAdmin) {
      if (requestedOrgId) countQuery = countQuery.eq('organization_id', requestedOrgId)
    } else if (orgOrClause) {
      countQuery = countQuery.or(orgOrClause)
    } else {
      countQuery = countQuery.is('organization_id', null)
    }
    const { count } = await countQuery
    const total = count ?? 0

    let listQuery = supabase.from('groups').select(GROUP_COLUMNS)
    if (isSuperAdmin) {
      if (requestedOrgId) listQuery = listQuery.eq('organization_id', requestedOrgId)
    } else if (orgOrClause) {
      listQuery = listQuery.or(orgOrClause)
    } else {
      listQuery = listQuery.is('organization_id', null)
    }

    const { data: groupsData, error: groupsError } = await listQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (groupsError) {
      logger.error('Groups list error', { error: groupsError.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    const groups = (groupsData ?? []) as GroupRow[]

    // Resolve accurate member counts via group_members table (the groups.member_count
    // column is eventually-consistent; prefer authoritative count).
    const groupIds = groups.map((g) => g.id)
    const memberCountById = new Map<string, number>()
    const memberGroupIds = new Set<string>()
    if (groupIds.length > 0) {
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('group_id, user_id')
        .in('group_id', groupIds)
      for (const row of (memberRows ?? []) as GroupMemberRow[]) {
        memberCountById.set(row.group_id, (memberCountById.get(row.group_id) ?? 0) + 1)
        if (row.user_id === user.id) memberGroupIds.add(row.group_id)
      }
    }

    const groupsWithCounts = groups.map((g) => ({
      ...g,
      member_count: memberCountById.get(g.id) ?? g.member_count ?? 0,
      is_member: memberGroupIds.has(g.id),
    }))

    return Response.json({
      success: true,
      data: {
        groups: groupsWithCounts,
        hasMore: offset + limit < total,
        total,
      },
    })
  } catch (error: unknown) {
    logger.error('Groups error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`groups:${user.id}`, 10, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const body = await request.json()
    const parsed = createGroupSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { name, description, slug, organization_id: requestedOrgId } = parsed.data

    // Tenant scoping for the new group (client-supplied organization_id is
    // ignored for non-admins):
    //  - super_admin: explicit ?organization_id, else their own, else global.
    //  - member WITH an org: force-scoped to that org.
    //  - member WITHOUT an org: a global (null-org) group — consistent with the
    //    GET path, so the "Create Group" button the Community tab shows to
    //    org-less users actually works instead of returning 400.
    const isSuperAdmin = user.role === 'super_admin'
    const effectiveOrgId: string | null = isSuperAdmin
      ? (requestedOrgId ?? user.organization_id ?? null)
      : (user.organization_id ?? null)

    const supabase = getSupabase()

    // Check slug uniqueness
    const { data: existingGroup } = await supabase
      .from('groups')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (existingGroup) {
      return Response.json(
        { success: false, error: 'A group with this slug already exists' },
        { status: 409 }
      )
    }

    // Create group
    const { data: inserted, error: insertError } = await supabase
      .from('groups')
      .insert({
        name,
        description,
        slug,
        organization_id: effectiveOrgId,
        created_by: user.id,
        member_count: 1,
      })
      .select(GROUP_COLUMNS)
      .single()

    if (insertError || !inserted) {
      logger.error('Groups insert error', { error: insertError?.message })
      return Response.json({ success: false, error: 'Failed to create group' }, { status: 500 })
    }

    const group = inserted as GroupRow

    // Auto-add creator as admin member (migration 005 fixed the RLS INSERT policy
    // so this now succeeds under service role + matching creator admin).
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: user.id, role: 'admin' })

    if (memberError) {
      logger.error('Groups member insert error', { error: memberError.message })
      // Group exists but membership failed — still return the group to avoid
      // a half-state that leaves orphaned groups in the DB.
    }

    return Response.json({ success: true, data: { group } }, { status: 201 })
  } catch (error: unknown) {
    logger.error('Groups error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
