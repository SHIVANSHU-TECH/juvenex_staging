import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { getEnrollmentSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'
import { requireOwnedOrder } from '../_utils'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireUser(60, 'portal-read')
  if ('response' in auth) return auth.response
  const parsed = await parseBody(request, getEnrollmentSchema)
  if ('response' in parsed) return parsed.response
  try {
    const owned = await requireOwnedOrder(parsed.data.order_id, auth.user)
    if ('response' in owned) return owned.response
    const result = await juvenexClient.getEnrollment(parsed.data)
    if (result.status === 0 && /no active enrollment/i.test(result.message ?? '')) {
      return Response.json({ status: 1, order_id: parsed.data.order_id, enrollments: [] })
    }
    return Response.json(result)
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
