/**
 * @deprecated Superseded by /api/juvenex/orders/finalize, which does what this
 * route does AND owns the money: it verifies the Stripe authorization, loops
 * the whole bag, captures or cancels as one unit, and mirrors each order
 * locally. This route takes a client-supplied `payment_token` on trust and
 * persists nothing, so it must not be used for new checkouts. Retained for
 * backward compatibility; removed in a follow-up.
 */
import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { offlineOrderSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if ('response' in auth) return auth.response
  const parsed = await parseBody(request, offlineOrderSchema)
  if ('response' in parsed) return parsed.response
  if (parsed.data.email.toLowerCase() !== auth.user.email.toLowerCase()) {
    return Response.json({ error: 'Order email must match the signed-in user' }, { status: 403 })
  }
  try {
    return Response.json(await juvenexClient.createOfflineOrder(parsed.data))
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
