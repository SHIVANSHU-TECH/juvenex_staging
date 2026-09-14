import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { cancelOwnedEnrollmentSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'
import { requireOwnedOrder } from '../_utils'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireUser(3, 'portal-enrollment-cancel')
  if ('response' in auth) return auth.response
  const parsed = await parseBody(request, cancelOwnedEnrollmentSchema)
  if ('response' in parsed) return parsed.response
  try {
    const owned = await requireOwnedOrder(parsed.data.order_id, auth.user)
    if ('response' in owned) return owned.response

    const enrollment = await juvenexClient.getEnrollment({ order_id: parsed.data.order_id })
    const belongsToOrder = enrollment.status === 1 && enrollment.enrollments?.some(
      (item) => item.subscription_id === parsed.data.subscription_id
    )
    if (!belongsToOrder) {
      return Response.json({ error: 'Enrollment not found' }, { status: 404 })
    }

    return Response.json(
      await juvenexClient.cancelEnrollment({ subscription_id: parsed.data.subscription_id })
    )
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
