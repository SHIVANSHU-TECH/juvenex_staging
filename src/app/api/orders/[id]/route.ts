import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { decryptPHI } from '@/lib/encryption'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

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

// GET /api/orders/[id]
//
// Patient-facing order detail. Owner-only: the user_id on the row MUST match
// the authenticated user's id. If it doesn't (or the row doesn't exist), we
// return a 404 — never a 403 — so we don't leak the existence of orders that
// belong to other users.
//
// User-visible fields include shipping_address and intake_answers (those are
// the user's own data) but explicitly EXCLUDE admin_notes, fulfilled_by, and
// payment_reference, which are internal-only.

const idSchema = z.string().uuid('Invalid order id')

interface OrderDetailRow {
  id: string
  user_id: string
  status: string
  total_cents: number
  currency: string
  items: unknown
  // Cleartext columns (grace-period fallback; will be dropped in migration 026).
  shipping_address: unknown | null
  billing_address: unknown | null
  intake_answers: unknown | null
  // Encrypted PHI columns added in migration 025.
  intake_answers_enc: string | null
  shipping_address_enc: string | null
  billing_address_enc: string | null
  contact_email: string | null
  contact_phone: string | null
  payment_provider: string | null
  payment_status: string | null
  prescriberx_status: string | null
  prescriberx_reference: string | null
  prescriberx_sent_at: string | null
  fulfilled_at: string | null
  created_at: string
  updated_at: string | null
}

export interface PatientOrderDetail {
  id: string
  status: string
  total_cents: number
  currency: string
  items: unknown
  shipping_address: unknown | null
  billing_address: unknown | null
  intake_answers: unknown | null
  contact_email: string | null
  contact_phone: string | null
  payment_provider: string | null
  payment_status: string | null
  prescriberx_status: string
  prescriberx_reference: string | null
  prescriberx_sent_at: string | null
  fulfilled_at: string | null
  created_at: string
  updated_at: string | null
}

const PATIENT_ORDER_DETAIL_COLUMNS =
  'id, user_id, status, total_cents, currency, items, ' +
  // Include both cleartext (grace-period fallback) and _enc (authoritative)
  // columns. Cleartext will be removed from this list when migration 026 drops
  // those columns.
  'shipping_address, billing_address, intake_answers, ' +
  'intake_answers_enc, shipping_address_enc, billing_address_enc, ' +
  'contact_email, contact_phone, ' +
  'payment_provider, payment_status, ' +
  'prescriberx_status, prescriberx_reference, prescriberx_sent_at, ' +
  'fulfilled_at, created_at, updated_at'

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status })
}

function notFound(): Response {
  // Single 404 response used for both "row missing" and "row belongs to a
  // different user" — never disambiguate so we don't leak ownership.
  return Response.json(
    { success: false, error: 'Order not found' },
    { status: 404 }
  )
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return jsonError(401, 'Unauthorized')

    const rl = rateLimit(`patient-order-detail:${user.id}`, 120, 60_000)
    if (!rl.success) return jsonError(429, 'Too many requests')

    const { id: rawId } = await params
    const idParse = idSchema.safeParse(rawId)
    if (!idParse.success) {
      return jsonError(400, 'Invalid order id')
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('orders')
      .select(PATIENT_ORDER_DETAIL_COLUMNS)
      .eq('id', idParse.data)
      .maybeSingle()

    if (error) {
      logger.error('patient/orders detail fetch error', {
        error: error.message,
      })
      return jsonError(500, 'Internal server error')
    }
    if (!data) return notFound()

    const row = data as unknown as OrderDetailRow

    // Owner-only: don't leak existence to non-owners.
    if (row.user_id !== user.id) return notFound()

    // Decrypt PHI columns. decryptIfPresent reads from the _enc column when
    // present (migration 025+) and falls back to the cleartext column for rows
    // written before this migration — ensuring a seamless reader rollout.
    const detail: PatientOrderDetail = {
      id: row.id,
      status: row.status,
      total_cents: row.total_cents,
      currency: row.currency,
      items: row.items,
      shipping_address: decryptIfPresent(
        row.shipping_address_enc,
        row.shipping_address
      ),
      billing_address: decryptIfPresent(
        row.billing_address_enc,
        row.billing_address
      ),
      intake_answers: decryptIfPresent(
        row.intake_answers_enc,
        row.intake_answers
      ),
      contact_email: row.contact_email ?? null,
      contact_phone: row.contact_phone ?? null,
      payment_provider: row.payment_provider ?? null,
      payment_status: row.payment_status ?? null,
      prescriberx_status: row.prescriberx_status ?? 'not_sent',
      prescriberx_reference: row.prescriberx_reference ?? null,
      prescriberx_sent_at: row.prescriberx_sent_at ?? null,
      fulfilled_at: row.fulfilled_at ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at ?? null,
    }

    return Response.json({ success: true, data: { order: detail } })
  } catch (error: unknown) {
    logger.error('patient/orders detail unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError(500, 'Internal server error')
  }
}
