import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import {
  isAllowedImageUrl,
  IMAGE_URL_ALLOWLIST_MESSAGE,
} from '@/lib/url-allowlist'

// PUT /api/admin/organizations/[id]/branding
//
// Phase 2 deliverable from docs/PRESCRIBERX_BRANDING_AUDIT.md. Allows a
// super_admin to set per-tenant storefront overrides on the organizations
// table. Phase 3 will read these values on user-facing surfaces — for now
// this route is the write side only.
//
// Auth: super_admin only (UI guard exists in <AdminShell>; this is the
// authoritative server-side check).
//
// Rate limiting: 30 writes/min per super_admin id is plenty for a humans-only
// admin form and prevents accidental loops from churning audit_logs.

const ORG_ID_PATTERN = z.string().uuid()

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

/**
 * Branding payload schema.
 *
 * Every field is independently nullable: passing `null` clears the value,
 * omitting it leaves the existing value untouched. We intentionally do NOT
 * accept the empty string as a clear sentinel — clients must send `null`
 * explicitly to opt out of a stored value.
 */
const brandingSchema = z
  .object({
    brand_name: z
      .string()
      .trim()
      .min(1, 'brand_name cannot be blank')
      .max(80, 'brand_name must be 80 chars or fewer')
      .nullable()
      .optional(),
    brand_primary_color: z
      .string()
      .regex(HEX_COLOR_REGEX, 'brand_primary_color must be #rrggbb hex')
      .nullable()
      .optional(),
    brand_logo_url: z
      .string()
      .max(500, 'brand_logo_url must be 500 chars or fewer')
      .url('brand_logo_url must be a valid URL')
      .refine((value) => isAllowedImageUrl(value), {
        message: IMAGE_URL_ALLOWLIST_MESSAGE,
      })
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (payload) =>
      payload.brand_name !== undefined ||
      payload.brand_primary_color !== undefined ||
      payload.brand_logo_url !== undefined,
    { message: 'At least one branding field is required' }
  )

type BrandingUpdate = z.infer<typeof brandingSchema>

interface OrgBrandingRow {
  id: string
  name: string
  slug: string
  brand_name: string | null
  brand_primary_color: string | null
  brand_logo_url: string | null
}

const orgBrandingRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  brand_name: z.string().nullable(),
  brand_primary_color: z.string().nullable(),
  brand_logo_url: z.string().nullable(),
})

/**
 * Build a sparse update payload that only includes fields the caller sent.
 * Passing `undefined` for a field omits it; passing `null` clears it.
 */
function buildUpdatePayload(input: BrandingUpdate): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (input.brand_name !== undefined) payload.brand_name = input.brand_name
  if (input.brand_primary_color !== undefined) {
    payload.brand_primary_color = input.brand_primary_color
    // Mirror to the legacy primary_color the patient storefront actually reads
    // at runtime (organization-context). Without this, a super-admin colour
    // change saves to brand_primary_color but never shows on the store.
    payload.primary_color = input.brand_primary_color
  }
  if (input.brand_logo_url !== undefined) {
    payload.brand_logo_url = input.brand_logo_url
    payload.logo_url = input.brand_logo_url
  }
  return payload
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const rl = rateLimit(`admin-org-branding:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const { id: rawId } = await params
    const idCheck = ORG_ID_PATTERN.safeParse(rawId)
    if (!idCheck.success) {
      return Response.json(
        { success: false, error: 'Invalid organization id' },
        { status: 400 }
      )
    }
    const orgId = idCheck.data

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const parsed = brandingSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: 'Invalid branding payload',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Snapshot the prior row so the audit log captures the diff. Selecting
    // before the update gives us the "from" side; the returned row from the
    // update gives us the "to" side.
    const { data: priorRow, error: priorError } = await supabase
      .from('organizations')
      .select('id, name, slug, brand_name, brand_primary_color, brand_logo_url')
      .eq('id', orgId)
      .maybeSingle()

    if (priorError) {
      logger.error('admin/org/branding fetch prior row failed', {
        orgId,
        error: priorError.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!priorRow) {
      return Response.json(
        { success: false, error: 'Organization not found' },
        { status: 404 }
      )
    }

    const priorParsed = orgBrandingRowSchema.safeParse(priorRow)
    if (!priorParsed.success) {
      logger.error('admin/org/branding prior row failed schema validation', {
        orgId,
        issues: priorParsed.error.flatten(),
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const updatePayload = buildUpdatePayload(parsed.data)

    const { data: updatedRow, error: updateError } = await supabase
      .from('organizations')
      .update(updatePayload)
      .eq('id', orgId)
      .select(
        'id, name, slug, brand_name, brand_primary_color, brand_logo_url'
      )
      .single()

    if (updateError || !updatedRow) {
      logger.error('admin/org/branding update failed', {
        orgId,
        error: updateError?.message ?? 'no row returned',
      })
      return Response.json(
        { success: false, error: 'Failed to update branding' },
        { status: 500 }
      )
    }

    const updatedParsed = orgBrandingRowSchema.safeParse(updatedRow)
    if (!updatedParsed.success) {
      logger.error('admin/org/branding updated row failed schema validation', {
        orgId,
        issues: updatedParsed.error.flatten(),
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const before: OrgBrandingRow = priorParsed.data
    const after: OrgBrandingRow = updatedParsed.data

    // Append-only audit trail of every change. Only fields that were actually
    // modified end up in the diff to keep the audit row useful for HIPAA
    // forensic review.
    const diff: Record<string, { from: string | null; to: string | null }> = {}
    for (const key of [
      'brand_name',
      'brand_primary_color',
      'brand_logo_url',
    ] as const) {
      if (before[key] !== after[key]) {
        diff[key] = { from: before[key], to: after[key] }
      }
    }

    await logAudit({
      userId: user.id,
      action: 'org_branding_update',
      resourceType: 'organization',
      resourceId: orgId,
      details: {
        org_slug: after.slug,
        diff,
      },
    })

    return Response.json({
      success: true,
      data: { organization: after },
    })
  } catch (error: unknown) {
    logger.error('admin/org/branding error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
