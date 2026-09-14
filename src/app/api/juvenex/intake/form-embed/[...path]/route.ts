import { NextRequest, NextResponse } from 'next/server'

/**
 * Same-origin HTML shell proxy for WLMD / Jotform clinical intake embeds.
 *
 * Why this exists:
 * Direct iframes of forms.whitelabelmd.com / jotform often show
 * "content is blocked" (X-Frame-Options / CSP). HappyLabs embeds those URLs
 * directly; Juvenex needs a first-party HTML document.
 *
 * Critical: do NOT rewrite JavaScript bodies. A naive rewrite of `/path/`
 * destroys JS regex literals (`/pattern/flags` → Invalid regular expression
 * flags) and breaks Start / next-step. Scripts and CSS are left pointing at
 * the real upstream hosts; only the HTML document is proxied + unframed.
 */

export const runtime = 'nodejs'

const ALLOWED_HOSTS = new Set([
  'forms.whitelabelmd.com',
  'form.jotform.com',
  'hipaa.jotform.com',
  'www.jotform.com',
  'submit.jotform.com',
  'cdn.jotfor.ms',
  'js.jotform.com',
  'events.jotform.com',
])

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
  'set-cookie',
])

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (ALLOWED_HOSTS.has(h)) return true
  return h.endsWith('.jotform.com') || h.endsWith('.jotfor.ms')
}

function proxyPrefix(host: string): string {
  return `/api/juvenex/intake/form-embed/${host}`
}

/**
 * Serve proxied HTML with an upstream <base href> so relative asset URLs
 * (scripts/css) resolve to Jotform/WLMD — never rewrite JS bodies.
 */
function rewriteHtml(html: string, host: string): string {
  const origin = `https://${host}/`
  const baseTag = `<base href="${origin}">`

  if (/<base\b/i.test(html)) {
    return html.replace(/<base\b[^>]*>/i, baseTag)
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`)
  }
  return `${baseTag}${html}`
}

function rewriteSetCookie(cookie: string, isHttps: boolean): string {
  let out = cookie.replace(/;\s*Domain=[^;]*/gi, '')
  if (!isHttps) {
    out = out
      .replace(/;\s*Secure/gi, '')
      .replace(/;\s*Partitioned/gi, '')
      .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
  }
  return out
}

async function forward(request: NextRequest, path: string[]): Promise<NextResponse> {
  if (path.length < 1) {
    return NextResponse.json({ error: 'missing_host' }, { status: 400 })
  }

  const host = path[0]
  if (!isAllowedHost(host)) {
    return NextResponse.json({ error: 'host_not_allowed', host }, { status: 400 })
  }

  const rest = path.slice(1).join('/')
  const search = request.nextUrl.search
  const upstreamUrl = `https://${host}/${rest}${search}`

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase()
    if (k === 'host' || k === 'connection' || k.startsWith('x-forwarded-')) return
    // Don't forward our site's cookies to Jotform.
    if (k === 'cookie') return
    headers.set(key, value)
  })
  headers.set('host', host)
  headers.set('origin', `https://${host}`)
  headers.set('referer', `https://${host}/`)
  headers.set(
    'accept',
    request.headers.get('accept') ||
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  )

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, init)
  } catch {
    return NextResponse.json({ error: 'upstream_unreachable' }, { status: 502 })
  }

  const contentType = upstream.headers.get('content-type') ?? ''
  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (STRIP_HEADERS.has(key.toLowerCase())) return
    responseHeaders.set(key, value)
  })

  const isHttps = request.nextUrl.protocol === 'https:'
  const setCookies =
    typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : []
  for (const cookie of setCookies) {
    responseHeaders.append('set-cookie', rewriteSetCookie(cookie, isHttps))
  }

  const location = upstream.headers.get('location')
  if (location) {
    try {
      const loc = new URL(location, `https://${host}/`)
      if (isAllowedHost(loc.host)) {
        responseHeaders.set(
          'location',
          `${proxyPrefix(loc.host)}${loc.pathname}${loc.search}`
        )
      } else {
        responseHeaders.set('location', location)
      }
    } catch {
      responseHeaders.set('location', location)
    }
  }

  responseHeaders.delete('x-frame-options')
  responseHeaders.delete('content-security-policy')

  const isJs =
    contentType.includes('javascript') ||
    contentType.includes('ecmascript') ||
    /\.js(\?|$)/i.test(upstreamUrl)
  const isCss = contentType.includes('text/css') || /\.css(\?|$)/i.test(upstreamUrl)
  const isHtml = contentType.includes('text/html')

  // NEVER rewrite JS/CSS — that caused "Invalid regular expression flags".
  if (isJs || isCss) {
    const buf = await upstream.arrayBuffer()
    responseHeaders.set('cache-control', 'public, max-age=3600')
    return new NextResponse(buf, { status: upstream.status, headers: responseHeaders })
  }

  if (isHtml) {
    const text = await upstream.text()
    responseHeaders.set('cache-control', 'no-store')
    responseHeaders.set('content-type', 'text/html; charset=utf-8')
    return new NextResponse(rewriteHtml(text, host), {
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

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  return forward(request, path)
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  return forward(request, path)
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  return forward(request, path)
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  return forward(request, path)
}
