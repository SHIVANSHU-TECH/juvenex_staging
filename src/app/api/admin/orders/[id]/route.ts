import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { decryptPHI } from '@/lib/encryption'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'

/**
 * Decrypt an _enc ciphertext column if present, falling back to the cleartext
 * column during the migration 025 grace period (before migration 026 drops
 * cleartext columns). Returns null when both are absent.
 */
function decryptIfPresent<T = unknown>(
  enc: string | null | undefined,
  fallback: T | null | undefined
): T | null {
  if (enc) {
    return JSON.parse(decryptPHI(enc)) as T
  }
  return (fallback ?? null) as T | null
}

// GET  /api/admin/orders/[id] — full single order, including the new
//                              fulfillment columns and the customer profile.
// PATCH /api/admin/orders/[id] — admin status / fulfillment mutations.
//
// Auth: super_admin only on both verbs.
//
// The list endpoint at ../route.ts is intentionally untouched. Filters on the
// new `prescriberx_status` column are NOT supported there yet — the
// fulfillment UI fetches by `status` and narrows client-side as a stop-gap.

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const idSchema = z.string().uuid('Invalid order id')

const ORDER_STATUSES = [
  'pending',
  'paid',
  'shipped',
  'fulfilled',
  'refunded',
  'cancelled',
] as const

const PRESCRIBERX_STATUSES = [
  'not_sent',
  'sent',
  'confirmed',
  'failed',
] as const

const patchSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    prescriberx_status: z.enum(PRESCRIBERX_STATUSES).optional(),
    prescriberx_reference: z.string().min(1).max(200).optional(),
    admin_notes: z.string().max(5000).optional(),
    mark_sent: z.boolean().optional(),
    mark_confirmed: z.boolean().optional(),
    mark_fulfilled: z.boolean().optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'At least one field is required' }
  )

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileRow {
  id: string
  name: string | null
  email: string
}

export interface AdminOrderDetail {
  id: string
  user_id: string
  customer_name: string | null
  customer_email: string | null
  total_cents: number
  currency: string
  status: string
  items: unknown
  created_at: string
  shipping_address: unknown | null
  billing_address: unknown | null
  intake_answers: unknown | null
  contact_email: string | null
  contact_phone: string | null
  payment_provider: string | null
  payment_reference: string | null
  payment_status: string | null
  prescriberx_status: string | null
  prescriberx_reference: string | null
  prescriberx_sent_at: string | null
  fulfilled_by: string | null
  fulfilled_at: string | null
  admin_notes: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unauthorizedResponse(): Response {
  return Response.json(
    { success: false, error: 'Unauthorized' },
    { status: 401 }
  )
}

function forbiddenResponse(): Response {
  return Response.json(
    { success: false, error: 'Forbidden: super_admin role required' },
    { status: 403 }
  )
}

function rateLimitedResponse(): Response {
  return Response.json(
    { success: false, error: 'Too many requests' },
    { status: 429 }
  )
}

function internalErrorResponse(): Response {
  return Response.json(
    { success: false, error: 'Internal server error' },
    { status: 500 }
  )
}

async function attachProfile(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<ProfileRow | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, name, email')
    .eq('id', userId)
    .maybeSingle()
  return (data as ProfileRow | null) ?? null
}

// Build the column list once. Some of these columns only exist after
// migration 022 has run; the surrounding try/catch returns 500 if the
// schema is older, which is the correct behavior — fulfillment UI is
// useless without those columns.
const ORDER_DETAIL_COLUMNS =
  'id, user_id, total_cents, currency, status, items, created_at, ' +
  // Include both cleartext (grace-period fallback) and _enc (authoritative)
  // PHI columns. Cleartext will be removed when migration 026 drops them.
  'shipping_address, billing_address, intake_answers, ' +
  'intake_answers_enc, shipping_address_enc, billing_address_enc, ' +
  'contact_email, contact_phone, ' +
  'payment_provider, payment_reference, payment_status, ' +
  'prescriberx_status, prescriberx_reference, prescriberx_sent_at, ' +
  'fulfilled_by, fulfilled_at, admin_notes'

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()
    if (user.role !== 'super_admin') return forbiddenResponse()

    const rl = rateLimit(`admin-order-detail:${user.id}`, 120, 60_000)
    if (!rl.success) return rateLimitedResponse()

