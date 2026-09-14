import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getGlobalPrescribeRxConfig } from '@/lib/prescriberx-config'

// GET /api/admin/settings/health
//
// Aggregated health check used by the Settings tab. Returns the status of:
//   - Supabase: a lightweight HEAD-style count against `organizations`
//   - PrescribeRx API: a `/me` ping (5s timeout)
//   - Webhook receiver: derived URL + secret-presence flag (no network call)
//
// Auth: super_admin only.
// Rate limit: 30/min/user (mount auto-refresh + manual retry).

const FETCH_TIMEOUT_MS = 5_000

interface HealthCheck {
  ok: boolean
  error?: string
}

interface WebhookReceiverHealth {
  url: string
  has_secret: boolean
}

async function checkSupabase(): Promise<HealthCheck> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .limit(1)
    if (error) {
      logger.error('admin/settings/health supabase check failed', {
        error: error.message,
      })
      return { ok: false, error: 'Supabase query failed' }
    }
    return { ok: true }
  } catch (err: unknown) {
    logger.error('admin/settings/health supabase check threw', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: 'Supabase client error' }
  }
}

async function checkPrescribeRx(): Promise<HealthCheck> {
  const config = getGlobalPrescribeRxConfig()
  if (!config) {
    return { ok: false, error: 'Not configured' }
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
    if (!res.ok) {
      logger.error('admin/settings/health prescriberx non-200', {
        status: res.status,
      })
      return { ok: false, error: `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    logger.error('admin/settings/health prescriberx check failed', {
      error: err instanceof Error ? err.message : String(err),
      timeout: isAbort,
    })
    return {
      ok: false,
      error: isAbort ? 'Timeout (5s)' : 'Network error',
    }
  } finally {
    clearTimeout(timeout)
  }
}

function computeWebhookReceiver(): WebhookReceiverHealth {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
  const url = base ? `${base}/api/webhooks/prescriberx` : '/api/webhooks/prescriberx'
  const hasSecret = Boolean(
    process.env.PRESCRIBERX_WEBHOOK_SECRET &&
      process.env.PRESCRIBERX_WEBHOOK_SECRET.length > 0
  )
  return { url, has_secret: hasSecret }
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

    const rl = rateLimit(`admin-settings-health:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    // Run the two network-bound checks in parallel — they're independent.
    const [supabase, prescriberx] = await Promise.all([
      checkSupabase(),
      checkPrescribeRx(),
    ])
    const webhook_receiver = computeWebhookReceiver()

    return Response.json({
      success: true,
      data: { supabase, prescriberx, webhook_receiver },
    })
  } catch (error: unknown) {
    logger.error('admin/settings/health error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
