import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import { getGlobalPrescribeRxConfig } from '@/lib/prescriberx-config'

// DELETE /api/admin/settings/webhooks/[subscription]
//
// Proxies DELETE to PrescribeRx /webhooks/{subscription}. UUID-validated path
// param. Audit-logged.
//
// Auth: super_admin only.

const FETCH_TIMEOUT_MS = 10_000
const SUBSCRIPTION_ID = z.string().uuid()

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ subscription: string }> }
) {
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

    const rl = rateLimit(`admin-settings-webhooks-delete:${user.id}`, 20, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const { subscription: rawId } = await params
    const idCheck = SUBSCRIPTION_ID.safeParse(rawId)
    if (!idCheck.success) {
      return Response.json(
        { success: false, error: 'Invalid subscription id' },
        { status: 400 }
      )
    }
    const subId = idCheck.data

    const config = getGlobalPrescribeRxConfig()
    if (!config) {
      return Response.json(
        { success: false, error: 'PrescribeRx not configured' },
        { status: 503 }
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(`${config.base}/webhooks/${subId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      })
      const bodyText = await res.text().catch(() => '')
      if (!res.ok) {
        logger.error('admin/settings/webhooks DELETE upstream error', {
          status: res.status,
          body: bodyText.slice(0, 500),
          subscription_id: subId,
        })
        return Response.json(
          {
            success: false,
            error: `PrescribeRx returned HTTP ${res.status}`,
          },
          { status: res.status === 404 ? 404 : 502 }
        )
      }

      await logAudit({
        userId: user.id,
        action: 'prescriberx_webhook_delete',
        resourceType: 'prescriberx_webhook',
        resourceId: subId,
      })

      return Response.json({ success: true, data: { id: subId } })
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      logger.error('admin/settings/webhooks DELETE fetch failed', {
        error: err instanceof Error ? err.message : String(err),
        subscription_id: subId,
        timeout: isAbort,
      })
      return Response.json(
        {
          success: false,
          error: isAbort ? 'PrescribeRx delete timed out' : 'Network error',
        },
        { status: 502 }
      )
    } finally {
      clearTimeout(timeout)
    }
  } catch (error: unknown) {
    logger.error('admin/settings/webhooks DELETE error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
