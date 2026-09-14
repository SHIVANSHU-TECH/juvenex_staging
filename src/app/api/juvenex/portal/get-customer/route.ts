import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { z } from 'zod'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'
import { authenticatedEmail } from '../_utils'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireUser(60, 'portal-read')
  if ('response' in auth) return auth.response
  const parsed = await parseBody(request, z.object({}))
  if ('response' in parsed) return parsed.response
  try {
    return Response.json(
      await juvenexClient.getCustomer({ email: authenticatedEmail(auth.user) })
    )
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
