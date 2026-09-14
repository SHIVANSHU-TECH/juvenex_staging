import type { NextRequest } from 'next/server'
import type { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { JuvenexApiError } from './client'

/**
 * Best-effort client IP for rate-limit keying.
 *
 * The leftmost `X-Forwarded-For` hop is CLIENT-SUPPLIED and must never be
 * trusted on its own: proxies append rather than replace, so a request sending
 * `X-Forwarded-For: 1.2.3.4` arrives as `"1.2.3.4, <real ip>"` and taking
 * `[0]` hands the caller a free rate-limit reset on every request.
 *
 * Trusted edge headers are preferred; when only XFF is available we take the
 * RIGHTMOST hop, which is the one our own edge appended and the client cannot
 * forge.
 */
export function clientIp(request: NextRequest): string {
  const edge =
    request.headers.get('cf-connecting-ip') || request.headers.get('true-client-ip')
  if (edge?.trim()) return edge.trim()

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean)
    if (hops.length) return hops[hops.length - 1]
  }

  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export function rateLimited(key: string, limit: number) {
  if (rateLimit(key, limit, 60_000).success) return null
  return Response.json(
    { error: 'Too many requests. Please wait a minute and try again.' },
    { status: 429, headers: { 'Retry-After': '60' } }
  )
}

export async function parseBody<T>(request: Request, schema: z.ZodType<T>) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { response: Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      response: Response.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      ),
    }
  }
  return { data: parsed.data }
}

export async function requireUser(limit = 10, bucket = 'order') {
  const user = await getAuthUser()
  if (!user) {
    return { response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const limited = rateLimited(`juvenex-${bucket}:${user.id}`, limit)
  if (limited) return { response: limited }
  return { user }
}

export function upstreamError(error: unknown) {
  if (error instanceof JuvenexApiError) {
    return Response.json({ error: error.message }, { status: error.httpStatus })
  }
  return Response.json({ error: 'Internal server error' }, { status: 500 })
}
