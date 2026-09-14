import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { patientMessageSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'
import { requireOwnedOrder } from '../_utils'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireUser(60, 'portal-messages-read')
  if ('response' in auth) return auth.response

  const parsed = await parseBody(request, patientMessageSchema)
  if ('response' in parsed) return parsed.response

  try {
    const owned = await requireOwnedOrder(parsed.data.order_id, auth.user)
    if ('response' in owned) return owned.response

    return Response.json(await juvenexClient.patientMessage(parsed.data))
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
