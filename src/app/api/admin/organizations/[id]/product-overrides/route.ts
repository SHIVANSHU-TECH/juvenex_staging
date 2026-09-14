import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import {
  ORG_ID_SCHEMA,
  authorizeOverrideRequest,
  bulkOverrideBodySchema,
  fetchOverridesForOrg,
  upsertOverrides,
} from '@/lib/productOverrides'

// /api/admin/organizations/[id]/product-overrides
//
// JSON CRUD surface for tenant_product_overrides. The CSV bulk-import path
// lives in ./csv/route.ts and shares the upsert primitive in
// @/lib/productOverrides.
//
// Auth:
//   - super_admin always allowed
//   - org_admin allowed only when [id] matches their own profile.organization_id
//   - everyone else: 403
//
// Rate limit (per user): 60/min on writes — high enough for a bulk-import
// flow that may retry, low enough to dampen accidental loops.

async function resolveAuthorizedRequest(
  params: Promise<{ id: string }>,
  rateLimitKey: 'get' | 'put' | 'delete'
): Promise<
  | { error: Response }
  | {
      orgId: string
      userId: string
      userRole: string
    }
> {
  const user = await getAuthUser()
  if (!user) {
    return {
      error: Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    }
  }

  const { id: rawId } = await params
  const idCheck = ORG_ID_SCHEMA.safeParse(rawId)
  if (!idCheck.success) {
    return {
      error: Response.json(
        { success: false, error: 'Invalid organization id' },
        { status: 400 }
      ),
    }
  }
  const orgId = idCheck.data

  const forbidden = authorizeOverrideRequest({ user, orgId })
  if (forbidden) return { error: forbidden }

  // Apply rate limit only AFTER auth — keeps unauthenticated traffic from
  // burning per-user buckets and lets us tag the bucket by route.
  if (rateLimitKey !== 'get') {
    const rl = rateLimit(
      `product-overrides:${rateLimitKey}:${user.id}`,
      60,
      60_000
    )
    if (!rl.success) {
      return {
        error: Response.json(
          { success: false, error: 'Too many requests' },
          { status: 429 }
        ),
      }
    }
  }

  return { orgId, userId: user.id, userRole: user.role }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await resolveAuthorizedRequest(params, 'get')
    if ('error' in ctx) return ctx.error

    const supabase = createAdminClient()
    const data = await fetchOverridesForOrg(supabase, ctx.orgId)
    return Response.json({ success: true, data })
  } catch (error: unknown) {
    logger.error('product-overrides GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await resolveAuthorizedRequest(params, 'put')
    if ('error' in ctx) return ctx.error

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const parsed = bulkOverrideBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: 'Invalid request',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const result = await upsertOverrides(
      supabase,
      ctx.orgId,
      ctx.userId,
      parsed.data.overrides
    )
    if (!result) {
      return Response.json(
        { success: false, error: 'Failed to upsert overrides' },
        { status: 500 }
      )
    }

    await logAudit({
      userId: ctx.userId,
      action: 'tenant_product_overrides_upsert',
      resourceType: 'organization',
      resourceId: ctx.orgId,
      details: {
        upserted_count: result.upserted_count,
        skipped_count: result.skipped_count,
        actor_role: ctx.userRole,
        source: 'json',
      },
    })

    return Response.json({ success: true, data: result })
  } catch (error: unknown) {
    logger.error('product-overrides PUT error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await resolveAuthorizedRequest(params, 'delete')
    if ('error' in ctx) return ctx.error

    const productId = request.nextUrl.searchParams.get('product_id')
    if (!productId) {
      // Refuse to org-wide-wipe without an explicit product_id. A bulk reset
      // belongs in a separate, explicitly-named endpoint.
      return Response.json(
        {
          success: false,
          error: 'product_id query parameter is required',
        },
        { status: 400 }
      )
    }
    if (productId.length > 128) {
      return Response.json(
        { success: false, error: 'product_id too long' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('tenant_product_overrides')
      .delete()
      .eq('organization_id', ctx.orgId)
      .eq('product_id', productId)

    if (error) {
      logger.error('product-overrides DELETE failed', {
        orgId: ctx.orgId,
        productId,
        error: error.message,
      })
      return Response.json(
        { success: false, error: 'Failed to delete override' },
        { status: 500 }
      )
    }

    await logAudit({
      userId: ctx.userId,
      action: 'tenant_product_overrides_delete',
      resourceType: 'organization',
      resourceId: ctx.orgId,
      details: {
        product_id: productId,
        actor_role: ctx.userRole,
      },
    })

    return Response.json({ success: true, data: { product_id: productId } })
  } catch (error: unknown) {
    logger.error('product-overrides DELETE error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
