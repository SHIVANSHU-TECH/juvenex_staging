import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { updateOrderSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'
import { requireOwnedOrder } from '../_utils'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireUser(3, 'portal-order-update')
  if ('response' in auth) return auth.response
  const parsed = await parseBody(request, updateOrderSchema)
  if ('response' in parsed) return parsed.response
  try {
    const owned = await requireOwnedOrder(parsed.data.order_id, auth.user)
    if ('response' in owned) return owned.response
    return Response.json(await juvenexClient.updateOrder(parsed.data))
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
