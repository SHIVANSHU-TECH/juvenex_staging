import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { isAllowedImageUrl, IMAGE_URL_ALLOWLIST_MESSAGE } from '@/lib/url-allowlist'
import {
  generateSecurePassword,
  hashPasswordForLogReference,
  provisionOrgAdmin,
  ProvisioningError,
} from '@/lib/org-admin-provision'

const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must be lowercase alphanumeric with hyphens only'
    ),
  type: z.enum(['clinic', 'pharmacy', 'wellness_center', 'enterprise']),
  logo_url: z.string().url().refine(isAllowedImageUrl, IMAGE_URL_ALLOWLIST_MESSAGE).optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color')
    .optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  // Initial org_admin user provisioning fields. The super_admin form on the
  // admin tab now creates the auth user + profile alongside the org in one
  // request. Email is required; first/last name and password are optional
  // (an unguessable 16-char password is auto-generated when omitted).
  adminEmail: z.string().email('Invalid admin email'),
  adminFirstName: z.string().max(100).optional(),
  adminLastName: z.string().max(100).optional(),
  adminPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128)
    .optional(),
})

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

// GET /api/organizations - List organizations (public endpoint for white-label lookup)
export async function GET(request: NextRequest) {
  try {
    // Public endpoint: rate limit by IP to prevent abuse (security audit).
    const ip = getClientIp(request)
    const rl = rateLimit(`orgs-list:${ip}`, 60, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    // Admin-only: this listing exposes per-tenant integration ids
    // (prescriberx_client_id), contact details, referral codes and member
    // counts. The only consumers are the super-admin UI surfaces. Tenant
    // branding for white-label lookup goes through /api/organizations/slug/[slug]
    // and /referral/[code], which return only safe public columns.
    const authUser = await getAuthUser()
    if (!authUser || authUser.role !== 'super_admin') {
      return Response.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10),
      100
    )
    const offset = parseInt(
      request.nextUrl.searchParams.get('offset') ?? '0',
      10
    )
    const typeFilter = request.nextUrl.searchParams.get('type')

    const supabase = getSupabase()

    let countQuery = supabase
      .from('organizations')
      .select('*', { count: 'exact', head: true })
    if (typeFilter) countQuery = countQuery.eq('type', typeFilter)
    const { count } = await countQuery
    const total = count ?? 0

    let listQuery = supabase
      .from('organizations')
      .select(
        'id, name, slug, type, logo_url, primary_color, phone, email, referral_code, brand_name, brand_primary_color, brand_logo_url, prescriberx_client_id, created_at'
      )
    if (typeFilter) listQuery = listQuery.eq('type', typeFilter)

    const { data, error } = await listQuery
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error('Organizations list error', { error: error.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    // Enrich each row with adminCount + patientCount via a runtime count query
    // against `profiles`. Migrations are owned by another agent, so we don't
    // create a materialized view here — count() with head:true is index-friendly
    // enough for the admin org list at expected tenant scale.
    const rows = data ?? []
    const enriched = await Promise.all(
      rows.map(async (org) => {
        const orgId = (org as { id: string }).id
        const [adminCountRes, patientCountRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .in('role', ['org_admin', 'super_admin']),
          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('role', 'patient'),
        ])
        return {
          ...org,
          adminCount: adminCountRes.count ?? 0,
          patientCount: patientCountRes.count ?? 0,
        }
      })
    )

    // Return both the raw array (envelope-style) and the nested
    // `organizations` shape that the admin client expects via `fetchApi`.
    // Keeping both lets us migrate consumers incrementally without breaking
    // the public envelope contract.
    return Response.json({
      success: true,
      data: { organizations: enriched, total },
      organizations: enriched,
      meta: { total, limit, offset },
    })
  } catch (error: unknown) {
    logger.error('Organizations error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/organizations - Create organization (super_admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const rl = rateLimit(`organizations:${user.id}`, 10, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const supabase = getSupabase()

    // Verify super_admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || (profile as { role: string }).role !== 'super_admin') {
      return Response.json(
        { success: false, error: 'Forbidden: super_admin role required' },
        { status: 403 }
      )
    }

    const body: unknown = await request.json()
    const parsed = createOrganizationSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      )
    }

    // Check slug uniqueness
    const { data: existingSlug } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', parsed.data.slug)
      .maybeSingle()

    if (existingSlug) {
      return Response.json(
        { success: false, error: 'An organization with this slug already exists' },
        { status: 409 }
      )
    }

    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: parsed.data.name,
        slug: parsed.data.slug,
        type: parsed.data.type,
        logo_url: parsed.data.logo_url ?? null,
        primary_color: parsed.data.primary_color ?? null,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
      })
      .select('id, name, slug, type, logo_url, primary_color, phone, email, referral_code, created_at, updated_at')
      .single()

    if (orgError || !orgData) {
      logger.error('Organizations insert error', { error: orgError?.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const newOrg = orgData as { id: string } & Record<string, unknown>

    // Decide whether to auto-generate the admin password. If the super_admin
    // supplied one explicitly, we trust it as-is (Zod already enforced min
    // length). Otherwise generate a cryptographically random 16-char password
    // and surface it once in the response so the operator can relay it.
    const passwordWasAutoGenerated = !parsed.data.adminPassword
    const adminPassword = parsed.data.adminPassword ?? generateSecurePassword()

    let provisioned: { adminId: string; adminEmail: string }
    try {
      provisioned = await provisionOrgAdmin(supabase, {
        organizationId: newOrg.id,
        email: parsed.data.adminEmail,
        firstName: parsed.data.adminFirstName ?? null,
        lastName: parsed.data.adminLastName ?? null,
        password: adminPassword,
      })
    } catch (err: unknown) {
      // Roll back the organization row so the super_admin can retry cleanly.
      // We never want a dangling org with no admin to occupy the slug.
      const { error: rollbackError } = await supabase
        .from('organizations')
        .delete()
        .eq('id', newOrg.id)
      if (rollbackError) {
        logger.error('Organizations POST: org rollback failed', {
          orgId: newOrg.id,
          reason: rollbackError.message,
        })
      }

      if (err instanceof ProvisioningError && err.message.includes('already been registered')) {
        return Response.json(
          {
            success: false,
            error: 'An account with this admin email already exists',
          },
          { status: 409 }
        )
      }
      logger.error('Organizations POST: admin provisioning failed', {
        orgId: newOrg.id,
        stage: err instanceof ProvisioningError ? err.stage : 'unknown',
      })
      return Response.json(
        { success: false, error: 'Failed to provision organization admin' },
        { status: 500 }
      )
    }

    // Audit log — record a redacted reference to the password without leaking
    // plaintext to PM2 logs. The hash is a one-way SHA-256 prefix; useful only
    // for after-the-fact "did we issue X password" verification, not recovery.
    if (passwordWasAutoGenerated) {
      logger.info('Organizations POST: auto-generated admin password issued', {
        orgId: newOrg.id,
        adminId: provisioned.adminId,
        passwordHashRef: hashPasswordForLogReference(adminPassword),
      })
    }

    const responseBody: {
      success: true
      data: {
        organization: typeof orgData
        admin: { id: string; email: string; temporaryPassword?: string }
      }
    } = {
      success: true,
      data: {
        organization: orgData,
        admin: {
          id: provisioned.adminId,
          email: provisioned.adminEmail,
          ...(passwordWasAutoGenerated ? { temporaryPassword: adminPassword } : {}),
        },
      },
    }

    return Response.json(responseBody, { status: 201 })
  } catch (error: unknown) {
    logger.error('Organizations POST error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
