import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { updateShippingAddressSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'
import { requireOwnedOrder } from '../_utils'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireUser(5, 'portal-shipping-update')
  if ('response' in auth) return auth.response
  const parsed = await parseBody(request, updateShippingAddressSchema)
  if ('response' in parsed) return parsed.response
  try {
    const owned = await requireOwnedOrder(parsed.data.order_id, auth.user)
    if ('response' in owned) return owned.response
    return Response.json(await juvenexClient.updateShippingAddress(parsed.data))
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
