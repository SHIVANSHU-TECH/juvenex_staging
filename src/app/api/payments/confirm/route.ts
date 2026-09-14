// POST /api/payments/confirm
//
// DEV-ONLY escape hatch that mimics a successful provider webhook for the
// stub provider. Hard-disabled in production (NODE_ENV=production returns 503
// immediately). Two valid auth modes in dev/staging:
//
//   1. Authenticated Juvenex user who owns the order (used by the
//      /checkout/stub-pay UI's "Pay" button).
//
//   2. A request carrying x-stub-confirm-token: <STUB_CONFIRM_TOKEN>. Used
//      by integration tests / curl-driven smoke checks.
//
// Additional guards:
//   - Requires payment_reference to be non-null (checkout must have run first).
//   - Rejects orders older than 1 hour to prevent stale-order replay (410).
//   - Uses crypto.timingSafeEqual for STUB_CONFIRM_TOKEN comparison.

import { createHash, timingSafeEqual } from 'crypto'
import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

const bodySchema = z.object({
  orderId: z.string().uuid(),
})

interface OrderRow {
  id: string
  user_id: string
  payment_status: string
  payment_reference: string | null
  created_at: string
}

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status })
}

function isStubMode(): boolean {
  return (process.env.PAYMENT_PROVIDER ?? 'stub') === 'stub'
}

/**
 * Constant-time token comparison using Node's crypto.timingSafeEqual.
 * Pads both sides to the same byte length before comparison to prevent
 * length-based timing leaks (Sec-M-3).
 */
function tokenMatches(request: NextRequest): boolean {
  const expected = process.env.STUB_CONFIRM_TOKEN
  if (!expected) return false
  const provided = request.headers.get('x-stub-confirm-token')
  if (!provided) return false

  // Normalise to fixed-length SHA-256 digests so timingSafeEqual always
  // receives equal-length Buffers regardless of input length.
  const expectedBuf = createHash('sha256').update(expected).digest()
  const providedBuf = createHash('sha256').update(provided).digest()

  return timingSafeEqual(expectedBuf, providedBuf)
}

export async function POST(request: NextRequest) {
  try {
    // Production gate: this endpoint is dev/staging only. A real provider
    // webhook (/api/payments/webhook) handles production payment confirmation.
    if (process.env.NODE_ENV === 'production') {
      return jsonError(503, 'Service unavailable')
    }

    if (!isStubMode()) {
      return jsonError(403, 'Endpoint disabled outside stub mode')
    }

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return jsonError(400, 'Invalid JSON body')
    }

    const parsed = bodySchema.safeParse(rawBody)
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
    const { orderId } = parsed.data

    // Determine the actor and authorize.
    const user = await getAuthUser()
    const hasToken = tokenMatches(request)

    if (!user && !hasToken) {
      return jsonError(401, 'Unauthorized')
    }

    // Burst protection — applies even with the token, keyed by either the
    // user id or the literal 'token' bucket.
    const rlKey = user
      ? `payments-confirm:user:${user.id}`
      : 'payments-confirm:token'
    const rl = rateLimit(rlKey, 30, 60_000)
    if (!rl.success) return jsonError(429, 'Too many requests')

    const supabase = createAdminClient()

    // Require payment_reference to be non-null: checkout must have stored a
    // session reference before confirm is called (Sec-H-4).
    // Require created_at within the last hour to prevent stale-order replay.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('orders')
      .select('id, user_id, payment_status, payment_reference, created_at')
      .eq('id', orderId)
      .not('payment_reference', 'is', null)
      .gte('created_at', oneHourAgo)
      .maybeSingle<OrderRow>()

    if (error) {
      logger.error('payments/confirm: order lookup failed', {
        orderId,
        error: error.message,
      })
      return jsonError(500, 'Internal server error')
    }

    if (!data) {
      // Could be: order not found, payment_reference is null (checkout didn't
      // complete), or order is older than 1 hour.
      // We issue a 410 Gone for the stale-order case and 404 for others.
      // To avoid leaking which condition triggered, check age separately only
      // when we know the order exists.
      const { data: rawOrder } = await supabase
        .from('orders')
        .select('id, created_at, payment_reference')
        .eq('id', orderId)
        .maybeSingle<{ id: string; created_at: string; payment_reference: string | null }>()

      if (!rawOrder) {
        return jsonError(404, 'Order not found')
      }
      if (rawOrder.payment_reference === null) {
        return jsonError(400, 'Order checkout session not initiated')
      }
      // Order exists with a reference but is too old.
      return jsonError(410, 'Order confirmation window has expired')
    }

    // If authenticating with a user session (no token), enforce ownership.
    if (!hasToken && user && data.user_id !== user.id) {
      return jsonError(403, 'Forbidden')
    }

    // Idempotent: only flip pending → succeeded. .select() returns affected
    // rows so a duplicate confirm (e.g., user double-tap of the stub Approve
    // button) can be detected and skip the order.paid audit event.
    const { data: updatedRows, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        payment_status: 'succeeded',
      })
      .eq('id', orderId)
      .eq('payment_status', 'pending')
      .select('id, user_id, total_cents')

    if (updateError) {
      logger.error('payments/confirm: update failed', {
        orderId,
        error: updateError.message,
      })
      return jsonError(500, 'Internal server error')
    }

    const updatedRow = (updatedRows ?? [])[0]

    // Best-effort audit. Never blocks the response. We always log the
    // confirm-attempt (including duplicate no-ops) for HIPAA traceability,
    // but only emit the order.paid fulfillment-queue signal on the first
    // transition out of 'pending'.
    void logAudit({
      userId: user?.id,
      action: 'order.payment.confirmed',
      resourceType: 'order',
      resourceId: orderId,
      details: {
        provider: 'stub',
        payment_status: 'succeeded',
        idempotent_noop: !updatedRow,
      },
    }).catch((err: unknown) => {
      logger.error('payments/confirm: audit log failed', {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    if (updatedRow) {
      void logAudit({
        userId: updatedRow.user_id ?? user?.id,
        action: 'order.paid',
        resourceType: 'order',
        resourceId: orderId,
        details: {
          provider: 'stub',
          total_cents: updatedRow.total_cents,
        },
      }).catch((err: unknown) => {
        logger.error('payments/confirm: order.paid audit log failed', {
          orderId,
          error: err instanceof Error ? err.message : String(err),
        })
      })
    }

    return Response.json({ success: true })
  } catch (error: unknown) {
    logger.error('payments/confirm: unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonError(500, 'Internal server error')
  }
}
