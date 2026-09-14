import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import {
  fullIntakeSchema,
  toUnifiedIntakeBody,
  type FullIntake,
  type UnifiedIntakeBody,
} from '@/lib/intakeSchema'
import {
  getGlobalPrescribeRxConfig,
  getPrescribeRxConfigForOrg,
  type PrescribeRxConfig,
} from '@/lib/prescriberx-config'

// ---------------------------------------------------------------------------
// Supabase client (service role — server only)
// ---------------------------------------------------------------------------

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const updateAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum([
    'intake_received',
    'provider_assigned',
    'consultation_scheduled',
    'consultation_complete',
    'prescription_sent',
    'cancelled',
  ]),
})

// ---------------------------------------------------------------------------
// Provider integration (PrescribeRx /telehealth/intake/unified)
// ---------------------------------------------------------------------------

/** Successful upstream payload (subset we surface). */
interface UnifiedIntakeData {
  encounter_id: string
  encounter_number: string
  patient_chart_id: string
  patient_number: string
  status: string
  completeness_score?: number
}

interface UnifiedIntakeEnvelope {
  success?: boolean
  data?: UnifiedIntakeData
  meta?: { request_id?: string; timestamp?: string }
  message?: string
}

/** Laravel-style 422 validation body. */
interface ProviderValidationError {
  message?: string
  errors?: Record<string, string[] | undefined>
}

type UnifiedForwardResult =
  | { ok: true; data: UnifiedIntakeData }
  | { ok: false; reason: 'validation'; fields: string[] }
  | { ok: false; reason: 'provider_error' }

/** Provider hostname allowlist — loaded once at module init. */
const _allowedHostsRaw = process.env.TELEHEALTH_PROVIDER_ALLOWED_HOSTS
const _allowedHosts: Set<string> | null = _allowedHostsRaw
  ? new Set(_allowedHostsRaw.split(',').map((h) => h.trim()).filter(Boolean))
  : null

function getProviderBase(): string | null {
  const raw =
    process.env.PRESCRIBERX_API_BASE ?? process.env.TELEHEALTH_PROVIDER_URL
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}

function getProviderToken(): string | null {
  return (
    process.env.PRESCRIBERX_API_TOKEN ??
    process.env.TELEHEALTH_PROVIDER_API_KEY ??
    null
  )
}

function getEncounterTypeId(): string | undefined {
  return (
    process.env.TELEHEALTH_ENCOUNTER_TYPE_ID ??
    process.env.PRESCRIBERX_ENCOUNTER_TYPE_ID
  )
}

function assertHostAllowed(parsedUrl: URL): void {
  if (_allowedHosts && _allowedHosts.size > 0 && !_allowedHosts.has(parsedUrl.hostname)) {
    logger.error('Telehealth provider hostname not in allowlist', {
      hostname: parsedUrl.hostname,
    })
    throw new Error('telehealth upstream configuration error')
  }
}

function parseUpstreamUrl(raw: string): URL {
  try {
    return new URL(raw)
  } catch {
    logger.error('Invalid telehealth upstream URL — cannot parse')
    throw new Error('telehealth upstream configuration error')
  }
}

/** Issue a single fetch with a 25-second AbortController timeout. */
async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 25_000)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('telehealth upstream timeout')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * POST the unified-intake body to PrescribeRx. Returns a discriminated union:
 *   - ok: true → encounter data we can persist
 *   - reason: 'validation' → upstream rejected the body (422). Field names
 *     returned (without values) so the API can echo a generic hint without
 *     leaking PHI.
 *   - reason: 'provider_error' → 5xx, network failure, or unexpected shape.
 *
 * Never returns or logs the upstream response body — provider error responses
 * may reflect submitted PHI back at us.
 */
