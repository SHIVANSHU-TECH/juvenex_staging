'use client'

import { useEffect } from 'react'

// Thoroughly-detailed client-side error reporter. Captures EVERY client error
// — uncaught exceptions, unhandled promise rejections, failed resource loads,
// and console.error calls — and ships them to /api/client-error (logged + saved
// to public.client_errors with the user when authenticated). The app had NO
// client error visibility before this; now every browser-side failure is known.
//
// Safeguards: installs once; dedupes identical errors; caps reports per page
// load (a looping error can't flood); filters benign/third-party noise; never
// throws from within the handlers (and never reports its own network failure).

type ErrorType = 'error' | 'unhandledrejection' | 'resource' | 'console' | 'manual'

interface Payload {
  type: ErrorType
  message: string
  stack?: string | null
  source?: string | null
  lineno?: number | null
  colno?: number | null
  pageUrl?: string
  userAgent?: string
  release?: string
  extra?: Record<string, unknown>
}

let installed = false

// Hosts whose errors are NOT ours (third-party widgets/beacons) — skip to keep
// the signal high. (Tapfiliate's beacon, LeadConnector widget, etc.)
const NOISE = [
  'frstre.com',
  'tapfiliate.com',
  'leadconnectorhq.com',
  'script.tapfiliate',
  // Third-party marketing/pixel scripts injected by in-app browsers
  // (Instagram/Facebook link-in-bio) — their load failures aren't our bugs.
  'connect.facebook.net',
  'facebook.net',
  'fbevents',
  'pcm.js',
]
// Known-benign messages that browsers fire spuriously.
const BENIGN = ['ResizeObserver loop', 'ResizeObserver loop completed']

function buildId(): string | undefined {
  try {
    const d = (window as unknown as { __NEXT_DATA__?: { buildId?: string } }).__NEXT_DATA__
    return d?.buildId
  } catch {
    return undefined
  }
}

function install() {
  if (installed || typeof window === 'undefined') return
  installed = true

  const seen = new Set<string>()
  let sent = 0
  const MAX = 40 // per page load

  const send = (p: Payload) => {
    try {
      const text = `${p.type}|${p.message}|${p.source ?? ''}|${p.lineno ?? ''}`
      if (NOISE.some((n) => text.includes(n))) return
      if (BENIGN.some((b) => p.message.includes(b))) return
      if (seen.has(text)) return // dedupe identical
      seen.add(text)
      if (sent >= MAX) return
      sent += 1

      const full: Payload = {
        ...p,
        message: p.message.slice(0, 4000),
        stack: p.stack ? String(p.stack).slice(0, 16000) : undefined,
        pageUrl: typeof location !== 'undefined' ? location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        release: buildId(),
      }
      // fetch with keepalive so the auth token (attached by the global fetch
      // patch to /api/* calls) is included and the report survives unload.
      void fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(full),
        keepalive: true,
      }).catch(() => {
        /* never let reporting failures cascade */
      })
    } catch {
      /* swallow — the reporter must never throw */
    }
  }

  // 1) Uncaught JS errors AND resource-load failures (capture phase catches the
  //    latter, whose target is the failing element rather than an Error).
  window.addEventListener(
    'error',
    (event: Event) => {
      const e = event as ErrorEvent
      const target = event.target as (HTMLElement & { src?: string; href?: string }) | null
      if (target && target !== (window as unknown as EventTarget) && (target.src || target.href)) {
        send({
          type: 'resource',
          message: `Failed to load ${target.tagName?.toLowerCase?.() ?? 'resource'}: ${target.src || target.href}`,
          source: target.src || target.href || null,
        })
        return
      }
      send({
        type: 'error',
        message: e.message || 'Uncaught error',
        stack: e.error?.stack ?? null,
        source: e.filename ?? null,
        lineno: e.lineno ?? null,
        colno: e.colno ?? null,
      })
    },
    true
  )

  // 2) Unhandled promise rejections.
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : (() => {
              try {
                return JSON.stringify(reason)
              } catch {
                return String(reason)
              }
            })()
    send({
      type: 'unhandledrejection',
      message: message || 'Unhandled promise rejection',
      stack: reason instanceof Error ? (reason.stack ?? null) : null,
    })
  })

  // 3) console.error — many app-level failures are surfaced this way
  //    (e.g. "fetchFeed failed"). Wrap once, preserving original behavior.
  try {
    const orig = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      try {
        const message = args
          .map((a) =>
            a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : (() => {
              try {
                return JSON.stringify(a)
              } catch {
                return String(a)
              }
            })()
          )
          .join(' ')
          .slice(0, 4000)
        const stack = args.find((a) => a instanceof Error) as Error | undefined
        if (message) send({ type: 'console', message, stack: stack?.stack ?? null })
      } catch {
        /* ignore */
      }
      orig(...args)
    }
  } catch {
    /* console wrap is best-effort */
  }
}

export default function ClientErrorReporter() {
  useEffect(() => {
    install()
  }, [])
  return null
}
