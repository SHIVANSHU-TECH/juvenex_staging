// POST /api/marketing/leads
//
// Deprecated for telehealth intake. Medical-intake contact + DOB/address are
// PHI-adjacent and should not be mirrored into a marketing table. Keep the
// route as a fail-closed no-op so older clients do not duplicate sensitive
// intake fields.
//
// Behavior contract for the client:
//   - The form calls this endpoint in parallel with the appointments submit
//     via `Promise.allSettled`. A failure here MUST NOT block the user from
//     completing the telehealth booking.
//   - This endpoint is fire-and-forget from the user's perspective; we still
//     return a typed JSON envelope so the client can log a non-fatal warning.
//
// Schema reference (migration 022, owned by a parallel agent):
//   marketing_leads (
//     id uuid pk,
//     organization_id uuid,
//     email citext,
//     first_name text, last_name text, dob date,
//     address_line1 text, address_line2 text,
//     city text, state text, postal_code text, phone text,
//     source text, provider_patient_ref text,
//     created_at timestamptz, last_seen_at timestamptz,
//     unique (organization_id, email)
//   )

import { type NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'

interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

function jsonResponse<T>(body: ApiEnvelope<T>, status: number): Response {
  return Response.json(body, { status })
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}

export async function POST(_request: NextRequest): Promise<Response> {
  try {
    const user = await getAuthUser()
    if (!user) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
    }

    // Per-user burst limit — generous because this endpoint is called once
    // per intake submission, but we want to deflect any abusive loop a
    // misbehaving client could create.
    const rl = rateLimit(`marketing-leads:${user.id}`, 10, 60_000)
    if (!rl.success) {
      return jsonResponse({ success: false, error: 'Too many requests' }, 429)
    }

    await logAudit({
      userId: user.id,
      action: 'marketing_lead_intake_mirror_blocked',
      resourceType: 'marketing_lead',
    }).catch(() => {})

    return jsonResponse(
      { success: false, error: 'Marketing lead intake mirror disabled' },
      410
    )

  } catch (error: unknown) {
    logger.error('marketing-leads: unhandled error', {
      error: errorMessage(error),
    })
    return jsonResponse(
      { success: false, error: 'Internal server error' },
      500
    )
  }
}
