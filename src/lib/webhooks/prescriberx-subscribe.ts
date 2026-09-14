import { logger } from '@/lib/logger'

/**
 * Helper for registering a webhook subscription against PrescribeRx's admin
 * `/webhooks` endpoint. Currently NOT called from anywhere in the codebase —
 * this exists so an operator can run it manually (via a one-off node script
 * or REPL) once our PrescribeRx tier is upgraded to allow webhook subs.
 *
 * Status as of 2026-05-08: GET /webhooks returned 403 from our token, so
 * POST /webhooks almost certainly will too. Do NOT wire this into any cron
 * or startup hook until we confirm 200 from a manual call.
 *
 * Expected POST body shape (best guess based on REST conventions; revise
 * once PrescribeRx publishes their webhook docs):
 *
 *   {
 *     "url": "https://juvenex.example.com/api/webhooks/prescriberx",
 *     "event_types": ["prescription.created", "encounter.completed"],
 *     "description": "Juvenex production receiver",
 *     "secret": "<same value as PRESCRIBERX_WEBHOOK_SECRET env>"
 *   }
 *
 * The PrescribeRx server is expected to echo back the secret on every event
 * via an `X-Prescriberx-Signature` header (HMAC-SHA256 of the raw body).
 */

export interface SubscribeResult {
  ok: boolean
  status: number
  body: unknown
}

export interface SubscribeOptions {
  /** Override the API base. Defaults to PRESCRIBERX_API_BASE env. */
  baseUrl?: string
  /** Override the bearer token. Defaults to PRESCRIBERX_API_TOKEN env. */
  apiToken?: string
  /** Optional human-readable description shown in the PrescribeRx dashboard. */
  description?: string
}

export async function subscribePrescribeRxWebhook(
  eventTypes: string[],
  targetUrl: string,
  options: SubscribeOptions = {},
): Promise<SubscribeResult> {
  if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
    throw new Error('subscribePrescribeRxWebhook: eventTypes must be a non-empty array')
  }
  if (!targetUrl || !/^https?:\/\//.test(targetUrl)) {
    throw new Error('subscribePrescribeRxWebhook: targetUrl must be an absolute http(s) URL')
  }

  const baseUrl = (options.baseUrl ?? process.env.PRESCRIBERX_API_BASE ?? '').replace(/\/+$/, '')
  if (!baseUrl) throw new Error('PRESCRIBERX_API_BASE not set')

  const apiToken = options.apiToken ?? process.env.PRESCRIBERX_API_TOKEN
  if (!apiToken) throw new Error('PRESCRIBERX_API_TOKEN not set')

  const secret = process.env.PRESCRIBERX_WEBHOOK_SECRET
  if (!secret) {
    throw new Error(
      'PRESCRIBERX_WEBHOOK_SECRET must be set before subscribing — the receiver verifies signatures against it',
    )
  }

  const body = {
    url: targetUrl,
    event_types: eventTypes,
    description: options.description ?? 'Juvenex receiver',
    secret,
  }

  const res = await fetch(`${baseUrl}/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  })

  let respBody: unknown = null
  try {
    respBody = await res.json()
  } catch {
    respBody = await res.text().catch(() => null)
  }

  if (!res.ok) {
    logger.error('PrescribeRx webhook subscription failed', {
      status: res.status,
      target_url: targetUrl,
      event_types: eventTypes,
    })
  } else {
    logger.info('PrescribeRx webhook subscription succeeded', {
      status: res.status,
      target_url: targetUrl,
      event_types: eventTypes,
    })
  }

  return { ok: res.ok, status: res.status, body: respBody }
}
