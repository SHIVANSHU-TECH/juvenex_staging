import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { getOrderHistorySchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'
import { authenticatedEmail, requireOwnedOrder } from '../_utils'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireUser(60, 'portal-read')
  if ('response' in auth) return auth.response
  const parsed = await parseBody(request, getOrderHistorySchema.omit({ email: true }))
  if ('response' in parsed) return parsed.response
  try {
    const owned = await requireOwnedOrder(parsed.data.order_id, auth.user)
    if ('response' in owned) return owned.response
    return Response.json(
      await juvenexClient.getOrderHistory({
        order_id: parsed.data.order_id,
        email: authenticatedEmail(auth.user),
      })
    )
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
