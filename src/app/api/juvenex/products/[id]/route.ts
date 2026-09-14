import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { productIdSchema } from '@/lib/juvenex/schemas'
import { clientIp, rateLimited, upstreamError } from '@/lib/juvenex/route-utils'
import { publicProductEnvelope } from '@/lib/juvenex/public-fields'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimited(`juvenex-product:${clientIp(request)}`, 60)
  if (limited) return limited
  const parsed = productIdSchema.safeParse((await params).id)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid product ID' }, { status: 400 })
  }
  try {
    return Response.json(publicProductEnvelope(await juvenexClient.getProductDetails(parsed.data)))
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