async function forwardUnifiedIntake(
  intakeBody: UnifiedIntakeBody,
  config: PrescribeRxConfig
): Promise<UnifiedForwardResult> {
  const url = `${config.base}/telehealth/intake/unified`
  try {
    assertHostAllowed(parseUpstreamUrl(url))
  } catch {
    return { ok: false, reason: 'provider_error' }
  }

  // Per-tenant routing (Model B): when this org has a PrescribeRx
  // client_id, include it as a top-level field per the OpenAPI spec for
  // /telehealth/intake/unified. When null, omit so the token's default
  // sales-org scope applies (today's single-tenant behavior).
  const wireBody: UnifiedIntakeBody & { client_id?: string } = config.clientId
    ? { ...intakeBody, client_id: config.clientId }
    : intakeBody

  let res: Response
  try {
    res = await timedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(wireBody),
    })
  } catch (err: unknown) {
    logger.error('PrescribeRx unified intake network/timeout failure', {
      error: err instanceof Error ? err.message : 'unknown',
    })
    return { ok: false, reason: 'provider_error' }
  }

  if (res.status === 200 || res.status === 201) {
    let parsed: UnifiedIntakeEnvelope | null = null
    try {
      parsed = (await res.json()) as UnifiedIntakeEnvelope
    } catch {
      logger.error('PrescribeRx unified intake returned non-JSON success body', {
        status: res.status,
      })
      return { ok: false, reason: 'provider_error' }
    }
    const data = parsed?.data
    if (
      !data ||
      typeof data.encounter_id !== 'string' ||
      typeof data.patient_chart_id !== 'string'
    ) {
      logger.error('PrescribeRx unified intake success missing required ids', {
        status: res.status,
        request_id: parsed?.meta?.request_id,
      })
      return { ok: false, reason: 'provider_error' }
    }
    return { ok: true, data }
  }

  if (res.status === 422) {
    let body: ProviderValidationError | null = null
    try {
      body = (await res.json()) as ProviderValidationError
    } catch {
      // Fall through; treat as generic provider error.
    }
    const fields = body?.errors ? Object.keys(body.errors) : []
    logger.warn('PrescribeRx unified intake rejected request body', {
      status: 422,
      field_count: fields.length,
      // Field NAMES only — never values, which may include PHI reflected from us.
      fields,
    })
    return { ok: false, reason: 'validation', fields }
  }

  logger.error('PrescribeRx unified intake non-OK status', { status: res.status })
  return { ok: false, reason: 'provider_error' }
}

// ---------------------------------------------------------------------------
// Local persistence helpers
// ---------------------------------------------------------------------------

interface PendingAppointmentRow {
  id: string
}

async function insertPendingAppointment(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  selectedProducts: string[],
  organizationId: string | null
): Promise<PendingAppointmentRow | null> {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      user_id: userId,
      organization_id: organizationId,
      appointment_status: 'intake_pending',
      selected_products: selectedProducts,
    })
    .select('id')
    .single()
  if (error || !data) {
    logger.error('Failed to insert pending appointment row', {
      error: error?.message,
    })
    return null
  }
  return data as PendingAppointmentRow
}

