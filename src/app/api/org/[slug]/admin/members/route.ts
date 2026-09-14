import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAdmin, getServiceSupabase } from '@/lib/org-admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// GET /api/org/[slug]/admin/members
// Paginated list of profiles belonging to this organization.

const querySchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export interface OrgMember {
  id: string
  name: string | null
  email: string
  role: string
  created_at: string
  banned_from_org_at: string | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx = await authorizeOrgAdmin(slug)
    if (ctx instanceof Response) return ctx
    const { org, user } = ctx

    const rl = rateLimit(`org-admin-members:${user.id}:${org.id}`, 60, 60_000)
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

    const { search, page, limit } = parsed.data
    const offset = (page - 1) * limit

    // Escape once at top of handler — both count and list queries reuse this
    // string. Backslash is escaped FIRST so re-escaping doesn't compound;
    // then `%`, `_`, and `,` (the PostgREST ilike/.or() control chars).
    const escapedSearch = search
      ? search.replace(/[\\%_,]/g, (c) => `\\${c}`)
      : null

    const supabase = getServiceSupabase()

    let countQuery = supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id)
    if (escapedSearch !== null) {
      countQuery = countQuery.or(
        `name.ilike.%${escapedSearch}%,email.ilike.%${escapedSearch}%`
      )
    }
    const { count } = await countQuery
    const total = count ?? 0

    let listQuery = supabase
      .from('profiles')
      .select('id, name, email, role, created_at, banned_from_org_at')
      .eq('organization_id', org.id)
    if (escapedSearch !== null) {
      listQuery = listQuery.or(
        `name.ilike.%${escapedSearch}%,email.ilike.%${escapedSearch}%`
      )
    }

    const { data, error: listError } = await listQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (listError) {
      logger.error('org-admin members list error', {
        error: listError.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const members = ((data ?? []) as OrgMember[]).map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      created_at: m.created_at,
      banned_from_org_at: m.banned_from_org_at,
    }))

    return Response.json({
      success: true,
      data: {
        members,
        hasMore: offset + limit < total,
        total,
      },
      meta: { total, page, limit },
    })
  } catch (error: unknown) {
    logger.error('org-admin members error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
