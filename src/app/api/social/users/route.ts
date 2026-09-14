// GET /api/social/users?search=<name>&page=1&limit=20
//
// Community "Discover" people search: look up signed-up users by name.
// Tenant-scoped — only returns members of the caller's organization (or the
// main app when the caller has no organization), matching the rest of the
// community's tenant isolation. Excludes the caller from results.

import { type NextRequest } from 'next/server'

import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

interface UserRow {
  id: string
  name: string | null
  avatar_url: string | null
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`social-users-search:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const url = new URL(request.url)
    const rawSearch = (url.searchParams.get('search') ?? '').trim().slice(0, 80)
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20))
    const offset = (page - 1) * limit

    const supabase = createAdminClient()
    let query = supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .neq('id', user.id)

    // Tenant isolation: same org, or the main app (no org) for main-app users.
    query = user.organization_id
      ? query.eq('organization_id', user.organization_id)
      : query.is('organization_id', null)

    if (rawSearch) {
      // Escape ILIKE wildcards so a literal % or _ isn't treated as a pattern.
      const escaped = rawSearch.replace(/[\\%_]/g, (c) => `\\${c}`)
      query = query.ilike('name', `%${escaped}%`)
    }

    const { data, error } = await query
      .order('name', { ascending: true })
      .range(offset, offset + limit)

    if (error) {
      logger.error('social/users search failed', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    const rows = (data ?? []) as UserRow[]
    const hasMore = rows.length > limit
    const users = rows.slice(0, limit).map((u) => ({
      id: u.id,
      name: u.name ?? 'Member',
      avatar_url: u.avatar_url,
    }))

    return Response.json({ success: true, data: { users, hasMore } })
  } catch (error: unknown) {
    logger.error('social/users: unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
