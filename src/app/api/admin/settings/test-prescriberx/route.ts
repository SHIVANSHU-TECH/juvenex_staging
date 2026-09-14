import { type NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getGlobalPrescribeRxConfig } from '@/lib/prescriberx-config'

// POST /api/admin/settings/test-prescriberx
//
// Pings PrescribeRx `/me` with the configured token and returns a sanitized
// success/error envelope. Used by the Settings tab "Test connection" button.
//
// Auth: super_admin only.
// Rate limit: 10 calls/min/user — humans clicking a button, not a service.

const FETCH_TIMEOUT_MS = 5_000

interface MePayload {
  ok: boolean
  name?: string
  email?: string
  sales_org_name?: string | null
}

function parseMe(json: unknown): MePayload {
  if (typeof json !== 'object' || json === null) {
    return { ok: false }
  }
  const root = json as Record<string, unknown>
  const data = (root.data ?? {}) as Record<string, unknown>
  // PrescribeRx returns `{ success, data: { user: {...}, abilities: [...] } }`
  // for /auth/me and `{ success, data: {...profile} }` for /me. We support
  // both shapes defensively — never trust upstream wire format strictly.
  const user = (data.user ?? data) as Record<string, unknown>
  const name = typeof user.name === 'string' ? user.name : undefined
  const email = typeof user.email === 'string' ? user.email : undefined
  const orgName = typeof user.sales_organization_name === 'string'
    ? user.sales_organization_name
    : null
  return { ok: true, name, email, sales_org_name: orgName }
}

export async function POST(_request: NextRequest) {
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

    const rl = rateLimit(`admin-settings-test-prx:${user.id}`, 10, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const config = getGlobalPrescribeRxConfig()
    if (!config) {
      return Response.json(
        {
          success: false,
          error:
            'PrescribeRx is not configured (missing PRESCRIBERX_API_BASE or PRESCRIBERX_API_TOKEN)',
        },
        { status: 503 }
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(`${config.base}/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      })
      const bodyText = await res.text().catch(() => '')
      if (!res.ok) {
        // Log full body internally; never echo upstream body to client to
        // avoid leaking internal error details / token-shaped strings.
        logger.error('admin/settings/test-prescriberx upstream error', {
          status: res.status,
          body: bodyText.slice(0, 500),
        })
        return Response.json(
          {
            success: false,
            error: `PrescribeRx returned HTTP ${res.status}`,
          },
          { status: 502 }
        )
      }
      let json: unknown = null
      try {
        json = JSON.parse(bodyText)
      } catch {
        json = null
      }
      const me = parseMe(json)
      return Response.json({
        success: true,
        data: { ...me, ok: true },
      })
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      logger.error('admin/settings/test-prescriberx fetch failed', {
        error: err instanceof Error ? err.message : String(err),
        timeout: isAbort,
      })
      return Response.json(
        {
          success: false,
          error: isAbort
            ? 'PrescribeRx /me timed out after 5s'
            : 'Network error reaching PrescribeRx',
        },
        { status: 502 }
      )
    } finally {
      clearTimeout(timeout)
    }
  } catch (error: unknown) {
    logger.error('admin/settings/test-prescriberx error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
