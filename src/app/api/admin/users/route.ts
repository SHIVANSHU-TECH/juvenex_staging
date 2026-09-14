import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import type { AdminUserListItem } from '@/lib/messaging'

// GET /api/admin/users
// Returns paginated user list for the admin's message picker.
// Auth: super_admin only.
// Ordering: users with recent messaging activity first, then alphabetical.

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(200).optional(),
  includeSelf: z.coerce.boolean().default(false),
})

interface ProfileRow {
  id: string
  email: string
  name: string | null
  role: string
  organization_id: string | null
  created_at: string
}

interface MessageStampRow {
  to_user_id: string
  from_user_id: string
  created_at: string
}

interface OrganizationRow {
  id: string
  name: string
  brand_name: string | null
}

interface SubscriptionRow {
  user_id: string
  plan: string | null
  status: string | null
  created_at: string
}

async function unwrapCount(
  promise: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  label: string
): Promise<number> {
  const { count, error } = await promise
  if (error) {
    logger.warn('admin/users: count failed', { label, error: error.message })
    return 0
  }
  return count ?? 0
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (user.role !== 'super_admin') {
      return Response.json(
        { success: false, error: 'Forbidden: super_admin role required' },
        { status: 403 }
      )
    }

    const rl = rateLimit(`admin-users:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const parsed = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    )
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const { page, limit, search, includeSelf } = parsed.data
    const offset = (page - 1) * limit

    const supabase = createAdminClient()

    // Compute the escaped search expression once. Escape the backslash FIRST
    // so re-escaping doesn't compound, then escape the three characters that
    // are syntactically meaningful inside PostgREST .or() / ilike payloads
    // (`%`, `_`, `,`). Both count and list queries reuse this string.
    const escapedSearch = search
      ? search.replace(/[\\%_,]/g, (c) => `\\${c}`)
      : null

    let countQuery = supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
    if (!includeSelf) countQuery = countQuery.neq('id', user.id)
    if (escapedSearch !== null) {
      // SAFETY: escapedSearch has had `%`, `_`, and `,` backslash-escaped.
      // The string is never trusted to be a UUID — it is a name/email LIKE
      // pattern only. Two .or() calls below depend on this same escaping.
      countQuery = countQuery.or(
        `name.ilike.%${escapedSearch}%,email.ilike.%${escapedSearch}%`
      )
    }
    const { count } = await countQuery
    const total = count ?? 0

    let listQuery = supabase
      .from('profiles')
      .select('id, email, name, role, organization_id, created_at')
    if (!includeSelf) listQuery = listQuery.neq('id', user.id)
    if (escapedSearch !== null) {
      // SAFETY: see countQuery above. Reuses the same escaped value.
      listQuery = listQuery.or(
        `name.ilike.%${escapedSearch}%,email.ilike.%${escapedSearch}%`
      )
    }

    const { data: profilesData, error: listError } = await listQuery
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1)

    if (listError) {
      logger.error('Admin users list error', { error: listError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const profiles = (profilesData ?? []) as ProfileRow[]
    const userIds = profiles.map((p) => p.id)
    const orgIds = Array.from(
      new Set(
        profiles
          .map((p) => p.organization_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    )

    // Defense-in-depth: even though `userIds` originate from typed-uuid
    // `profiles.id` columns, validate every id with z.string().uuid() before
    // we interpolate them into the .or() filter string below. If any value
    // ever drifts from uuid (schema change, view, RPC), drop it with a warn
    // instead of letting an attacker-influenced string land in the predicate.
    const validatedUserIds: string[] = []
    let droppedNonUuid = 0
    for (const uid of userIds) {
      if (z.string().uuid().safeParse(uid).success) {
        validatedUserIds.push(uid)
      } else {
        droppedNonUuid += 1
      }
    }
    if (droppedNonUuid > 0) {
      logger.warn('admin/users: dropped non-uuid user ids before .or() build', {
        droppedNonUuid,
        validCount: validatedUserIds.length,
      })
    }

    // Fetch the most recent message timestamp between the admin and each
    // listed user (in either direction) to surface active conversations.
    const lastMessageByUser = new Map<string, string>()
    if (validatedUserIds.length > 0) {
      // SAFETY of the .or() interpolation below:
      //  - `user.id` is the auth principal, sourced from a JWT payload + DB
      //    profiles.id round-trip in getAuthUser(); guaranteed to be a UUID.
      //  - `validatedUserIds` has been Zod-validated as uuid above. They
      //    cannot contain commas or PostgREST control characters.
      const { data: msgsData } = await supabase
        .from('messages')
        .select('to_user_id, from_user_id, created_at')
        .or(
          `and(from_user_id.eq.${user.id},to_user_id.in.(${validatedUserIds.join(',')})),` +
            `and(to_user_id.eq.${user.id},from_user_id.in.(${validatedUserIds.join(',')}))`
        )
        .order('created_at', { ascending: false })

      for (const row of (msgsData ?? []) as MessageStampRow[]) {
        const otherId =
          row.from_user_id === user.id ? row.to_user_id : row.from_user_id
        if (!lastMessageByUser.has(otherId)) {
          lastMessageByUser.set(otherId, row.created_at)
        }
      }
    }

    const orgById = new Map<string, OrganizationRow>()
    if (orgIds.length > 0) {
      const { data: orgsData, error: orgsError } = await supabase
        .from('organizations')
        .select('id, name, brand_name')
        .in('id', orgIds)

      if (orgsError) {
        logger.warn('admin/users: organization lookup failed', {
          error: orgsError.message,
        })
      } else {
        for (const org of (orgsData ?? []) as OrganizationRow[]) {
          orgById.set(org.id, org)
        }
      }
    }

    const subscriptionByUser = new Map<string, SubscriptionRow>()
    if (validatedUserIds.length > 0) {
      const { data: subsData, error: subsError } = await supabase
        .from('subscriptions')
        .select('user_id, plan, status, created_at')
        .in('user_id', validatedUserIds)
        .order('created_at', { ascending: false })

      if (subsError) {
        logger.warn('admin/users: subscription lookup failed', {
          error: subsError.message,
        })
      } else {
        for (const sub of (subsData ?? []) as SubscriptionRow[]) {
          if (!subscriptionByUser.has(sub.user_id)) {
            subscriptionByUser.set(sub.user_id, sub)
          }
        }
      }
    }

    const users = profiles.map((p) => {
      const org = p.organization_id ? orgById.get(p.organization_id) : null
      const subscription = subscriptionByUser.get(p.id) ?? null
      return {
        id: p.id,
        email: p.email,
        full_name: p.name,
        last_message_at: lastMessageByUser.get(p.id) ?? null,
        role: p.role,
        organization_id: p.organization_id,
        organization_name: org?.brand_name ?? org?.name ?? null,
        created_at: p.created_at,
        subscription_plan: subscription?.plan ?? null,
        subscription_status: subscription?.status ?? null,
      } satisfies AdminUserListItem & Record<string, unknown>
    })

    // Sort: users with messaging activity first (most recent first), then
    // remaining users keep their alphabetical (name) order.
    users.sort((a, b) => {
      if (a.last_message_at && b.last_message_at) {
        return b.last_message_at.localeCompare(a.last_message_at)
      }
      if (a.last_message_at) return -1
      if (b.last_message_at) return 1
      return (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email)
    })

    const [allUsersCount, patientCount, orgAdminCount, superAdminCount] = await Promise.all([
      unwrapCount(supabase.from('profiles').select('*', { count: 'exact', head: true }), 'profiles_total'),
      unwrapCount(supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'patient'), 'profiles_patient'),
      unwrapCount(supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'org_admin'), 'profiles_org_admin'),
      unwrapCount(supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'super_admin'), 'profiles_super_admin'),
    ])

    return Response.json({
      success: true,
      data: {
        users,
        hasMore: offset + limit < total,
        total,
        summary: {
          totalUsers: allUsersCount,
          patients: patientCount,
          orgAdmins: orgAdminCount,
          superAdmins: superAdminCount,
        },
      },
      meta: { total, page, limit },
    })
  } catch (error: unknown) {
    logger.error('Admin users error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