    const { id: rawId } = await params
    const idParse = idSchema.safeParse(rawId)
    if (!idParse.success) {
      return Response.json(
        { success: false, error: 'Invalid order id' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_DETAIL_COLUMNS)
      .eq('id', idParse.data)
      .maybeSingle()

    if (error) {
      logger.error('Admin order detail fetch error', { error: error.message })
      return internalErrorResponse()
    }
    if (!data) {
      return Response.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      )
    }

    const row = data as unknown as Record<string, unknown>
    const userId = String(row.user_id ?? '')
    const profile = userId ? await attachProfile(supabase, userId) : null

    // Decrypt PHI columns. decryptIfPresent reads from the _enc column when
    // present (migration 025+) and falls back to the cleartext column for rows
    // written before this migration — ensuring a seamless reader rollout.
    const detail: AdminOrderDetail = {
      id: String(row.id ?? ''),
      user_id: userId,
      customer_name: profile?.name ?? null,
      customer_email: profile?.email ?? null,
      total_cents: Number(row.total_cents ?? 0),
      currency: String(row.currency ?? 'usd'),
      status: String(row.status ?? 'pending'),
      items: row.items ?? [],
      created_at: String(row.created_at ?? ''),
      shipping_address: decryptIfPresent(
        row.shipping_address_enc as string | null,
        row.shipping_address
      ),
      billing_address: decryptIfPresent(
        row.billing_address_enc as string | null,
        row.billing_address
      ),
      intake_answers: decryptIfPresent(
        row.intake_answers_enc as string | null,
        row.intake_answers
      ),
      contact_email: (row.contact_email as string | null) ?? null,
      contact_phone: (row.contact_phone as string | null) ?? null,
      payment_provider: (row.payment_provider as string | null) ?? null,
      payment_reference: (row.payment_reference as string | null) ?? null,
      payment_status: (row.payment_status as string | null) ?? null,
      prescriberx_status:
        (row.prescriberx_status as string | null) ?? 'not_sent',
      prescriberx_reference:
        (row.prescriberx_reference as string | null) ?? null,
      prescriberx_sent_at:
        (row.prescriberx_sent_at as string | null) ?? null,
      fulfilled_by: (row.fulfilled_by as string | null) ?? null,
      fulfilled_at: (row.fulfilled_at as string | null) ?? null,
      admin_notes: (row.admin_notes as string | null) ?? null,
    }

    await logAudit({
      userId: user.id,
      action: 'admin_order_phi_viewed',
      resourceType: 'order',
      resourceId: detail.id,
      details: {
        has_shipping_address: detail.shipping_address != null,
        has_billing_address: detail.billing_address != null,
        has_intake_answers: detail.intake_answers != null,
      },
    }).catch(() => {})

    return Response.json({ success: true, data: detail })
  } catch (error: unknown) {
    logger.error('Admin order detail error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return internalErrorResponse()
  }
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

type OrderStatus = (typeof ORDER_STATUSES)[number]
type PrescriberxStatus = (typeof PRESCRIBERX_STATUSES)[number]

interface PatchPayload {
  status?: OrderStatus
  prescriberx_status?: PrescriberxStatus
  prescriberx_reference?: string
  admin_notes?: string
  mark_sent?: boolean
  mark_confirmed?: boolean
  mark_fulfilled?: boolean
}

// Allowed forward transitions for the high-level order status. Terminal
// states (cancelled, refunded) have an empty allow-set so any attempt to
// move them is rejected.
const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, ReadonlyArray<OrderStatus>> =
  {
    pending: ['paid', 'cancelled'],
    paid: ['shipped', 'fulfilled', 'refunded', 'cancelled'],
    shipped: ['fulfilled', 'refunded'],
    fulfilled: ['refunded'],
    cancelled: [],
    refunded: [],
  }

// PrescribeRx fulfillment lifecycle. confirmed is terminal. failed is a
// recoverable bucket — admins can retry by going failed -> sent once the
// PrescribeRx-side issue is resolved.
const PRESCRIBERX_STATUS_TRANSITIONS: Record<
  PrescriberxStatus,
  ReadonlyArray<PrescriberxStatus>
> = {
  not_sent: ['sent', 'failed'],
  sent: ['confirmed', 'failed'],
  confirmed: [],
  failed: ['sent'],
}

function isValidOrderStatusTransition(
  from: OrderStatus,
  to: OrderStatus
): boolean {
  if (from === to) return true
  return ORDER_STATUS_TRANSITIONS[from].includes(to)
}

function isValidPrescriberxStatusTransition(
  from: PrescriberxStatus,
  to: PrescriberxStatus
): boolean {
  if (from === to) return true
  return PRESCRIBERX_STATUS_TRANSITIONS[from].includes(to)
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === 'string' &&
    (ORDER_STATUSES as ReadonlyArray<string>).includes(value)
  )
}

function isPrescriberxStatus(value: unknown): value is PrescriberxStatus {
  return (
    typeof value === 'string' &&
    (PRESCRIBERX_STATUSES as ReadonlyArray<string>).includes(value)
  )
}

/**
 * Translate the validated payload into the actual column updates to apply.
 * Pure: returns a fresh object — never mutates the input.
 */
function buildUpdate(
  payload: PatchPayload,
  actorId: string
): Record<string, unknown> {
  const update: Record<string, unknown> = {}
  const nowIso = new Date().toISOString()

  // Direct field passthroughs.
  if (payload.status !== undefined) update.status = payload.status
  if (payload.prescriberx_status !== undefined) {
    update.prescriberx_status = payload.prescriberx_status
  }
  if (payload.prescriberx_reference !== undefined) {
    update.prescriberx_reference = payload.prescriberx_reference
  }
  if (payload.admin_notes !== undefined) {
    update.admin_notes = payload.admin_notes
  }

  // Convenience flags. These layer on top of the direct fields so a single
  // PATCH can both set the reference number AND flip the status.
  if (payload.mark_sent === true) {
    update.prescriberx_status = 'sent'
    update.prescriberx_sent_at = nowIso
  }
  if (payload.mark_confirmed === true) {
    update.prescriberx_status = 'confirmed'
  }
  if (payload.mark_fulfilled === true) {
    update.status = 'fulfilled'
    update.fulfilled_by = actorId
    update.fulfilled_at = nowIso
  }

  return update
}

/**
 * Validate proposed status transitions against the matrix BEFORE any DB
 * write. Returns null on success, or a human-friendly error message on
 * rejection. Caller should respond with HTTP 422.
 */
function validateTransitions(
  currentStatus: OrderStatus,
  currentPrescriberx: PrescriberxStatus,
  update: Record<string, unknown>
): string | null {
  const nextStatusRaw = update.status
  if (nextStatusRaw !== undefined) {
    if (!isOrderStatus(nextStatusRaw)) {
      return `Invalid status transition: ${currentStatus} -> ${String(nextStatusRaw)}`
    }
    if (!isValidOrderStatusTransition(currentStatus, nextStatusRaw)) {
      return `Invalid status transition: ${currentStatus} -> ${nextStatusRaw}`
    }
  }

  const nextPxRaw = update.prescriberx_status
  if (nextPxRaw !== undefined) {
    if (!isPrescriberxStatus(nextPxRaw)) {
      return `Invalid prescriberx_status transition: ${currentPrescriberx} -> ${String(nextPxRaw)}`
    }
    if (!isValidPrescriberxStatusTransition(currentPrescriberx, nextPxRaw)) {
      return `Invalid prescriberx_status transition: ${currentPrescriberx} -> ${nextPxRaw}`
    }
  }

  return null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()
    if (user.role !== 'super_admin') return forbiddenResponse()

    const rl = rateLimit(`admin-order-patch:${user.id}`, 30, 60_000)
    if (!rl.success) return rateLimitedResponse()

    const { id: rawId } = await params
    const idParse = idSchema.safeParse(rawId)
    if (!idParse.success) {
      return Response.json(
        { success: false, error: 'Invalid order id' },
        { status: 400 }
      )
    }

    const rawBody: unknown = await request.json().catch(() => null)
    const parsed = patchSchema.safeParse(rawBody)
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Confirm the order exists before we attempt the update — gives us a
    // clean 404 path and lets us include the previous values in the audit.
    const { data: existing, error: existingError } = await supabase
      .from('orders')
      .select(ORDER_DETAIL_COLUMNS)
      .eq('id', idParse.data)
      .maybeSingle()
    if (existingError) {
      logger.error('Admin order patch lookup error', {
        error: existingError.message,
      })
      return internalErrorResponse()
    }
    if (!existing) {
      return Response.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      )
    }

