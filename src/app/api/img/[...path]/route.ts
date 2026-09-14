import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { logger } from '@/lib/logger'

/**
 * Image proxy route — `/api/img/<base64url-encoded-https-url>`
 *
 * Fetches an upstream product image server-side and serves it under our
 * own domain. The upstream hostname is never exposed to the client, and
 * the heavy edge cache here defeats the upstream's 1-hour signed-URL TTL.
 *
 * Hostnames are checked against UPSTREAM_IMAGE_HOSTS — extend this list
 * (not the variable name) when onboarding additional upstream vendors.
 */

// Allowlist of upstream image hosts the proxy will fetch from.
// Defense-in-depth against SSRF: ANY host not in this list is rejected with 400.
const UPSTREAM_IMAGE_HOSTS: ReadonlySet<string> = new Set([
  'prescribe-rx-product-assets.s3.amazonaws.com',
])

const UPSTREAM_TIMEOUT_MS = 10_000
const PROXY_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800'
const DEFAULT_CONTENT_TYPE = 'image/webp'

// Body size cap — 10 MiB. Enforced via Content-Length pre-check AND a
// streaming byte counter, so misbehaving upstreams can't bypass the limit.
const MAX_BYTES = 10_485_760 // 10 MiB

// Maximum length of the base64url payload before we attempt to decode it.
// Prevents CPU/memory spend on absurdly large payloads. (SEC #7)
//
// Upstream PrescribeRx product images are time-limited PRESIGNED S3 URLs whose
// X-Amz-Security-Token (STS) makes the raw URL ~1.9KB; base64url-encoded that
// payload is ~2.5KB. 2048 rejected every product image with a 400, so the shop
// rendered placeholders only. 8192 leaves generous headroom while still
// bounding decode cost; the host allowlist remains the real SSRF guard.
const MAX_PAYLOAD_LENGTH = 8192

// Headers we strip from the upstream response. These either leak the
// upstream vendor identity or are infrastructure noise we do not want
// to forward to the client.
const STRIPPED_HEADER_PREFIXES: readonly string[] = ['x-amz-', 'x-bucket-']
const STRIPPED_HEADER_NAMES: ReadonlySet<string> = new Set(['server', 'via'])

// Per-key in-flight dedup map. Keyed by SHA-256 of the upstream URL string.
// Prevents redundant upstream fetches when the same image is requested
// concurrently. Entries are cleaned up after the promise settles. (PERF #18)
const inflightRequests = new Map<string, Promise<NextResponse>>()

