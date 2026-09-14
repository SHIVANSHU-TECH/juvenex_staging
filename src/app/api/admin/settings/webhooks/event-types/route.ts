import { type NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getGlobalPrescribeRxConfig } from '@/lib/prescriberx-config'

// GET /api/admin/settings/webhooks/event-types
//
// Proxies PrescribeRx /webhooks/event-types and caches the response in-process
// for 10 minutes — event catalog rarely changes and is requested on every
// "Create webhook" modal mount.
//
// Auth: super_admin only.

const FETCH_TIMEOUT_MS = 5_000
const CACHE_TTL_MS = 10 * 60 * 1000

interface CacheEntry {
  body: unknown
  expiresAt: number
}

let cache: CacheEntry | null = null
let inflight: Promise<unknown> | null = null

async function loadEventTypesUncached(): Promise<unknown> {
  const config = getGlobalPrescribeRxConfig()
  if (!config) {
    throw new Error('PrescribeRx not configured')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${config.base}/webhooks/event-types`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    const bodyText = await res.text().catch(() => '')
    if (!res.ok) {
      logger.error('admin/settings/webhooks/event-types upstream error', {
        status: res.status,
        body: bodyText.slice(0, 500),
      })
      throw new Error(`PrescribeRx returned HTTP ${res.status}`)
    }
    try {
      return JSON.parse(bodyText)
    } catch {
      throw new Error('Invalid response from PrescribeRx')
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function getEventTypes(): Promise<unknown> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.body
  if (inflight) return inflight
  inflight = loadEventTypesUncached()
    .then((body) => {
      cache = { body, expiresAt: Date.now() + CACHE_TTL_MS }
      return body
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export async function GET(_request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }
    if (user.role !== 'super_admin') {
      return Response.json(
        { success: false, error: 'Forbidden: super_admin role required' },
        { status: 403 }
      )
    }

    const rl = rateLimit(`admin-settings-event-types:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const body = await getEventTypes()
    return Response.json({ success: true, data: body })
  } catch (error: unknown) {
    logger.error('admin/settings/webhooks/event-types error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Internal server error',
      },
      { status: 502 }
    )
  }
}
