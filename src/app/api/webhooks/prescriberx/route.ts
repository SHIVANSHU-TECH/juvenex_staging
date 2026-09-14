import { type NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import {
  handleEncounterStatusChanged,
  handleOrderEvent,
  handlePrescriptionCreated,
  handlePrescriptionRevoked,
} from './_handlers'

// Webhook receivers MUST be dynamic — Next.js must not attempt to prerender
// or cache them. We also explicitly read the raw body as text to compute the
// HMAC signature before parsing JSON.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER = 'prescriberx'
const SIGNATURE_HEADERS = [
  // PrescribeRx uses Sanctum-style auth elsewhere; the Sanctum webhook
  // convention is X-Signature, but Laravel Spark/Cashier ships with
  // X-Webhook-Signature, and several Laravel webhook starters use
  // X-Prescriberx-Signature. We accept any of them and verify against the
  // first one that's present.
  'x-prescriberx-signature',
  'x-webhook-signature',
  'x-signature',
] as const

const OK_RESPONSE = { ok: true } as const

// ---------------------------------------------------------------------------
// Top-level event envelope
// ---------------------------------------------------------------------------

const eventEnvelopeSchema = z
  .object({
    event_id: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    event_type: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    data: z.unknown().optional(),
  })
  .passthrough()

interface NormalisedEvent {
  eventId: string
  eventType: string
  data: unknown
}

function normaliseEvent(raw: unknown): NormalisedEvent | null {
  const parsed = eventEnvelopeSchema.safeParse(raw)
  if (!parsed.success) return null
  const eventId = parsed.data.event_id ?? parsed.data.id ?? null
  const eventType = parsed.data.event_type ?? parsed.data.type ?? null
  if (!eventId || !eventType) return null
  return { eventId, eventType, data: parsed.data.data ?? raw }
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

interface SignatureCheck {
  ok: boolean
  reason?: 'missing_secret' | 'missing_header' | 'mismatch' | 'verified' | 'dev_unsigned'
}

function readSignatureHeader(request: NextRequest): string | null {
  for (const name of SIGNATURE_HEADERS) {
    const v = request.headers.get(name)
    if (v && v.length > 0) return v.trim()
  }
  return null
}

function constantTimeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'hex')
  const b = Buffer.from(bHex, 'hex')
  if (a.length === 0 || a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function verifySignature(
  rawBody: string,
  request: NextRequest,
): SignatureCheck {
  const secret = process.env.PRESCRIBERX_WEBHOOK_SECRET
  const isProd = process.env.NODE_ENV === 'production'

  if (!secret) {
    if (isProd) {
      logger.error('PRESCRIBERX_WEBHOOK_SECRET not set; refusing webhook in production')
      return { ok: false, reason: 'missing_secret' }
    }
    logger.warn('PRESCRIBERX_WEBHOOK_SECRET not set; accepting unsigned webhook (dev mode)')
    return { ok: true, reason: 'dev_unsigned' }
  }

  const header = readSignatureHeader(request)
  if (!header) {
    logger.warn('PrescribeRx webhook missing signature header')
    return { ok: false, reason: 'missing_header' }
  }

  // Some providers prefix with `sha256=`. Strip it if present.
  const provided = header.startsWith('sha256=') ? header.slice('sha256='.length) : header
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  if (!constantTimeEqualHex(provided, expected)) {
    logger.warn('PrescribeRx webhook signature mismatch')
    return { ok: false, reason: 'mismatch' }
  }
  return { ok: true, reason: 'verified' }
}

// ---------------------------------------------------------------------------
// Org resolution
// ---------------------------------------------------------------------------
//
// TODO: Real multi-tenant resolution should map an upstream PrescribeRx
// client/sub-sales-org id to a local organizations.id row. For now Juvenex
// is single-tenant, so we resolve to either DEFAULT_ORGANIZATION_ID or the
// oldest organizations row by created_at as a deterministic fallback.

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function extractClientId(raw: unknown): string | null {
  const root = readObject(raw)
  if (!root) return null
  const direct =
    pickString(root.client_id) ??
    pickString(root.prescriberx_client_id) ??
    pickString(root.organization_client_id)
  if (direct) return direct

  const data = readObject(root.data)
  if (!data) return null
  return (
    pickString(data.client_id) ??
    pickString(data.prescriberx_client_id) ??
    pickString(data.organization_client_id)
  )
}

async function resolveOrganizationId(
  supabase: SupabaseClient,
  rawEvent?: unknown
): Promise<string | null> {
  const clientId = extractClientId(rawEvent)
  if (clientId) {
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .eq('prescriberx_client_id', clientId)
      .maybeSingle()

    if (error) {
      logger.error('Failed to resolve organization from PrescribeRx client_id', {
        error: error.message,
      })
    } else if (data?.id) {
      return data.id as string
    }
  }

  const envId = process.env.DEFAULT_ORGANIZATION_ID
  if (envId && envId.length > 0) return envId

  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.error('Failed to resolve default organization', { error: error.message })
    return null
  }
  return (data?.id as string | undefined) ?? null
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * Returns true on first receipt (caller should process), false on duplicate
 * (caller should short-circuit). Internal errors degrade open: we log and
 * still process, since dropping an event we can't dedupe is worse than
 * processing it twice.
 */
async function recordEventIdempotent(
  supabase: SupabaseClient,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('webhook_events_seen')
    .insert({ provider: PROVIDER, event_id: eventId, event_type: eventType })

  if (!error) return true

  // Postgres unique-violation = duplicate event. supabase-js surfaces it as
  // code '23505' on PostgrestError.
  const errCode = (error as { code?: string }).code
  if (errCode === '23505') return false

  logger.error('Failed to record webhook_events_seen row; processing event anyway', {
    error: error.message,
    event_id: eventId,
  })
  return true
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function dispatchEvent(
  supabase: SupabaseClient,
  organizationId: string,
  eventType: string,
  data: unknown,
): Promise<void> {
  switch (eventType) {
    case 'prescription.created':
    case 'prescription.issued':
      await handlePrescriptionCreated(supabase, organizationId, data)
      return

    case 'prescription.revoked':
    case 'prescription.cancelled':
    case 'prescription.canceled':
      await handlePrescriptionRevoked(supabase, organizationId, data)
      return

    case 'encounter.completed':
    case 'encounter.status_changed':
      await handleEncounterStatusChanged(supabase, data)
      return

    case 'order.created':
    case 'order.status_changed':
    case 'order.shipped':
    case 'order.delivered':
      await handleOrderEvent(supabase, eventType, data)
      return

    default:
      logger.info('PrescribeRx webhook event_type not handled (acked)', { eventType })
      return
  }
}

async function storeProviderWebhookEvent(
  supabase: SupabaseClient,
  organizationId: string,
  event: NormalisedEvent,
  parsedPayload: unknown
): Promise<void> {
  const { error } = await supabase
    .from('provider_webhook_events')
    .upsert(
      {
        provider: PROVIDER,
        event_id: event.eventId,
        event_type: event.eventType,
        organization_id: organizationId,
        payload: parsedPayload,
        processed_at: new Date().toISOString(),
      },
      { onConflict: 'provider,event_id' }
    )

  if (error) {
    logger.warn('Failed to store provider webhook event payload', {
      error: error.message,
      event_id: event.eventId,
      event_type: event.eventType,
    })
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Read raw body BEFORE JSON.parse — needed for HMAC verification.
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch (err) {
    logger.error('Failed to read PrescribeRx webhook body', {
      error: err instanceof Error ? err.message : 'unknown',
    })
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  // 2. Verify signature. In strict (prod) mode, mismatch → 401.
  const sigResult = verifySignature(rawBody, request)
  if (!sigResult.ok) {
    return Response.json(
      { error: 'invalid_signature', reason: sigResult.reason },
      { status: 401 },
    )
  }

  // 3. Parse JSON. Malformed body → 400 (PrescribeRx will retry, but a
  // permanently malformed event should never have been signed in the first
  // place, so 400 is correct).
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    logger.warn('PrescribeRx webhook body was not valid JSON')
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const event = normaliseEvent(parsed)
  if (!event) {
    logger.warn('PrescribeRx webhook missing event_id/event_type; acking to prevent retry')
    return Response.json(OK_RESPONSE)
  }

  const supabase = createAdminClient()

  // 4. Idempotency check.
  const isFirstSeen = await recordEventIdempotent(supabase, event.eventId, event.eventType)
  if (!isFirstSeen) {
    logger.info('PrescribeRx webhook duplicate event ignored', {
      event_id: event.eventId,
      event_type: event.eventType,
    })
    return Response.json(OK_RESPONSE)
  }

  // 5. Resolve org. If we can't, still ack (so PrescribeRx doesn't retry
  // forever) but log loudly — this is an ops misconfiguration.
  const organizationId = await resolveOrganizationId(supabase, parsed)
  if (!organizationId) {
    logger.error('Cannot resolve organization for PrescribeRx webhook; acking without processing', {
      event_id: event.eventId,
      event_type: event.eventType,
    })
    return Response.json(OK_RESPONSE)
  }

  // 6. Dispatch. Internal errors are logged but always 200 so PrescribeRx
  // doesn't retry indefinitely (we've already recorded the event id).
  try {
    await storeProviderWebhookEvent(supabase, organizationId, event, parsed)
    await dispatchEvent(supabase, organizationId, event.eventType, event.data)
  } catch (err) {
    logger.error('PrescribeRx webhook dispatch failed; acking to prevent retry storm', {
      error: err instanceof Error ? err.message : 'unknown',
      event_id: event.eventId,
      event_type: event.eventType,
    })
  }

  return Response.json(OK_RESPONSE)
}
