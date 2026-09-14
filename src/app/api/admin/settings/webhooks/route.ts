import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import { getGlobalPrescribeRxConfig } from '@/lib/prescriberx-config'

// GET / POST /api/admin/settings/webhooks
//
// Thin proxy over PrescribeRx /webhooks for the admin Settings tab.
//
// GET  → list subscriptions (per_page=50, no client filter — show everything
//        the token can see).
// POST → create a subscription. The PrescribeRx response body INCLUDES the
//        signing `secret` exactly once; we forward the full body to the
//        client so the modal can present it for one-shot copy. We do NOT
//        persist the secret server-side.
//
// Auth: super_admin only. Audit-logged on create.

const FETCH_TIMEOUT_MS = 10_000

const SUBSCRIBER_TYPES = [
  'client',
  'sales_organization',
  'telehealth_company',
] as const

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    url: z
      .string()
      .url()
      .refine((u) => u.startsWith('https://'), {
        message: 'URL must use https://',
      })
      .max(500),
    subscriber_type: z.enum(SUBSCRIBER_TYPES),
    subscriber_id: z.string().uuid(),
    events: z
      .array(z.string().min(1).max(80))
      .min(1, 'Select at least one event')
      .max(60),
    is_active: z.boolean().default(true),
  })
  .strict()

type CreateBody = z.infer<typeof createSchema>

async function requireSuperAdmin() {
  const user = await getAuthUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  if (user.role !== 'super_admin') {
    return { error: 'Forbidden: super_admin role required', status: 403 as const }
  }
  return { user }
}

async function callPrescribeRx(
  path: string,
  init: RequestInit
): Promise<{ status: number; bodyText: string; ok: boolean }> {
  const config = getGlobalPrescribeRxConfig()
  if (!config) {
    return {
      status: 503,
      bodyText: '{"error":"prescriberx_not_configured"}',
      ok: false,
    }
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${config.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    })
    const bodyText = await res.text().catch(() => '')
    return { status: res.status, bodyText, ok: res.ok }
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireSuperAdmin()
    if ('error' in auth) {
      return Response.json(
        { success: false, error: auth.error },
        { status: auth.status }
      )
    }

    const rl = rateLimit(`admin-settings-webhooks-list:${auth.user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const result = await callPrescribeRx('/webhooks?per_page=50', { method: 'GET' })
    if (!result.ok) {
      logger.error('admin/settings/webhooks list upstream error', {
        status: result.status,
        body: result.bodyText.slice(0, 500),
      })
      return Response.json(
        {
          success: false,
          error: `PrescribeRx returned HTTP ${result.status}`,
        },
        { status: 502 }
      )
    }
    let upstream: unknown
    try {
      upstream = JSON.parse(result.bodyText)
    } catch {
      return Response.json(
        { success: false, error: 'Invalid response from PrescribeRx' },
        { status: 502 }
      )
    }
    return Response.json({ success: true, data: upstream })
  } catch (error: unknown) {
    logger.error('admin/settings/webhooks GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin()
    if ('error' in auth) {
      return Response.json(
        { success: false, error: auth.error },
        { status: auth.status }
      )
    }

    const rl = rateLimit(`admin-settings-webhooks-create:${auth.user.id}`, 10, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return Response.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      )
    }
    const parsed = createSchema.safeParse(raw)
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: 'Invalid webhook payload',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }
    const body: CreateBody = parsed.data

    const result = await callPrescribeRx('/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!result.ok) {
      logger.error('admin/settings/webhooks create upstream error', {
        status: result.status,
        body: result.bodyText.slice(0, 500),
        url: body.url,
      })
      return Response.json(
        {
          success: false,
          error: `PrescribeRx returned HTTP ${result.status}`,
        },
        { status: 502 }
      )
    }

    let upstream: unknown
    try {
      upstream = JSON.parse(result.bodyText)
    } catch {
      return Response.json(
        { success: false, error: 'Invalid response from PrescribeRx' },
        { status: 502 }
      )
    }

    // Audit-log the creation with the URL (NOT the secret) so we can trace
    // who added a receiver later.
    await logAudit({
      userId: auth.user.id,
      action: 'prescriberx_webhook_create',
      resourceType: 'prescriberx_webhook',
      details: {
        name: body.name,
        url: body.url,
        subscriber_type: body.subscriber_type,
        subscriber_id: body.subscriber_id,
        event_count: body.events.length,
      },
    })

    return Response.json({ success: true, data: upstream })
  } catch (error: unknown) {
    logger.error('admin/settings/webhooks POST error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