async function markAppointmentSubmitted(
  supabase: ReturnType<typeof getSupabase>,
  appointmentId: string,
  data: UnifiedIntakeData,
  scopeClientId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .update({
      appointment_status: 'intake_received',
      provider_reference_id: data.encounter_id,
      provider_patient_ref: data.patient_chart_id,
      provider_encounter_number: data.encounter_number,
      provider_patient_number: data.patient_number,
      provider_status: data.status,
      provider_completeness_score:
        typeof data.completeness_score === 'number' ? data.completeness_score : null,
      provider_error: null,
      provider_scope_client_id: scopeClientId,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)
  if (error) {
    logger.error('Failed to mark appointment as submitted', {
      appointmentId,
      error: error.message,
    })
  }
}

async function markAppointmentFailed(
  supabase: ReturnType<typeof getSupabase>,
  appointmentId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .update({
      appointment_status: 'intake_provider_error',
      provider_error: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)
  if (error) {
    logger.error('Failed to mark appointment as provider-failed', {
      appointmentId,
      error: error.message,
    })
  }
}

// ---------------------------------------------------------------------------
// POST — submit intake
// ---------------------------------------------------------------------------

interface RouteContext {
  user: { id: string; organizationId: string | null }
  intake: FullIntake
  supabase: ReturnType<typeof getSupabase>
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return Response.json({ success: false, error, ...(extra ?? {}) }, { status })
}

/**
 * Resolve provider config OR return a 503-shaped response. Returns null when
 * config is OK; otherwise a Response that the caller should return as-is.
 */
function ensureProviderConfigured(): Response | null {
  if (!getProviderBase() || !getProviderToken()) {
    logger.error('PrescribeRx config missing (PRESCRIBERX_API_BASE / PRESCRIBERX_API_TOKEN)')
    return jsonError(503, 'Telehealth intake not configured')
  }
  if (!getEncounterTypeId()) {
    logger.error('TELEHEALTH_ENCOUNTER_TYPE_ID is not set; refusing unified intake')
    return jsonError(503, 'Telehealth encounter type not configured')
  }
  return null
}

async function handleIntakeSubmit(ctx: RouteContext): Promise<Response> {
  const { user, intake, supabase } = ctx

  // Resolve PrescribeRx config — per-org when the patient belongs to an
  // org with a `prescriberx_client_id` set, otherwise the platform-wide
  // (token-default) scope. The env-vars-missing case was already screened
  // by ensureProviderConfigured() before we got here, so the global fall
  // back is guaranteed non-null.
  const config: PrescribeRxConfig | null = user.organizationId
    ? await getPrescribeRxConfigForOrg(user.organizationId)
    : getGlobalPrescribeRxConfig()
  if (!config) {
    logger.error('PrescribeRx config unexpectedly null after env screen', {
      organizationId: user.organizationId,
    })
    return jsonError(503, 'Telehealth intake not configured')
  }

  // Use the form's encounter_type_id when supplied, else fall back to env.
  const encounterTypeId = intake.encounterTypeId || getEncounterTypeId()!

  // 1. Insert a pending row BEFORE the upstream call so we have a paper trail
  //    even if the provider 5xxs or times out.
  const pending = await insertPendingAppointment(
    supabase,
    user.id,
    [],
    user.organizationId
  )
  if (!pending) {
    return jsonError(500, 'Failed to create appointment')
  }

  // 2. Build the unified body. The mapper is pure — never throws.
  const unifiedBody: UnifiedIntakeBody = {
    ...toUnifiedIntakeBody(intake),
    encounter_type_id: encounterTypeId,
  }

  // 3. POST to PrescribeRx.
  const result = await forwardUnifiedIntake(unifiedBody, config)

  if (!result.ok) {
    const reason = result.reason
    await markAppointmentFailed(supabase, pending.id, reason)

    await logAudit({
      userId: user.id,
      action: 'submit_intake_failed',
      resourceType: 'appointment',
      resourceId: pending.id,
      details: { reason },
    }).catch(() => {})

    if (reason === 'validation') {
      return jsonError(502, 'The clinical provider could not accept this intake. Please review your information and try again.')
    }
    return jsonError(502, 'Failed to submit intake to provider')
  }

  // 4. Persist provider refs + the client_id we routed this submission to.
  await markAppointmentSubmitted(supabase, pending.id, result.data, config.clientId)

  await logAudit({
    userId: user.id,
    action: 'submit_intake',
    resourceType: 'appointment',
    resourceId: pending.id,
    details: {
      providerPassThrough: true,
      encounter_number: result.data.encounter_number,
      provider_status: result.data.status,
      // Capture routing scope for forensic audit; null = token default.
      provider_scope_client_id: config.clientId,
    },
  }).catch(() => {})

  return Response.json(
    {
      success: true,
      status: result.data.status,
      message: 'Your intake has been submitted. A provider will contact you within 24 hours.',
      appointmentId: pending.id,
      data: {
        encounter_number: result.data.encounter_number,
        status: result.data.status,
      },
    },
    { status: 201 }
  )
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return jsonError(401, 'Unauthorized')
    }

    const rl = rateLimit(`appointments:${user.id}`, 10, 60_000)
    if (!rl.success) {
      return jsonError(429, 'Too many requests')
    }

    const configError = ensureProviderConfigured()
    if (configError) return configError

    const rawBody = await request.json().catch(() => null)
    if (!rawBody || typeof rawBody !== 'object') {
      return jsonError(400, 'Invalid request body')
    }

    const parsed = fullIntakeSchema.safeParse(rawBody)
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        },
        { status: 400 }
      )
    }

    const supabase = getSupabase()
    return await handleIntakeSubmit({
      user: { id: user.id, organizationId: user.organization_id ?? null },
      intake: parsed.data,
      supabase,
    })
  } catch (error: unknown) {
    logger.error('Failed to create appointment', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError(500, 'Internal server error')
  }
}

