import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { customPriceOfflineOrderSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireUser(5)
  if ('response' in auth) return auth.response
  if (auth.user.role !== 'super_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = await parseBody(request, customPriceOfflineOrderSchema)
  if ('response' in parsed) return parsed.response
  try {
    return Response.json(await juvenexClient.createCustomPriceOfflineOrder(parsed.data))
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
