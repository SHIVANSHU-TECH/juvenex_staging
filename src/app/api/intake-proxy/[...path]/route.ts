import { NextRequest, NextResponse } from 'next/server'
import { BASE_PATH } from '@/lib/base-path'

/**
 * Reverse proxy for PrescribeRx intake embed.
 *
 * Forwards GET/POST to https://prescribe-rx.com/<path>, strips upstream
 * CSP / X-Frame-Options so the iframe renders same-origin, and rewrites
 * asset URLs in HTML/JS/CSS responses so they continue through the proxy.
 *
 * HIPAA note: PHI flows through this route. BAA with PrescribeRx required;
 * audit logging and TLS-only deployment assumed.
 */

const UPSTREAM = 'https://prescribe-rx.com'
/** Same-origin proxy root, including Next basePath (e.g. /staging/api/intake-proxy). */
const PROXY_ROOT = `${BASE_PATH}/api/intake-proxy`
const STRIP_HEADERS = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'strict-transport-security',
  'content-encoding',
  'content-length',
  'transfer-encoding',
  // Set-Cookie is handled explicitly (see rewriteSetCookie + getSetCookie):
  // copying it through the generic forEach loop would (a) collapse multiple
  // cookies into one via Headers.set and (b) keep the upstream Domain so the
  // browser drops the session — breaking Livewire's CSRF/session on step 2+.
  'set-cookie',
])

// The embed is a Livewire (Laravel) app: its multi-step flow depends on a
// session cookie + matching CSRF token. Because we serve it first-party
// (juvenex.app) through this proxy, the upstream cookie's `Domain=prescribe-rx.com`
// attribute must be stripped so the browser actually stores the cookie for our
// origin and replays it on the next proxied request. We also drop `Secure` in
// dev (http) so the cookie isn't silently discarded there; in prod (https) it
// is kept. Without this, advancing the intake throws a 419 "Page Expired".
function rewriteSetCookie(cookie: string, isHttps: boolean): string {
  let out = cookie
    // Remove any Domain attribute so the cookie defaults to the current host.
    .replace(/;\s*Domain=[^;]*/gi, '')
  if (!isHttps) {
    // PrescribeRx sets SameSite=None; Secure; Partitioned. Browsers require
    // Secure for SameSite=None (and for Partitioned/CHIPS). On local http://
    // we must strip Secure — but then SameSite=None cookies are rejected and
    // Livewire POSTs get 302 → /login (product click appears broken).
    // Downgrade to Lax and drop Partitioned so the session sticks on HTTP.
    out = out
      .replace(/;\s*Secure/gi, '')
      .replace(/;\s*Partitioned/gi, '')
      .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
  }
  return out
}

function rewriteHtml(body: string): string {
  const proxyPrefix = PROXY_ROOT.replace(/^\//, '') // staging/api/intake-proxy
  return body
    // Absolute upstream URLs → same-origin proxy (with basePath)
    .replace(/https:\/\/prescribe-rx\.com/g, PROXY_ROOT)
    // Root-relative paths (e.g. /livewire/, /embed/, /build/) → proxy.
    // Exclude protocol-relative (//cdn) and self-references already rewritten.
    .replace(
      /(["'(])\/([a-zA-Z][a-zA-Z0-9_-]*\/)/g,
      (match, quote: string, path: string) => {
        if (path.startsWith('api/intake-proxy/') || path.startsWith(`${proxyPrefix}/`)) {
          return match
        }
        // Already basePath-prefixed app paths should not be swallowed into PRX proxy
        if (BASE_PATH && path.startsWith(BASE_PATH.slice(1) + '/')) {
          return match
        }
        return `${quote}${PROXY_ROOT}/${path}`
      }
    )
}

async function forward(request: NextRequest, path: string[]): Promise<NextResponse> {
  const upstreamPath = path.join('/')
  const search = request.nextUrl.search
  const upstreamUrl = `${UPSTREAM}/${upstreamPath}${search}`

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase()
    if (k === 'host' || k === 'connection' || k.startsWith('x-forwarded-')) return
    headers.set(key, value)
  })
  headers.set('host', 'prescribe-rx.com')
  headers.set('origin', UPSTREAM)
  headers.set('referer', UPSTREAM + '/')

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }

  const upstream = await fetch(upstreamUrl, init)
  const contentType = upstream.headers.get('content-type') ?? ''

  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (STRIP_HEADERS.has(key.toLowerCase())) return
    responseHeaders.set(key, value)
  })

  // Replay each upstream Set-Cookie as a first-party cookie. getSetCookie()
  // preserves individual cookie headers (forEach would have merged them), and
  // append() emits one Set-Cookie line per cookie so none are lost.
  const isHttps = request.nextUrl.protocol === 'https:'
  const setCookies =
    typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : []
  for (const cookie of setCookies) {
    responseHeaders.append('set-cookie', rewriteSetCookie(cookie, isHttps))
  }

  // Keep redirects same-origin. An upstream 3xx Location pointing at
  // prescribe-rx.com would make the iframe navigate to the real (CSP/X-Frame
  // protected) host and break the flow; rewrite it back through the proxy.
  const location = upstream.headers.get('location')
  if (location) {
    responseHeaders.set(
      'location',
      location
        .replace(/^https?:\/\/prescribe-rx\.com/i, PROXY_ROOT)
        .replace(
          new RegExp(`^/(?!api\\/intake-proxy\\/|${BASE_PATH.slice(1)}\\/)([a-zA-Z])`),
          `${PROXY_ROOT}/$1`
        )
    )
  }

  // The embed HTML is dynamic Livewire (must not cache). But the vendor CSS/JS
  // (bootstrap, tabler-icons, livewire — ~680KB) and fonts/images are versioned
  // static assets; without a cache header they re-download on every /consult
  // open. Cache those on GET; leave HTML/POST no-store.
  const isGet = request.method === 'GET'
  const isHtml = contentType.includes('text/html')
  const isStaticAsset =
    !isHtml &&
    (contentType.includes('javascript') ||
      contentType.includes('text/css') ||
      contentType.includes('font') ||
      contentType.includes('image/') ||
      contentType.includes('woff'))
  if (isGet && isStaticAsset) {
    responseHeaders.set('cache-control', 'public, max-age=86400, stale-while-revalidate=604800')
  } else if (isHtml) {
    responseHeaders.set('cache-control', 'no-store')
  }

  if (contentType.includes('text/html') || contentType.includes('javascript') || contentType.includes('text/css')) {
    const text = await upstream.text()
    return new NextResponse(rewriteHtml(text), {
      status: upstream.status,
      headers: responseHeaders,
    })
  }

  const buf = await upstream.arrayBuffer()
  return new NextResponse(buf, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

interface RouteContext {
  params: Promise<{ path: string[] }>
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params
  return forward(request, path)
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params
  return forward(request, path)
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params
  return forward(request, path)
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params
  return forward(request, path)
}
