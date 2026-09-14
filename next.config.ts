import type { NextConfig } from "next";

const BASE_PATH = "/staging";

const nextConfig: NextConfig = {
  // Self-contained production server under .next/standalone (minimal node_modules).
  output: 'standalone',
  // Serve the entire app under /staging (local + checkout.juvenex.app/staging).
  basePath: BASE_PATH,
  // Expose to client bundles (fetch patch, image loader, withBasePath).
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
  // This box also serves production from `.next` (pm2 `juvenex-web`). Running a
  // dev server against the same build directory corrupts the live chunks, so
  // dev/QA runs set NEXT_DIST_DIR to an isolated folder. Unset = production.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  allowedDevOrigins: ['129.121.78.80', '81.17.96.70'],
  experimental: {
    // The worker occasionally swallows webpack diagnostics on this shared
    // server. Staging/CI can disable it explicitly without changing the
    // production default, so failures remain actionable.
    webpackBuildWorker:
      process.env.NEXT_DISABLE_WEBPACK_BUILD_WORKER === '1' ? false : undefined,
    // This app runs a proxy (src/proxy.ts), so Next buffers the request body up
    // to this limit before route handlers can read it. The default is 10MB,
    // which would silently truncate large uploads. Avatar + progress-photo
    // uploads allow up to 25MB; 30mb gives headroom for multipart overhead.
    proxyClientMaxBodySize: '30mb',
  },
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}'
    }
  },
  images: {
    loader: 'custom',
    loaderFile: './src/lib/staging-image-loader.ts',
    // PrescribeRx S3 deliberately NOT whitelisted — proxy via /api/img/[...path] instead.
    remotePatterns: [
      // User-uploaded content (progress photos, org logos, post images).
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
      // Our own domains (future signed URLs / CDN).
      { protocol: 'https', hostname: '*.juvenex.space' },
      { protocol: 'https', hostname: '*.juvenex.app' },
    ],
  },
  async redirects() {
    return [
      // No `/` → `/staging` redirect. The app lives only under basePath `/staging`.
      { source: '/app', destination: '/dashboard', permanent: false },
      { source: '/prototype', destination: '/landing', permanent: false },
      { source: '/vitalstack', destination: '/landing', permanent: false },
      { source: '/landing-new', destination: '/landing', permanent: false },
      // The storefront landing was staged at /home before it was promoted to /.
      { source: '/home', destination: '/', permanent: false },
      // The legacy PrescribeRx storefront at /shop was replaced by the
      // WhiteLabelMD storefront at /store. These are permanent (308) so
      // bookmarks, external links, and indexed search results follow through
      // instead of 404ing. The exact-match rule is listed FIRST because
      // `:id*` matches zero segments and would otherwise also claim `/shop`.
      { source: '/shop', destination: '/store', permanent: true },
      { source: '/shop/:id*', destination: '/store/:id*', permanent: true },
    ]
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        // Framing-related headers (X-Frame-Options, CSP frame-ancestors) are
        // intentionally NOT in this static fallback — they would block the
        // /api/intake-proxy reverse proxy from being framed by /telehealth.
        // The middleware (src/proxy.ts) injects a full CSP including
        // frame-ancestors on every dynamic page response, which is the
        // authoritative defense for HTML routes.
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // Allow same-origin camera/mic: the PrescribeRx ID-verification + any
        // telehealth capture runs in the same-origin proxied embed, and the
        // native app declares camera/mic usage. An empty allowlist (camera=())
        // silently blocks getUserMedia app-wide. geolocation stays denied.
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        { key: 'X-DNS-Prefetch-Control', value: 'off' },
        // HSTS only on HTTPS deployments (not HTTP-only dev). HSTS over HTTP
        // would HSTS-pin the browser to HTTPS for 2 years and break dev.
        ...((process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://') ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ]
    }]
  }
};

export default nextConfig;
