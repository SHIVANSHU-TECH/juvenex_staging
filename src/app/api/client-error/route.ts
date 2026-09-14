import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// Captures browser/client-side errors (window error, unhandledrejection,
// resource-load failures, console.error) sent by ClientErrorReporter so that
// production frontend failures are visible — the app previously had NO
// client-side error reporting. Every report is logged (→ pm2 error log) AND
// persisted to public.client_errors (queryable) with the user when known.

const str = (max: number) => z.string().max(max).optional().nullable()

const clientErrorSchema = z.object({
  type: z.enum(['error', 'unhandledrejection', 'resource', 'console', 'manual']).default('error'),
  message: z.string().min(1).max(4000),
  stack: str(16000),
  source: str(2000), // file/script URL that threw
  lineno: z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  colno: z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  pageUrl: str(2000), // location.href at time of error
  userAgent: str(1000),
  release: str(120), // build id, to correlate with deploys
  extra: z.record(z.string(), z.unknown()).optional().nullable(),
})

function clientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export async function POST(request: NextRequest) {
  // Generous but capped per-IP rate limit: we WANT errors, but a looping page
  // must not flood. The client also dedupes/caps before sending.
  const ip = clientIp(request)
  const rl = rateLimit(`client-error:${ip}`, 120, 60_000)
  if (!rl.success) {
    return new Response(null, { status: 204 }) // silently drop excess
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(null, { status: 204 })
  }

  const parsed = clientErrorSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(null, { status: 204 })
  }
  const e = parsed.data

  // Best-effort identity (the global fetch patch attaches the auth token to
  // /api/* calls, so authenticated users are attributed; anonymous → null).
  let userId: string | null = null
  let organizationId: string | null = null
  try {
    const user = await getAuthUser()
    if (user) {
      userId = user.id
      organizationId = user.organization_id ?? null
    }
  } catch {
    /* anonymous client error — keep userId null */
  }

  // 1) Always log (immediate visibility in the pm2 error log).
  logger.error('[client-error]', {
    type: e.type,
    message: e.message,
    source: e.source ?? undefined,
    lineno: e.lineno ?? undefined,
    colno: e.colno ?? undefined,
    pageUrl: e.pageUrl ?? undefined,
    userId: userId ?? undefined,
    release: e.release ?? undefined,
    stack: e.stack ? e.stack.slice(0, 2000) : undefined,
  })

  // 2) Persist (queryable history). Best-effort; never fail the request.
  try {
    const supabase = createAdminClient()
    await supabase.from('client_errors').insert({
      user_id: userId,
      organization_id: organizationId,
      error_type: e.type,
      message: e.message,
      stack: e.stack ?? null,
      source_url: e.source ?? null,
      line_no: e.lineno ?? null,
      col_no: e.colno ?? null,
      page_url: e.pageUrl ?? null,
      user_agent: e.userAgent ?? request.headers.get('user-agent'),
      app_release: e.release ?? null,
      extra: e.extra ?? null,
    })
  } catch (err: unknown) {
    logger.warn('client-error persist failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return new Response(null, { status: 204 })
}
