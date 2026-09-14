import { z } from 'zod'
import { logger } from '@/lib/logger'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

/**
 * Shared authorization helper for /api/org/[slug]/admin/* route handlers.
 *
 * Allowed callers:
 *   - profiles.role === 'super_admin' (can manage any org)
 *   - profiles.role === 'org_admin' AND profiles.organization_id === orgId
 *     (can manage only their own org)
 *
 * Returns `{ org, user }` on success, or a Response (401/403/404) to return
 * directly from the route handler on failure.
 */

export interface OrgRow {
  id: string
  name: string
  slug: string
  type: string | null
  logo_url: string | null
  primary_color: string | null
  phone: string | null
  email: string | null
  website: string | null
  created_at: string
}

// Role union is strict: anything outside this set means the auth helper or
// the underlying profile row is in an unexpected state and we must fail closed
// rather than silently coerce.
export type OrgAdminRole = 'patient' | 'org_admin' | 'super_admin'

export interface OrgAdminUser {
  id: string
  email: string
  name: string
  role: OrgAdminRole
  organization_id: string | null
}

export interface OrgAdminContext {
  org: OrgRow
  user: OrgAdminUser
}

const orgRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  type: z.string().nullable(),
  logo_url: z.string().nullable(),
  primary_color: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  created_at: z.string(),
})

const orgAdminRoleSchema = z.enum(['patient', 'org_admin', 'super_admin'])

const orgAdminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  role: orgAdminRoleSchema,
  organization_id: z.string().uuid().nullable(),
})

/**
 * @deprecated Use createAdminClient() directly.
 *
 * Backwards-compatible export — historically a thin wrapper around
 * createAdminClient. Kept so existing org-admin route handlers don't need
 * import churn, but new code should import { createAdminClient } from
 * '@/lib/supabase/admin' instead.
 */
export function getServiceSupabase() {
  return createAdminClient()
}

function isValidSlug(slug: string): boolean {
  return (
    typeof slug === 'string' &&
    slug.length >= 2 &&
    slug.length <= 100 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  )
}

/**
 * Authorize and resolve an org by slug for the caller.
 * Returns either a success context or a Response to return directly.
 */
export async function authorizeOrgAdmin(
  slug: string
): Promise<OrgAdminContext | Response> {
  if (!isValidSlug(slug)) {
    return Response.json(
      { success: false, error: 'Invalid slug' },
      { status: 400 }
    )
  }

  const user = await getAuthUser()
  if (!user) {
    return Response.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const supabase = createAdminClient()
  const { data: orgRow, error: orgError } = await supabase
    .from('organizations')
    .select(
      'id, name, slug, type, logo_url, primary_color, phone, email, website, created_at'
    )
    .eq('slug', slug)
    .maybeSingle()

  if (orgError) {
    logger.error('authorizeOrgAdmin orgs fetch error', {
      error: orgError.message,
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }

  if (!orgRow) {
    return Response.json(
      { success: false, error: 'Organization not found' },
      { status: 404 }
    )
  }

  // Validate the row shape coming back from PostgREST. If the schema drifts
  // we want to fail loudly here, not silently typecast and crash deeper in
  // a route handler.
  const orgParsed = orgRowSchema.safeParse(orgRow)
  if (!orgParsed.success) {
    logger.error('authorizeOrgAdmin org row shape invalid', {
      issues: orgParsed.error.flatten(),
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
  const org = orgParsed.data

  // The user object came from getAuthUser() which already shapes it, but its
  // `role` field is typed as `string`. Re-validate with a strict enum so that
  // any unexpected role from the DB rejects authz instead of slipping through.
  const userParsed = orgAdminUserSchema.safeParse(user)
  if (!userParsed.success) {
    logger.error('authorizeOrgAdmin user row shape invalid', {
      issues: userParsed.error.flatten(),
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
  const safeUser = userParsed.data

  const isSuperAdmin = safeUser.role === 'super_admin'
  const isOwningOrgAdmin =
    safeUser.role === 'org_admin' && safeUser.organization_id === org.id

  if (!isSuperAdmin && !isOwningOrgAdmin) {
    return Response.json(
      { success: false, error: 'Forbidden' },
      { status: 403 }
    )
  }

  return { org, user: safeUser }
}
