import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// juvenex.app kept as legacy — existing users/webhooks still arrive on it.
const MAIN_DOMAINS = ['juvenex.space', 'juvenex.app']

function extractSubdomainSlug(host: string): string | null {
  for (const domain of MAIN_DOMAINS) {
    const suffix = `.${domain}`
    if (host.endsWith(suffix)) {
      const subdomain = host.slice(0, -suffix.length)
      if (subdomain && !subdomain.includes('.')) {
        return subdomain
      }
    }
  }
  return null
}

function extractPathSlug(pathname: string): string | null {
  const match = pathname.match(/^\/org\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/)
  return match ? match[1] : null
}

/**
 * Builds a Content-Security-Policy header value.
 * NOTE: nonce-based + strict-dynamic CSP requires every page to be dynamically
 * rendered AND Next.js to read CSP from the request headers — see
 * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
 * Until the app is migrated to full dynamic rendering, fall back to
 * 'self' + 'unsafe-inline' so Next.js inline runtime/hydration scripts load.
 */
function buildCsp(): string {
  return [
    "default-src 'self'",
    // Allow self-hosted bundles plus Next.js inline runtime/hydration scripts.
    // PrescribeRx is whitelisted so the telehealth intake auto-resize script
    // (https://prescribe-rx.com/embed/resize.js) can load. LeadConnector hosts
    // the GHL chat/tracking widget.
    // Tapfiliate hosts the affiliate tracking script (script.tapfiliate.com).
    // Metricool hosts the site-analytics tracker (tracker.metricool.com/resources/be.js).
    // Stripe: js.stripe.com serves Stripe.js, which mounts the PaymentElement
    // used by the store checkout. Card data is entered in Stripe's iframe and
    // never touches our origin.
    "script-src 'self' 'unsafe-inline' https://prescribe-rx.com https://*.leadconnectorhq.com https://*.tapfiliate.com https://tracker.metricool.com https://js.stripe.com https://maps.googleapis.com https://maps.gstatic.com",
    // Next.js injects critical inline styles; unsafe-inline is acceptable
    // for style-src since CSS cannot execute arbitrary JS.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.leadconnectorhq.com",
    // Tightened: only whitelisted origins instead of wildcard https:
    "img-src 'self' data: https://*.supabase.co https://*.supabase.in https://*.juvenex.space https://*.juvenex.app https://*.leadconnectorhq.com https://prescribe-rx-product-assets.s3.amazonaws.com https://*.tapfiliate.com https://tracker.metricool.com blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    // The landing hero scrubs its videos by seeking, which only works reliably
    // once the file is local — so the clips are fetched and attached as
    // blob: URLs. Without an explicit media-src this falls back to default-src
    // 'self', which rejects blob: and leaves the <video> permanently empty.
    "media-src 'self' blob: data:",
    [
      "connect-src 'self'",
      'https://*.supabase.co',
      'https://api.anthropic.com',
      'https://api.x.ai',
      'https://api.stripe.com',
      // WhiteLabelMD createOrder_test / check_coupons (IdunRX-style direct browser calls)
      'https://panel.whitelabelmd.com',
      'https://maps.googleapis.com',
      'https://maps.gstatic.com',
      'https://*.googleapis.com',
      'https://*.gstatic.com',
      'https://*.leadconnectorhq.com',
      'wss://*.leadconnectorhq.com',
      // Tapfiliate: the v3 tracking script beacons click/detect events to
      // frstre.com (its "first-referrer" host), NOT tapfiliate.com — without
      // this, referral attribution is silently CSP-blocked.
      'https://*.tapfiliate.com',
      'https://frstre.com',
      'https://*.frstre.com',
      // Metricool: be.js beacons pageview/session hits back to its own host.
      'https://tracker.metricool.com',
    ].join(' '),
    // PrescribeRx hosts the telehealth intake iframe embedded on /telehealth.
    // 'self' allows the same-origin proxy at /api/intake-proxy/* to render
    // the intake when PrescribeRx CSP frame-ancestors blocks direct embed.
    // Stripe frames the PaymentElement from js.stripe.com and runs 3-D Secure
    // challenges from hooks.stripe.com; both must be frameable or the card
    // field renders blank and SCA cannot complete.
    // Post-checkout clinical intake embeds WLMD/Jotform directly in /store/intake.
    "frame-src 'self' https://prescribe-rx.com https://forms.whitelabelmd.com https://*.jotform.com https://jotform.com https://*.leadconnectorhq.com https://js.stripe.com https://hooks.stripe.com",
    // Prevent this page from being framed by any origin (modern X-Frame-Options equivalent).
    "frame-ancestors 'none'",
    // Authorize.net hosted checkout posts a payment token from our redirect
    // shim to their hosted form. Card data is entered on Authorize.net.
    "form-action 'self' https://accept.authorize.net https://test.authorize.net",
    "object-src 'none'",
    "base-uri 'self'",
    // upgrade-insecure-requests only on HTTPS deployments. On HTTP-only dev
    // origins it would cause assets to fail with ERR_SSL_PROTOCOL_ERROR.
    ...((process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://') ? ["upgrade-insecure-requests"] : []),
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static assets — CSP is not needed on binary/static responses.
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Intake proxy: framed by /telehealth (same-origin). Skip middleware CSP so
  // our own frame-ancestors 'none' does not block the embed. The route handler
  // already strips upstream CSP/X-Frame-Options.
  if (pathname.startsWith('/api/intake-proxy/')) {
    return NextResponse.next()
  }

  // Image proxy: base64url paths contain no dot, so the static-asset skip above
  // misses them and the no-store override below would clobber the route's own
  // `public, max-age=86400` header — forcing every product thumbnail to
  // re-fetch origin→S3 on every shop view. Let the route's cache header stand.
  if (pathname.startsWith('/api/img/')) {
    return NextResponse.next()
  }

  // Generate a per-request nonce: 128 bits of hex (no hyphens).
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const csp = buildCsp()

  // Forward nonce to server components via request header.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  // Set security headers on the response.
  response.headers.set('content-security-policy', csp)
  // Expose the nonce so server components can read it from response headers.
  response.headers.set('x-nonce', nonce)
  // This is a user-facing app, not a static marketing export. Long-lived HTML
  // caching leaves browsers with stale Next/RSC action ids after deploys, which
  // shows up as intermittent 404s while using the app. Static hashed assets
  // are skipped above and can keep their immutable cache behavior.
  response.headers.set(
    'cache-control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  )
  response.headers.set('pragma', 'no-cache')
  response.headers.set('expires', '0')

  const host = request.headers.get('host') ?? ''

  // Organization resolution via subdomain
  const subSlug = extractSubdomainSlug(host)
  if (subSlug) {
    response.headers.set('x-organization-slug', subSlug)
  }

  // Organization resolution via path prefix /org/[slug]
  const pathSlug = extractPathSlug(pathname)
  if (pathSlug) {
    response.headers.set('x-organization-slug', pathSlug)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