    const update = buildUpdate(parsed.data, user.id)
    if (Object.keys(update).length === 0) {
      return Response.json(
        { success: false, error: 'No applicable fields to update' },
        { status: 400 }
      )
    }

    // Status transition validation runs BEFORE any DB write so an illegal
    // jump (e.g. cancelled -> paid) cannot mutate the row at all.
    const existingRow = existing as unknown as Record<string, unknown>
    const currentStatusRaw = existingRow.status
    const currentPxRaw = existingRow.prescriberx_status ?? 'not_sent'
    if (!isOrderStatus(currentStatusRaw)) {
      logger.error('Admin order patch: corrupt existing status', {
        orderId: idParse.data,
      })
      return internalErrorResponse()
    }
    if (!isPrescriberxStatus(currentPxRaw)) {
      logger.error('Admin order patch: corrupt existing prescriberx_status', {
        orderId: idParse.data,
      })
      return internalErrorResponse()
    }
    const transitionError = validateTransitions(
      currentStatusRaw,
      currentPxRaw,
      update
    )
    if (transitionError) {
      return Response.json(
        { success: false, error: transitionError },
        { status: 422 }
      )
    }

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update(update)
      .eq('id', idParse.data)
      .select(ORDER_DETAIL_COLUMNS)
      .maybeSingle()
    if (updateError || !updated) {
      logger.error('Admin order patch update error', {
        error: updateError?.message ?? 'no row returned',
      })
      return internalErrorResponse()
    }

    // Best-effort audit. Log only the changed field NAMES plus non-sensitive
    // metadata. Never log admin_notes content or prescriberx_reference value
    // — those carry PHI / vendor-confidential identifiers and the audit log
    // is not encrypted at rest.
    await logAudit({
      userId: user.id,
      action: 'admin.order.update',
      resourceType: 'order',
      resourceId: idParse.data,
      details: {
        changed_fields: Object.keys(update),
        new_status:
          typeof update.status === 'string' ? update.status : undefined,
        new_prescriberx_status:
          typeof update.prescriberx_status === 'string'
            ? update.prescriberx_status
            : undefined,
      },
    })

    return Response.json({ success: true, data: updated })
  } catch (error: unknown) {
    logger.error('Admin order patch error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return internalErrorResponse()
  }
}
