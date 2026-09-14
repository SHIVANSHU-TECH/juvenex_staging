import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'

// GET / PUT / DELETE /api/admin/organizations/[id]/integration
//
// Reads / writes per-tenant `organizations.prescriberx_client_id` (added in
// migration 029). UUID scopes every PrescribeRx API call to the org's Client
// entity; null falls back to the platform default.
//
// Auth: super_admin OR org_admin whose own organization_id matches [id].
// Rate limit: 30 writes/min/user. Audit-logged on change.

const ORG_ID = z.string().uuid()
const SELECT_COLS = 'id, slug, prescriberx_client_id'

const integrationSchema = z
  .object({ prescriberx_client_id: z.union([z.string().uuid(), z.null()]) })
  .strict()

const orgRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  prescriberx_client_id: z.string().nullable(),
})

interface AuthorizedUser {
  id: string
  role: string
  organization_id: string | null
}

async function authorize(
  orgId: string
): Promise<
  { ok: true; user: AuthorizedUser } | { ok: false; status: number; error: string }
> {
  const user = await getAuthUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }
  if (user.role === 'super_admin') return { ok: true, user }
  if (user.role === 'org_admin' && user.organization_id === orgId) {
    return { ok: true, user }
  }
  return { ok: false, status: 403, error: 'Forbidden' }
}

function jsonError(error: string, status: number) {
  return Response.json({ success: false, error }, { status })
}

function jsonOk(clientId: string | null) {
  return Response.json({
    success: true,
    data: {
      prescriberx_client_id: clientId,
      // Column doesn't exist yet; field reserved for forward compatibility.
      prescriberx_client_id_set_at: null,
    },
  })
}

async function parseAndAuth(
  rawId: string
): Promise<
  | { ok: true; orgId: string; user: AuthorizedUser }
  | { ok: false; response: Response }
> {
  const idCheck = ORG_ID.safeParse(rawId)
  if (!idCheck.success) {
    return { ok: false, response: jsonError('Invalid organization id', 400) }
  }
  const auth = await authorize(idCheck.data)
  if (!auth.ok) {
    return { ok: false, response: jsonError(auth.error, auth.status) }
  }
  return { ok: true, orgId: idCheck.data, user: auth.user }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params
    const gate = await parseAndAuth(rawId)
    if (!gate.ok) return gate.response

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('organizations')
      .select(SELECT_COLS)
      .eq('id', gate.orgId)
      .maybeSingle()

    if (error) {
      logger.error('admin/org/integration GET failed', {
        orgId: gate.orgId,
        error: error.message,
      })
      return jsonError('Internal server error', 500)
    }
    if (!data) return jsonError('Organization not found', 404)

    const parsed = orgRowSchema.safeParse(data)
    if (!parsed.success) {
      logger.error('admin/org/integration GET row failed schema', {
        orgId: gate.orgId,
        issues: parsed.error.flatten(),
      })
      return jsonError('Internal server error', 500)
    }
    return jsonOk(parsed.data.prescriberx_client_id)
  } catch (error: unknown) {
    logger.error('admin/org/integration GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError('Internal server error', 500)
  }
}

async function applyUpdate(
  orgId: string,
  user: AuthorizedUser,
  rawNext: string | null
): Promise<Response> {
  const next = typeof rawNext === 'string' ? rawNext.trim() : null
  if (next !== null && !ORG_ID.safeParse(next).success) {
    return jsonError('prescriberx_client_id must be a UUID or null', 400)
  }

  const supabase = createAdminClient()
  const { data: priorRow, error: priorErr } = await supabase
    .from('organizations')
    .select(SELECT_COLS)
    .eq('id', orgId)
    .maybeSingle()

  if (priorErr) {
    logger.error('admin/org/integration prior fetch failed', {
      orgId,
      error: priorErr.message,
    })
    return jsonError('Internal server error', 500)
  }
  if (!priorRow) return jsonError('Organization not found', 404)

  const priorParsed = orgRowSchema.safeParse(priorRow)
  if (!priorParsed.success) {
    logger.error('admin/org/integration prior row schema fail', {
      orgId,
      issues: priorParsed.error.flatten(),
    })
    return jsonError('Internal server error', 500)
  }

  const { data: updatedRow, error: updateErr } = await supabase
    .from('organizations')
    .update({ prescriberx_client_id: next })
    .eq('id', orgId)
    .select(SELECT_COLS)
    .single()

  if (updateErr || !updatedRow) {
    logger.error('admin/org/integration update failed', {
      orgId,
      error: updateErr?.message ?? 'no row returned',
    })
    return jsonError('Failed to update integration', 500)
  }

  const updatedParsed = orgRowSchema.safeParse(updatedRow)
  if (!updatedParsed.success) {
    logger.error('admin/org/integration updated row schema fail', {
      orgId,
      issues: updatedParsed.error.flatten(),
    })
    return jsonError('Internal server error', 500)
  }

  const before = priorParsed.data
  const after = updatedParsed.data
  if (before.prescriberx_client_id !== after.prescriberx_client_id) {
    await logAudit({
      userId: user.id,
      action: 'org_prescriberx_client_id_update',
      resourceType: 'organization',
      resourceId: orgId,
      details: {
        org_slug: after.slug,
        diff: {
          prescriberx_client_id: {
            from: before.prescriberx_client_id,
            to: after.prescriberx_client_id,
          },
        },
      },
    })
  }

  return jsonOk(after.prescriberx_client_id)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params
    const gate = await parseAndAuth(rawId)
    if (!gate.ok) return gate.response

    const rl = rateLimit(
      `admin-org-integration:${gate.user.id}`,
      30,
      60_000
    )
    if (!rl.success) return jsonError('Too many requests', 429)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonError('Invalid JSON body', 400)
    }

    const parsed = integrationSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: 'Invalid integration payload',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    return await applyUpdate(
      gate.orgId,
      gate.user,
      parsed.data.prescriberx_client_id
    )
  } catch (error: unknown) {
    logger.error('admin/org/integration PUT error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError('Internal server error', 500)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params
    const gate = await parseAndAuth(rawId)
    if (!gate.ok) return gate.response

    const rl = rateLimit(
      `admin-org-integration:${gate.user.id}`,
      30,
      60_000
    )
    if (!rl.success) return jsonError('Too many requests', 429)

    return await applyUpdate(gate.orgId, gate.user, null)
  } catch (error: unknown) {
    logger.error('admin/org/integration DELETE error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError('Internal server error', 500)
  }
}
