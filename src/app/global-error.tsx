'use client'

// Root-level error boundary. Unlike error.tsx (which catches route-segment
// render errors inside the app layout), global-error.tsx replaces the ROOT
// layout when it or a top-level provider throws — so it must render its own
// <html>/<body>. Uses inline styles so the branded fallback renders even if the
// app stylesheet never loaded (a true root failure). Prevents Next's bare
// unbranded "Internal Server Error" page from ever showing (App Store 2.1).

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Best-effort client log; never throw from the error page itself.
    try {
      // eslint-disable-next-line no-console
      console.error('global-error boundary', error?.digest, error?.message)
    } catch {
      /* noop */
    }
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAF9F6',
          color: '#2D352C',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: '32px',
        }}
      >
        <div style={{ maxWidth: '360px', textAlign: 'center' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 20px',
              borderRadius: '9999px',
              background: '#EEF1ED',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '30px',
            }}
            aria-hidden="true"
          >
            {'⚠️'}
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: '15px',
              lineHeight: 1.5,
              color: '#6B7567',
              margin: '0 0 24px',
            }}
          >
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              minHeight: '48px',
              padding: '0 28px',
              borderRadius: '12px',
              border: 'none',
              background: '#3A5A40',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
