'use client'

import { useEffect } from 'react'
import { BASE_PATH, withBasePath } from '@/lib/base-path'

/**
 * Rewrites same-origin relative fetches (`/api/...`, etc.) to include basePath.
 * next/link and next/router already honor basePath; raw `fetch('/api')` does not.
 */
export default function BasePathFetchPatch() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!BASE_PATH) return

    const originalFetch = window.fetch.bind(window)

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        if (typeof input === 'string') {
          if (input.startsWith('/') && !input.startsWith('//')) {
            return originalFetch(withBasePath(input), init)
          }
        } else if (input instanceof URL) {
          if (
            input.origin === window.location.origin &&
            input.pathname.startsWith('/') &&
            input.pathname !== BASE_PATH &&
            !input.pathname.startsWith(`${BASE_PATH}/`)
          ) {
            const rewritten = `${window.location.origin}${withBasePath(
              `${input.pathname}${input.search}${input.hash}`
            )}`
            return originalFetch(rewritten, init)
          }
        } else if (input instanceof Request) {
          const url = new URL(input.url)
          if (
            url.origin === window.location.origin &&
            url.pathname !== BASE_PATH &&
            !url.pathname.startsWith(`${BASE_PATH}/`)
          ) {
            const rewritten = `${url.origin}${withBasePath(
              `${url.pathname}${url.search}${url.hash}`
            )}`
            return originalFetch(new Request(rewritten, input), init)
          }
        }
      } catch {
        /* fall through to original */
      }
      return originalFetch(input, init)
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
