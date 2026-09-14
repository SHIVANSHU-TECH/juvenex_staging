import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { clientIp, rateLimited, upstreamError } from '@/lib/juvenex/route-utils'
import { publicProductEnvelope } from '@/lib/juvenex/public-fields'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const limited = rateLimited(`juvenex-products:${clientIp(request)}`, 60)
  if (limited) return limited
  try {
    return Response.json(publicProductEnvelope(await juvenexClient.getProducts()))
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
