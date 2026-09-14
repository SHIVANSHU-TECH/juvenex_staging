import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { memberViewSchema } from '@/lib/juvenex/schemas'
import { clientIp, parseBody, rateLimited, upstreamError } from '@/lib/juvenex/route-utils'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const limited = rateLimited(`juvenex-member:${clientIp(request)}`, 20)
  if (limited) return limited
  const parsed = await parseBody(request, memberViewSchema)
  if ('response' in parsed) return parsed.response
  try {
    return Response.json(await juvenexClient.memberView(parsed.data))
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
