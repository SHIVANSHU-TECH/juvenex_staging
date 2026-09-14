import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import {
  ORG_ID_SCHEMA,
  authorizeOverrideRequest,
  MAX_BULK_OVERRIDES,
  parseOverrideCsv,
  upsertOverrides,
} from '@/lib/productOverrides'

// POST /api/admin/organizations/[id]/product-overrides/csv
//
// multipart/form-data with a `file` field. CSV header row required:
//   product_id,included,price_override_cents
//
// Parser lives in @/lib/productOverrides — see TODO there for quoted-field
// handling. Hard caps below prevent runaway memory use:
//   - MAX_CSV_BYTES file size
//   - MAX_BULK_OVERRIDES rows after parsing

const MAX_CSV_BYTES = 256 * 1024

export async function POST(
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

    const { id: rawId } = await params
    const idCheck = ORG_ID_SCHEMA.safeParse(rawId)
    if (!idCheck.success) {
      return Response.json(
        { success: false, error: 'Invalid organization id' },
        { status: 400 }
      )
    }
    const orgId = idCheck.data

    const forbidden = authorizeOverrideRequest({ user, orgId })
    if (forbidden) return forbidden

    const rl = rateLimit(`product-overrides:csv:${user.id}`, 10, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return Response.json(
        { success: false, error: 'Expected multipart/form-data body' },
        { status: 400 }
      )
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return Response.json(
        { success: false, error: 'Missing "file" field' },
        { status: 400 }
      )
    }
    if (file.size === 0) {
      return Response.json(
        { success: false, error: 'CSV file is empty' },
        { status: 400 }
      )
    }
    if (file.size > MAX_CSV_BYTES) {
      return Response.json(
        {
          success: false,
          error: `CSV file exceeds ${MAX_CSV_BYTES} bytes`,
        },
        { status: 413 }
      )
    }

    const text = await file.text()
    const { rows, errors } = parseOverrideCsv(text)

    if (rows.length === 0) {
      return Response.json(
        {
          success: false,
          error: 'No valid rows found',
          details: { row_errors: errors },
        },
        { status: 400 }
      )
    }
    if (rows.length > MAX_BULK_OVERRIDES) {
      return Response.json(
        {
          success: false,
          error: `CSV contains ${rows.length} valid rows; limit is ${MAX_BULK_OVERRIDES}`,
        },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const result = await upsertOverrides(supabase, orgId, user.id, rows)
    if (!result) {
      return Response.json(
        { success: false, error: 'Failed to upsert overrides' },
        { status: 500 }
      )
    }

    await logAudit({
      userId: user.id,
      action: 'tenant_product_overrides_upsert',
      resourceType: 'organization',
      resourceId: orgId,
      details: {
        upserted_count: result.upserted_count,
        skipped_count: result.skipped_count,
        actor_role: user.role,
        source: 'csv',
        row_error_count: errors.length,
        file_bytes: file.size,
      },
    })

    return Response.json({
      success: true,
      data: {
        ...result,
        row_errors: errors,
      },
    })
  } catch (error: unknown) {
    logger.error('product-overrides CSV POST error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