function shouldStripHeader(name: string): boolean {
  const lower = name.toLowerCase()
  if (STRIPPED_HEADER_NAMES.has(lower)) return true
  return STRIPPED_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

function decodeBase64UrlPayload(payload: string): string | null {
  try {
    // base64url -> base64
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
    const buf = Buffer.from(padded + padding, 'base64')
    const decoded = buf.toString('utf8')
    if (decoded.length === 0) return null
    return decoded
  } catch {
    return null
  }
}

function parseUpstreamUrl(decoded: string): URL | null {
  try {
    const url = new URL(decoded)
    if (url.protocol !== 'https:') return null
    if (!UPSTREAM_IMAGE_HOSTS.has(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

function opaqueHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12)
}

function rejectError(status: number, message: string): NextResponse {
  return new NextResponse(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function emptyError(status: number): NextResponse {
  return new NextResponse(null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/**
 * Wrap a body stream with a byte counter that aborts if MAX_BYTES is exceeded.
 * This guards against upstreams that omit or lie about Content-Length.
 */
function sizeLimitedStream(
  body: ReadableStream<Uint8Array>,
  controller: AbortController,
): ReadableStream<Uint8Array> {
  let bytesRead = 0
  const reader = body.getReader()

  return new ReadableStream<Uint8Array>({
    async pull(streamController) {
      const { done, value } = await reader.read()
      if (done) {
        streamController.close()
        return
      }
      bytesRead += value.byteLength
      if (bytesRead > MAX_BYTES) {
        controller.abort()
        streamController.error(new Error('upstream_body_too_large'))
        return
      }
      streamController.enqueue(value)
    },
    cancel() {
      reader.cancel()
    },
  })
}

/**
 * Core fetch + proxy logic for a single upstream URL.
 * Returns a NextResponse ready to send to the client.
 */
async function fetchAndProxy(
  upstream: URL,
  forwardedHeaders: Record<string, string>,
  urlHash: string,
): Promise<NextResponse> {
  // --- SEC #1: Content-Length pre-check ---
  // Issue a HEAD first only when we need the size; here we rely on the
  // GET response Content-Length header for the pre-check and on the
  // streaming counter for enforcement during transfer.

  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), UPSTREAM_TIMEOUT_MS)

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(upstream.toString(), {
      method: 'GET',
      headers: forwardedHeaders,
      // SEC #2: manual redirect — we validate any Location ourselves.
      redirect: 'manual',
      cache: 'no-store',
      signal: abortController.signal,
    })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const isAbort =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    logger.error('img proxy: upstream fetch failed', {
      hash: urlHash,
      reason: isAbort ? 'timeout' : 'fetch_error',
    })
    return emptyError(isAbort ? 504 : 502)
  }
  clearTimeout(timeoutId)

  // --- SEC #2: Redirect handling with allowlist re-validation ---
  // `redirect: 'manual'` causes the fetch to return an opaque-redirect
  // response (status 301/302/307/308) rather than following automatically.
  // We allow at most one hop, and only to an allowlisted https host.
  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    const location = upstreamResponse.headers.get('location')
    if (!location) {
      logger.warn('img proxy: redirect with no Location', { hash: urlHash })
      return emptyError(502)
    }
    const redirectUrl = parseUpstreamUrl(location)
    if (redirectUrl === null) {
      // Location is either non-https or not in the allowlist — reject.
      logger.warn('img proxy: redirect to disallowed host rejected', { hash: urlHash })
      return emptyError(502)
    }
    // Follow exactly one validated redirect (no chains).
    const abortController2 = new AbortController()
    const timeoutId2 = setTimeout(() => abortController2.abort(), UPSTREAM_TIMEOUT_MS)
    try {
      upstreamResponse = await fetch(redirectUrl.toString(), {
        method: 'GET',
        headers: forwardedHeaders,
        redirect: 'manual', // Never follow automatically, even after the single hop.
        cache: 'no-store',
        signal: abortController2.signal,
      })
    } catch (error: unknown) {
      clearTimeout(timeoutId2)
      const isAbort =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      logger.error('img proxy: redirect fetch failed', {
        hash: urlHash,
        reason: isAbort ? 'timeout' : 'fetch_error',
      })
      return emptyError(isAbort ? 504 : 502)
    }
    clearTimeout(timeoutId2)

    // Reject a second redirect — no chains allowed.
    if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
      logger.warn('img proxy: redirect chain rejected', { hash: urlHash })
      return emptyError(502)
    }
  }

  if (upstreamResponse.status === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        'Cache-Control': PROXY_CACHE_CONTROL,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  if (!upstreamResponse.ok) {
    logger.warn('img proxy: upstream non-ok', {
      hash: urlHash,
      status: upstreamResponse.status,
    })
    // Collapse to 404 so we never leak upstream status semantics to the client.
    return emptyError(404)
  }

  // --- SEC #1: Content-Length pre-check ---
  const contentLengthHeader = upstreamResponse.headers.get('content-length')
  if (contentLengthHeader !== null) {
    const declared = parseInt(contentLengthHeader, 10)
    if (!Number.isNaN(declared) && declared > MAX_BYTES) {
      logger.warn('img proxy: upstream Content-Length exceeds cap', {
        hash: urlHash,
        status: 502,
      })
      return emptyError(502)
    }
  }

  // Build a sanitized header set: only safe content metadata, never
  // upstream-vendor breadcrumbs.
  const responseHeaders = new Headers()
  upstreamResponse.headers.forEach((value, key) => {
    if (shouldStripHeader(key)) return
    const lower = key.toLowerCase()
    if (lower === 'content-type' || lower === 'etag') {
      // Note: content-length is intentionally omitted — the streaming counter
      // wraps the body so the length the client sees may differ from upstream.
      responseHeaders.set(key, value)
    }
  })
  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('Content-Type', DEFAULT_CONTENT_TYPE)
  }
  responseHeaders.set('Cache-Control', PROXY_CACHE_CONTROL)
  responseHeaders.set('X-Content-Type-Options', 'nosniff')
  // Defensive: prevent the file being framed independently.
  responseHeaders.set('Cross-Origin-Resource-Policy', 'same-origin')

  // --- SEC #1: Streaming byte counter ---
  // Wraps the body so mid-stream over-sized responses are aborted even when
  // the upstream omitted Content-Length or sent a dishonest value.
  if (!upstreamResponse.body) {
    return emptyError(502)
  }

  const streamAbortController = new AbortController()
  const guardedBody = sizeLimitedStream(upstreamResponse.body, streamAbortController)

  return new NextResponse(guardedBody, {
    status: 200,
    headers: responseHeaders,
  })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await context.params
  if (!Array.isArray(path) || path.length === 0) {
    return rejectError(400, 'Bad Request')
  }

  // The catch-all carries the encoded payload as the first segment.
  // Additional segments are ignored — they exist only to make caches
  // see distinct keys when callers append a synthetic suffix.
  const payload = path[0]

  // --- SEC #7: Base64url payload length cap ---
  // Reject before any decode work if the payload is unreasonably long.
  if (payload.length > MAX_PAYLOAD_LENGTH) {
    return rejectError(400, 'Bad Request')
  }

  const decoded = decodeBase64UrlPayload(payload)
  if (decoded === null) {
    return rejectError(400, 'Bad Request')
  }

  const upstream = parseUpstreamUrl(decoded)
  if (upstream === null) {
    // Don't leak whether we rejected for host vs scheme vs malformed.
    logger.warn('img proxy: rejected upstream', { hash: opaqueHash(decoded) })
    return rejectError(400, 'Bad Request')
  }

  // Forward only Accept and If-None-Match. Never forward auth/cookies.
  const forwardedHeaders: Record<string, string> = {}
  const accept = request.headers.get('accept')
  if (accept) forwardedHeaders['Accept'] = accept
  const inm = request.headers.get('if-none-match')
  if (inm) forwardedHeaders['If-None-Match'] = inm

  // --- PERF #18: Per-key dedup of in-flight upstream requests ---
  // Keyed by SHA-256 of the upstream URL so concurrent requests for the same
  // image share one outgoing fetch. The map entry is removed after settlement.
  const dedupeKey = createHash('sha256').update(upstream.toString()).digest('hex')
  const urlHash = opaqueHash(decoded)

  const existing = inflightRequests.get(dedupeKey)
  if (existing !== undefined) {
    return existing
  }

  const fetchPromise = fetchAndProxy(upstream, forwardedHeaders, urlHash).finally(() => {
    inflightRequests.delete(dedupeKey)
  })

  inflightRequests.set(dedupeKey, fetchPromise)
  return fetchPromise
}

// Reject anything other than GET. We export the common verbs explicitly
// so Next.js returns a real 405 with Allow rather than 404.
export async function POST(): Promise<NextResponse> {
  return methodNotAllowed()
}

export async function PUT(): Promise<NextResponse> {
  return methodNotAllowed()
}

export async function PATCH(): Promise<NextResponse> {
  return methodNotAllowed()
}

export async function DELETE(): Promise<NextResponse> {
  return methodNotAllowed()
}

export async function HEAD(): Promise<NextResponse> {
  return methodNotAllowed()
}

export async function OPTIONS(): Promise<NextResponse> {
  return methodNotAllowed()
}

function methodNotAllowed(): NextResponse {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: {
      Allow: 'GET',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
