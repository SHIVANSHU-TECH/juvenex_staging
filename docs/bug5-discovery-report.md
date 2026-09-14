# QA Bug 5 Follow-up — Discovery Report (read-only)

Discovery complete — no edits made. Everything below is read-only findings, verified against the live server where possible.

## TL;DR

**All 20 shop products hit the `<img>` proxy branch — the `<Image>` branch is dead code for the current catalog** (that's why the previous fill+sizes fix changed nothing). The upstream assets are NOT low-res (750–1536px, crisp when viewed at native size). Both symptoms come from `aspect-square` + `object-cover` on a catalog where **half the images aren't square**: 3 "pen" products are extreme 830×195 banners that object-cover upscales ~3.5× and crops to their middle 23% (catastrophic blur — I confirmed this visually on live juvenex.app), 5 are 1536×1024 landscape (cropped ⅓ horizontally), 2 are 1000×1500 portrait (cropped ⅓ vertically — QA's "cut in half" CJC screenshot). **I verified live that Next's optimizer handles the proxy URL correctly**, so I recommend **Approach 1**.

---

## (a) Branch decision

From `src/app/shop/page.tsx:899-900`:

```tsx
const imageSrc = proxyImageUrl(product.image_url, product);
const isProxiedOrPlaceholder = imageSrc.startsWith('/api/img/') || imageSrc.startsWith('data:');
```

The feeding helper (`src/app/shop/page.tsx:154-173`):

```tsx
function proxyImageUrl(rawUrl: string | null | undefined, product?: Product): string {
  if (!rawUrl) return fallbackProductImage(product);        // → data: SVG placeholder
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return fallbackProductImage(product); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return fallbackProductImage(product);
  }
  if (hostMatchesSuffix(parsed.hostname, SAFE_IMAGE_HOST_SUFFIXES)) {
    return rawUrl;                                          // → <Image> branch
  }
  if (PROXIED_IMAGE_HOSTS.has(parsed.hostname)) {
    return `/api/img/${base64UrlEncode(rawUrl)}`;           // → <img> proxy branch
  }
  return fallbackProductImage(product);
}
```

with `SAFE_IMAGE_HOST_SUFFIXES = ['.supabase.co', '.supabase.in', '.juvenex.app']` and `PROXIED_IMAGE_HOSTS = {'prescribe-rx-product-assets.s3.amazonaws.com'}` (lines 50–60).

**CJC-Ipamorelin walk-through:** there are 5 CJC/Ipamorelin products in the live catalog (pulled from `GET /api/shop/products` on this box). All have `image_url` on `prescribe-rx-product-assets.s3.amazonaws.com` → `PROXIED_IMAGE_HOSTS` match → `/api/img/<base64url>` → **`<img>` proxy branch**.

**Catalog split: 20 of 20 products are PRX S3 — 100% `<img>` branch, 0% `<Image>` branch.** Not roughly 50/50, all one branch. QA's "not just PRX" framing is inverted — everything on /shop is PRX. This also explains why the previous fix (fill + sizes on the `<Image>` branch) had zero visible effect: it patched a branch nothing renders through.

Both branches use `object-cover` inside the `aspect-square` card frame (`src/app/shop/page.tsx:912-923`).

## (b) Proxy handler — `src/app/api/img/[...path]/route.ts`

Full file is in the appendix at the bottom. Behavior:

- **Upstream:** allowlisted to exactly `prescribe-rx-product-assets.s3.amazonaws.com` (SSRF guard); https only; at most one redirect hop, re-validated against the same allowlist.
- **Transformation: none. Pure streaming pass-through.** No resize, no format conversion, no quality change — just a 10 MiB size cap (Content-Length pre-check + streaming byte counter) and a 10s timeout.
- **Query params: none.** The base64url-encoded upstream URL is the first path segment (max 8192 chars); extra segments are ignored (cache-key salt only). There is no `?w=` or similar.
- **Response headers:** forwards only `Content-Type` (default `image/webp` if missing) and `ETag`; strips `x-amz-*`, `server`, `via`, etc.; sets `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`. Errors are `no-store` and collapse to opaque 404/502/504.
- Per-key in-flight dedup of concurrent upstream fetches; GET only (other verbs 405).

## (c) next/image on same-origin URLs — verified live, it works

Root-relative `src` strings bypass `remotePatterns` entirely (that config only governs remote hosts). Next 16's gate for local paths is `images.localPatterns`, which **is not set** in `next.config.ts` → all local paths are optimizable. No auth issue: the proxy requires no cookies (my curl with zero cookies got 200).

I spot-checked against the **running production server** rather than trusting the docs:

```
GET /_next/image?url=%2Fapi%2Fimg%2F<2530-char payload>&w=640&q=75
→ 200, resized to 640×960
```

(jpeg only because curl sent no `Accept` header; browsers get webp/avif.) So Approach 1's key assumption holds on this exact build. Two Next 16 notes from `node_modules/next/dist/docs`: `images.qualities` now defaults to `[75]` and rejects other `quality` values — q=75 works (verified), so don't pass a custom `quality` prop; and the ~2.6KB optimizer URL is well within header limits.

**One caveat worth knowing (pre-existing, not this bug):** the PRX `image_url`s are 1-hour presigned S3 URLs re-signed on every catalog fetch, so the `/api/img/<payload>` cache key rotates every page load. The proxy file's comment about the edge cache "defeating the 1-hour TTL" doesn't hold — the cache key itself rotates. Under Approach 1 the optimizer will therefore re-encode per visit (cheap with sharp at 20 products, but a stable proxy key — e.g. keyed on product id — would be a worthwhile follow-up).

## (d) sharp

Installed: `node_modules/sharp` **0.34.5**. Nothing to install — and the optimizer demonstrably uses it (the live spot check above returned a correctly resized image).

## (e) Upstream asset check

`curl -I` (HEAD) returns **403** on the presigned URLs — the signature covers GET only, so header-only probes lie. GET works fine:

| Asset | Content-Type | Bytes |
|---|---|---|
| CJC-1295/Ipamorelin 10ML Vial (PRX) | image/webp | 26,160 |
| Semaglutide+Glycine 1ml vial (PRX) | image/webp | 27,984 |
| Ipamorelin 10MG Lyophilized (PRX) | image/webp | 17,194 |

All 20 are 5.6–31KB webp. Small byte counts, but that's aggressive webp compression, not low resolution (see f) — I rendered the semaglutide portrait at native 1000×1500 and it's crisp, professional product photography. There are no Supabase-hosted product images to compare — the catalog is 100% PRX.

Raw HEAD-vs-GET evidence:

```
=== img0: cjc-1295ipamorelin-11-mgml-10ml-vial-1774675835.webp
HTTP/1.1 403 Forbidden
Content-Type: application/xml
=== img1: ipamorelin-10mg-lyophiliozed-1776071527.webp
HTTP/1.1 403 Forbidden
Content-Type: application/xml
=== img2: semaglutideglycine-1005-mgml-1ml-vial-1779070135.webp
HTTP/1.1 403 Forbidden
Content-Type: application/xml
-rw-r--r-- 1 root root 26160 Jul 18 00:27 img0.webp
-rw-r--r-- 1 root root 17194 Jul 18 00:27 img1.webp
-rw-r--r-- 1 root root 27984 Jul 18 00:27 img2.webp
```

## (f) Intrinsic dimensions — all 20 products (via sharp)

```
750x750    ar=1.00   12556B | Anastrozole Capsule .25mg
750x750    ar=1.00   12556B | Anastrozole Tablet .5mg
830x195    ar=4.26    6646B | CJC (no DAC)/Ipamorelin 10/10mg 3mL Pen (3.33mg/mL)
1536x1024  ar=1.50   26160B | CJC-1295/Ipamorelin 1/1 mg/ml (10ML Vial)
1024x1024  ar=1.00   19752B | CJC-No-DAC-10MG/Ipamorelin- 10MG Lyophilized
750x750    ar=1.00   12914B | Enclomiphene Flex-Dose Tablet 12.5mg
750x750    ar=1.00   12914B | Enclomiphene Flex-Dose Tablet 25mg
1536x1024  ar=1.50   23930B | Ipamorelin 1 mg/ml (10ML Vial)
1024x1024  ar=1.00   17194B | Ipamorelin 10MG Lyophilized
1024x1024  ar=1.00   17114B | NAD+ - 1000MG Lyophilized
1024x1024  ar=1.00   16644B | NAD+ - 500MG Lyophilized
1536x1024  ar=1.50   31020B | NAD+ 1000mg (100mg/ml 10ml vial)
830x195    ar=4.26    5824B | NAD+ 1000mg 3mL Pen (333mg/mL)
830x195    ar=4.26    5656B | PT-141 10mg 3mL Pen(3.33mg/mL)
1024x1024  ar=1.00   15930B | PT-141 10MG Lyophilized
1536x1024  ar=1.50   26726B | PT-141 20mg (2mg/ml 10ml vial)
1536x1024  ar=1.50   23730B | Selank 10mg (1mg/ml) 10ml
1024x1024  ar=1.00   16762B | Selank 10MG Lyophilized
1000x1500  ar=0.67   27984B | Semaglutide + Glycine 10mg/0.5mg/mL (1ml vial)
1000x1500  ar=0.67   27158B | Semaglutide + Glycine 1mg/0.5mg/mL (1ml vial)
```

- **10 square** — 750×750 (×4: Anastrozole, Enclomiphene) and 1024×1024 (×6: lyophilized vials)
- **5 landscape 1536×1024** (ar 1.5) — the 10ML vial photos, incl. CJC-1295/Ipamorelin
- **3 extreme banner 830×195** (ar 4.26) — the 3mL Pen products
- **2 portrait 1000×1500** (ar 0.67) — the Semaglutide+Glycine vials

So "portrait" is NOT universal — it's a mixed catalog, half non-square. I also screenshotted live juvenex.app/shop at 2× DPR: the square images render acceptably; the **pen banners are destroyed** — object-cover scales the 195px-tall strip up ~3.5× to fill the square and shows only the middle ~23% (a blurry "CJC-IP…" fragment); the landscape vials lose ⅓ of their width; the portraits lose ⅓ of their height (QA's "cut in half" CJC screenshot is one of these two mechanisms).

## (g) Recommendation: Approach 1 — with the risky assumption now verified

- The blur is a **rendering strategy problem** (cover-upscaling of non-square sources), not upstream quality → Approach 3's "flag for content team" premise is wrong, and it would leave the pens blurry.
- Approach 1's only stated risk — "does the optimizer handle the proxy URL?" — I verified live with an actual resized 200 response. That removes the reason to prefer Approach 2, which would re-implement with sharp what the built-in optimizer already does, inside a security-hardened route we'd rather not complicate.

Concretely, when you give the go-ahead:
1. `object-cover` → `object-contain` in **both** branches (`page.tsx:921` and `:923`). The card already has a gradient background and centered flex, so contained images sit naturally. This alone fixes the crop on all 10 non-square products AND the pen blur (contain downscales the 830px-wide banner instead of upscaling it).
2. Split the `<img>` branch: `data:` placeholders stay a plain `<img>` (next/image can't take arbitrary data: URLs); `/api/img/...` URLs move to `<Image fill sizes="(min-width:1280px) 25vw, ...">` matching the existing grid breakpoints — DPR-correct srcset for free, removing residual hi-DPR softness on the square/heavily-compressed assets.
3. Verify on live juvenex.app via the Chromium harness (pens, portrait semaglutide, squares) before calling it done.

Known trade-off to accept (or fix later): presigned-URL rotation means optimizer cache misses per visit — first paint per session does 20 small sharp encodes server-side; a stable proxy cache key is a clean follow-up if we care.

---

## Appendix — full `src/app/api/img/[...path]/route.ts`

```ts
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
```