// ---------------------------------------------------------------------------
// GET — list patient appointments
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return jsonError(401, 'Unauthorized')

    const rl = rateLimit(`telehealth-get:${user.id}`, 30, 60_000)
    if (!rl.success) return jsonError(429, 'Too many requests')

    const supabase = getSupabase()
    const { data } = await supabase
      .from('appointments')
      .select(
        'id, appointment_status, selected_products, created_at, updated_at, provider_encounter_number, provider_patient_number, provider_status, submitted_at'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    await logAudit({
      action: 'view_appointments',
      resourceType: 'appointment',
      userId: user.id,
    }).catch(() => {})

    return Response.json({ success: true, data: data ?? [] })
  } catch (error: unknown) {
    logger.error('Failed to fetch appointments', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError(500, 'Internal server error')
  }
}

// ---------------------------------------------------------------------------
// PUT — update appointment status (patient cancel / staff workflow)
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return jsonError(401, 'Unauthorized')

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      'unknown'

    const rl = rateLimit(`appointments:${user.id}`, 20, 60_000)
    if (!rl.success) return jsonError(429, 'Too many requests')

    const body = await request.json()
    const parsed = updateAppointmentSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      )
    }

    // Restrict which statuses patients can set
    const patientAllowedStatuses = ['cancelled']
    if (
      user.role === 'patient' &&
      !patientAllowedStatuses.includes(parsed.data.status)
    ) {
      return jsonError(403, 'Unauthorized status change')
    }

    const supabase = getSupabase()
    const { data: existing } = await supabase
      .from('appointments')
      .select('id, user_id, organization_id')
      .eq('id', parsed.data.appointmentId)
      .maybeSingle()

    if (!existing) return jsonError(404, 'Appointment not found')

    // Authorization: patients must own the appointment; non-patients must
    // belong to the same organization; super_admin bypasses.
    if (user.role === 'patient') {
      if ((existing.user_id as string) !== user.id) {
        return jsonError(403, 'Forbidden')
      }
    } else if (user.role !== 'super_admin') {
      const existingOrgId = (existing.organization_id as string | null) ?? null
      if (!existingOrgId || existingOrgId !== user.organization_id) {
        return jsonError(403, 'Forbidden')
      }
    }

    const { data } = await supabase
      .from('appointments')
      .update({
        appointment_status: parsed.data.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.appointmentId)
      .select(
        'id, appointment_status, selected_products, created_at, updated_at'
      )
      .single()

    await logAudit({
      userId: user.id,
      action: 'update_appointment_status',
      resourceType: 'appointment',
      resourceId: parsed.data.appointmentId,
      details: { newStatus: parsed.data.status },
      ipAddress: ip,
    })

    return Response.json({ success: true, data })
  } catch (error: unknown) {
    logger.error('Failed to update appointment', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError(500, 'Internal server error')
  }
}
