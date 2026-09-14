/**
 * Allowlist of hostnames we permit for user-supplied image/logo URLs.
 *
 * Why: Any URL stored and later fetched by Next.js image optimisation (or
 * rendered directly) is a potential SSRF surface. Without a domain allowlist
 * a hostile user can POST an image_url pointing at an internal address
 * (e.g. http://169.254.169.254/ metadata, localhost:3001 internal endpoints)
 * and the server will happily fetch it.
 *
 * Prefer uploading to our own Supabase bucket when possible; external CDNs
 * are only allowed when we've explicitly vetted them.
 */
const ALLOWED_HOSTS: readonly string[] = [
  'sbjcztlplbzcsyvljouf.supabase.co',
  'sbjcztlplbzcsyvljouf.supabase.in',
]

const ALLOWED_SUFFIXES: readonly string[] = [
  '.supabase.co',
  '.supabase.in',
  '.juvenex.space',
  // Legacy domain — existing stored URLs still point here.
  '.juvenex.app',
]

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (ALLOWED_HOSTS.includes(h)) return true
  return ALLOWED_SUFFIXES.some((suffix) => h.endsWith(suffix))
}

export function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    if (!isAllowedHost(url.hostname)) return false
    return true
  } catch {
    return false
  }
}

export const IMAGE_URL_ALLOWLIST_MESSAGE =
  'Image URL must be hosted on an approved domain (Supabase storage).'
