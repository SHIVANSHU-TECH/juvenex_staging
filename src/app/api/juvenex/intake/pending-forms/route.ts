import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { JuvenexApiError, juvenexClient } from '@/lib/juvenex/client'
import { pendingFormsInputSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser } from '@/lib/juvenex/route-utils'
import { authenticatedEmail } from '../../portal/_utils'

export const runtime = 'nodejs'

/**
 * Stage 2 intake lookup.
 *
 * Three "not available" states all resolve to a soft 503 carrying an empty
 * `forms` array rather than an error status, because the callers render
 * NOTHING when intake is unavailable (locked decision 6). Handing them a
 * well-formed empty payload keeps that path free of special-casing:
 *
 *   intake_not_configured — flag off; we never call the vendor.
 *   intake_not_deployed   — flag on, but the vendor route still 404s.
 *   intake_unavailable    — vendor reachable but returned a business error.
 *
 * The email is always taken from the session. Accepting it from the body
 * would turn this into an order-history oracle for any authenticated user.
 */

const bodySchema = pendingFormsInputSchema.pick({ order_id: true })

function unavailable(error: string) {
  return Response.json({ status: 0, error, forms: [] }, { status: 503 })
}

/**
 * The vendor's un-deployed route answers with a Laravel HTML 404 page. The
 * client parses the body BEFORE checking `response.ok`, so that arrives here
 * as an invalid-JSON error, not an HTTP 404 — match it on both so this keeps
 * working if the client's ordering is ever corrected.
 */
function isNotDeployed(error: unknown) {
  return (
    error instanceof JuvenexApiError &&
    /invalid JSON response|HTTP 404/i.test(error.message)
  )
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(60, 'portal-read')
  if ('response' in auth) return auth.response

  const parsed = await parseBody(request, bodySchema)
  if ('response' in parsed) return parsed.response

  if (process.env.NEXT_PUBLIC_INTAKE_ENABLED !== 'true') {
    return unavailable('intake_not_configured')
  }

  try {
    const result = await juvenexClient.pendingForms({
      email: authenticatedEmail(auth.user),
      ...(parsed.data.order_id ? { order_id: parsed.data.order_id } : {}),
    })

    // `request()` resolves any numeric-status envelope, including the vendor's
    // own `status: 0` errors, so success is confirmed here rather than assumed.
    if (result.status !== 1) return unavailable('intake_unavailable')

    return Response.json(result)
  } catch (error: unknown) {
    if (isNotDeployed(error)) return unavailable('intake_not_deployed')
    console.error('[intake/pending-forms] vendor lookup failed', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
