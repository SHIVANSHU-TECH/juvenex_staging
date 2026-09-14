import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { getOrderByPaymentTokenSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'
import { authenticatedEmail, requireOwnedOrder } from '../_utils'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireUser(5, 'portal-token-search')
  if ('response' in auth) return auth.response
  const parsed = await parseBody(request, getOrderByPaymentTokenSchema)
  if ('response' in parsed) return parsed.response
  try {
    const result = await juvenexClient.getOrderByPaymentToken({
      ...parsed.data,
      email: authenticatedEmail(auth.user),
    })
    if (result.status !== 1 || !result.order_id) return Response.json(result)

    const owned = await requireOwnedOrder(result.order_id, auth.user)
    if ('response' in owned) return owned.response
    return Response.json(result)
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
