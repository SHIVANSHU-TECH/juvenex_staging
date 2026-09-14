import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { listOrdersSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'
import { authenticatedEmail } from '../_utils'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireUser(60, 'portal-read')
  if ('response' in auth) return auth.response
  const parsed = await parseBody(request, listOrdersSchema.omit({ email: true }))
  if ('response' in parsed) return parsed.response
  try {
    return Response.json(
      await juvenexClient.listOrders({ ...parsed.data, email: authenticatedEmail(auth.user) })
    )
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
