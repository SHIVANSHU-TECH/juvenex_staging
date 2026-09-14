/**
 * Single source of truth for the Next.js `basePath`.
 * Must stay in sync with `basePath` in `next.config.ts`.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || '/staging').replace(
  /\/$/,
  ''
)

/**
 * Prefix an app-relative path with the basePath.
 * - Leaves external URLs (http/https/mailto/tel/data/#) untouched
 * - Does not double-prefix if already under basePath
 * - Returns "/" rooted paths under basePath (e.g. `/api/x` → `/staging/api/x`)
 */
export function withBasePath(path: string): string {
  if (!path) return BASE_PATH || '/'
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('mailto:') ||
    path.startsWith('tel:') ||
    path.startsWith('data:') ||
    path.startsWith('blob:') ||
    path.startsWith('#') ||
    path.startsWith('//')
  ) {
    return path
  }

  const normalized = path.startsWith('/') ? path : `/${path}`

  if (!BASE_PATH) return normalized
  if (normalized === BASE_PATH || normalized.startsWith(`${BASE_PATH}/`)) {
    return normalized
  }
  return `${BASE_PATH}${normalized}`
}

/** Absolute app URL (origin + basePath + path) for redirects / callbacks. */
export function absoluteAppUrl(path = '/', origin?: string): string {
  const base =
    origin?.replace(/\/$/, '') ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '') ||
        'http://localhost:3000')

  // If NEXT_PUBLIC_APP_URL already includes basePath, don't double it.
  const originOnly = base.endsWith(BASE_PATH)
    ? base.slice(0, -BASE_PATH.length) || base
    : base

  return `${originOnly}${withBasePath(path)}`
}
