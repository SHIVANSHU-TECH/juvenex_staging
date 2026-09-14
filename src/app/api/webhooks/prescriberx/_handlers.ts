import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Event payload schemas
// ---------------------------------------------------------------------------
//
// PrescribeRx hasn't sent us a real event yet (2026-05-08), so these schemas
// are a defensible best-guess based on REST conventions and the field names
// we already know exist (patient_id / patient_chart_id / encounter_id).
//
// IMPORTANT: every nested field is `.optional()` so a real event with a
// slightly different shape still parses successfully and reaches the handler,
// where we can decide whether enough data is present to act. We do NOT want
// to reject (or 500) on the first real event just because PrescribeRx wrapped
// the payload differently than we guessed.
//
// TODO(2026-05-08): once we've seen a real PrescribeRx webhook, tighten the
// `.optional()` calls on the fields that turn out to always be present.

export const PrescriptionLineItemSchema = z
  .object({
    product_id: z.string().optional(),
    sku: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough()

export const PrescriptionEventDataSchema = z
  .object({
    prescription_id: z.string().optional(),
    id: z.string().optional(),
    patient_id: z.string().optional(),
    patient_chart_id: z.string().optional(),
    product_id: z.string().optional(),
    items: z.array(PrescriptionLineItemSchema).optional(),
    line_items: z.array(PrescriptionLineItemSchema).optional(),
  })
  .passthrough()

export const EncounterEventDataSchema = z
  .object({
    encounter_id: z.string().optional(),
    id: z.string().optional(),
    patient_id: z.string().optional(),
    patient_chart_id: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough()

export const OrderEventDataSchema = z
  .object({
    order_id: z.string().optional(),
    id: z.string().optional(),
    reference: z.string().optional(),
    status: z.string().optional(),
    tracking_number: z.string().optional(),
    tracking_url: z.string().optional(),
    tracking_carrier: z.string().optional(),
    carrier: z.string().optional(),
    shipped_at: z.string().optional(),
    delivered_at: z.string().optional(),
  })
  .passthrough()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PrescriptionData = z.infer<typeof PrescriptionEventDataSchema>
type EncounterData = z.infer<typeof EncounterEventDataSchema>
type OrderData = z.infer<typeof OrderEventDataSchema>

function pickPatientRef(d: { patient_id?: string; patient_chart_id?: string }): string | null {
  return d.patient_chart_id ?? d.patient_id ?? null
}

function pickPrescriptionRef(d: PrescriptionData): string | null {
  return d.prescription_id ?? d.id ?? null
}

function collectProductIds(d: PrescriptionData): string[] {
  const ids = new Set<string>()
  if (d.product_id) ids.add(d.product_id)
  for (const item of d.items ?? []) {
    if (item.product_id) ids.add(item.product_id)
    if (item.sku) ids.add(item.sku)
  }
  for (const item of d.line_items ?? []) {
    if (item.product_id) ids.add(item.product_id)
    if (item.sku) ids.add(item.sku)
  }
  return Array.from(ids)
}

async function normalizeProductIds(
  supabase: SupabaseClient,
  organizationId: string,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return []
  const unique = Array.from(new Set(ids))
  const orParts = [
    `product_id.in.(${unique.join(',')})`,
    `external_product_id.in.(${unique.join(',')})`,
    `sku.in.(${unique.join(',')})`,
  ]
  const { data, error } = await supabase
    .from('prescriberx_product_mappings')
    .select('product_id, external_product_id, sku')
    .eq('organization_id', organizationId)
    .or(orParts.join(','))

  if (error) {
    logger.warn('prescription unlock product mapping lookup failed', {
      error: error.message,
      product_count: unique.length,
    })
    return unique
  }

  const normalized = new Set(unique)
  for (const row of (data ?? []) as Array<{
    product_id: string
    external_product_id: string | null
    sku: string | null
  }>) {
    normalized.add(row.product_id)
  }
  return Array.from(normalized)
}

// ---------------------------------------------------------------------------
// prescription.created / prescription.issued
// ---------------------------------------------------------------------------

export async function handlePrescriptionCreated(
  supabase: SupabaseClient,
  organizationId: string,
  raw: unknown,
): Promise<void> {
  const parsed = PrescriptionEventDataSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn('prescription.created event data did not match expected shape', {
      issues: parsed.error.issues.slice(0, 3),
    })
    return
  }

  const data = parsed.data
  const patientRef = pickPatientRef(data)
  if (!patientRef) {
    logger.warn('prescription.created missing patient reference; skipping unlock')
    return
  }

  const prescriptionRef = pickPrescriptionRef(data)
  const productIds = await normalizeProductIds(
    supabase,
    organizationId,
    collectProductIds(data)
  )

  if (productIds.length === 0) {
    logger.warn('prescription.created had no product ids; nothing to unlock', {
      provider_patient_ref: patientRef,
      prescription_ref: prescriptionRef,
    })
    return
  }

  const rows = productIds.map((productId) => ({
    organization_id: organizationId,
    provider_patient_ref: patientRef,
    product_id: productId,
    prescription_ref: prescriptionRef,
    unlocked_at: new Date().toISOString(),
    revoked_at: null,
  }))

  const { error } = await supabase
    .from('prescription_unlocks')
    .upsert(rows, { onConflict: 'organization_id,provider_patient_ref,product_id' })

  if (error) {
    logger.error('Failed to upsert prescription_unlocks', {
      error: error.message,
      provider_patient_ref: patientRef,
      product_count: productIds.length,
    })
    return
  }

  logger.info('prescription_unlocks upserted', {
    provider_patient_ref: patientRef,
    product_count: productIds.length,
  })
}

// ---------------------------------------------------------------------------
// prescription.revoked / prescription.cancelled
// ---------------------------------------------------------------------------

export async function handlePrescriptionRevoked(
  supabase: SupabaseClient,
  organizationId: string,
  raw: unknown,
): Promise<void> {
  const parsed = PrescriptionEventDataSchema.safeParse(raw)
  if (!parsed.success) return

  const data = parsed.data
  const patientRef = pickPatientRef(data)
  if (!patientRef) return

  const productIds = collectProductIds(data)

  // If product list is provided, scope the revoke to those rows. Otherwise
  // revoke every unlock for this patient under this org (best safe default
  // when PrescribeRx says "this prescription is gone" without itemising).
  let query = supabase
    .from('prescription_unlocks')
    .update({ revoked_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('provider_patient_ref', patientRef)
    .is('revoked_at', null)

  if (productIds.length > 0) {
    query = query.in('product_id', productIds)
  }

  const { error } = await query
  if (error) {
    logger.error('Failed to revoke prescription_unlocks', {
      error: error.message,
      provider_patient_ref: patientRef,
    })
    return
  }

  logger.info('prescription_unlocks revoked', {
    provider_patient_ref: patientRef,
    scoped_product_count: productIds.length,
  })
}

// ---------------------------------------------------------------------------
// encounter.completed / encounter.status_changed
// ---------------------------------------------------------------------------

const APPOINTMENT_STATUS_MAP: Record<string, string> = {
  // best-effort mapping from PrescribeRx encounter statuses to our local
  // appointment_status values. Unknown upstream statuses fall through.
  completed: 'completed',
  complete: 'completed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  scheduled: 'scheduled',
  pending: 'pending',
}

export async function handleEncounterStatusChanged(
  supabase: SupabaseClient,
  raw: unknown,
): Promise<void> {
  const parsed = EncounterEventDataSchema.safeParse(raw)
  if (!parsed.success) return

  const data: EncounterData = parsed.data
  const encounterId = data.encounter_id ?? data.id ?? null
  if (!encounterId) {
    logger.warn('encounter event missing encounter id; cannot match appointment')
    return
  }

  const upstreamStatus = (data.status ?? '').toLowerCase()
  const localStatus = APPOINTMENT_STATUS_MAP[upstreamStatus]
  if (!localStatus) {
    // Don't write a status we don't have a CHECK-constraint slot for. Just
    // log and move on — the appointment row stays as-is.
    logger.info('encounter event with unmapped status; not updating appointment', {
      encounter_id: encounterId,
      upstream_status: upstreamStatus || '(none)',
    })
    return
  }

  const { data: rows, error } = await supabase
    .from('appointments')
    .update({
      appointment_status: localStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('provider_reference_id', encounterId)
    .select('id')

  if (error) {
    logger.error('Failed to update appointment from encounter event', {
      error: error.message,
      encounter_id: encounterId,
    })
    return
  }

  logger.info('appointment status updated from encounter event', {
    encounter_id: encounterId,
    matched_count: rows?.length ?? 0,
    new_status: localStatus,
  })
}

// ---------------------------------------------------------------------------
// order.* — log only (orders flow owned by orders module)
// ---------------------------------------------------------------------------

function pickOrderRef(d: OrderData): string | null {
  return d.order_id ?? d.id ?? d.reference ?? null
}

function mapOrderStatus(status: string | undefined): {
  orderStatus?: string
  prescriberxStatus?: string
} {
  const normalized = (status ?? '').toLowerCase()
  if (['confirmed', 'accepted', 'processing'].includes(normalized)) {
    return { prescriberxStatus: 'confirmed' }
  }
  if (['failed', 'cancelled', 'canceled', 'rejected'].includes(normalized)) {
    return { prescriberxStatus: 'failed' }
  }
  if (['sent', 'submitted', 'created'].includes(normalized)) {
    return { prescriberxStatus: 'sent' }
  }
  if (['fulfilled', 'shipped', 'delivered'].includes(normalized)) {
    return { orderStatus: 'fulfilled', prescriberxStatus: 'confirmed' }
  }
  return {}
}

export async function handleOrderEvent(
  supabase: SupabaseClient,
  eventType: string,
  raw: unknown
): Promise<void> {
  const parsed = OrderEventDataSchema.safeParse(raw)
  if (!parsed.success) {
    logger.info('order webhook received (unparseable shape, ignored)', { eventType })
    return
  }
  const d: OrderData = parsed.data
  const orderRef = pickOrderRef(d)
  if (!orderRef) {
    logger.info('order webhook received without order ref', {
      eventType,
      status: d.status ?? null,
    })
    return
  }

  const mapped = mapOrderStatus(d.status)
  const update: Record<string, unknown> = {
    provider_order_id: orderRef,
    provider_order_status: d.status ?? null,
    provider_payload: raw,
  }
  if (mapped.orderStatus) update.status = mapped.orderStatus
  if (mapped.prescriberxStatus) update.prescriberx_status = mapped.prescriberxStatus
  if (d.tracking_carrier || d.carrier) update.tracking_carrier = d.tracking_carrier ?? d.carrier
  if (d.tracking_number) update.tracking_number = d.tracking_number
  if (d.tracking_url) update.tracking_url = d.tracking_url
  if (d.shipped_at) update.shipped_at = d.shipped_at
  if (d.delivered_at) update.delivered_at = d.delivered_at
  if (mapped.orderStatus === 'fulfilled' && !d.delivered_at) {
    update.fulfilled_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('orders')
    .update(update)
    .or(`provider_order_id.eq.${orderRef},prescriberx_reference.eq.${orderRef}`)
    .select('id')

  if (error) {
    logger.error('order webhook update failed', {
      eventType,
      order_id: orderRef,
      error: error.message,
    })
    return
  }

  logger.info('order webhook processed', {
    eventType,
    order_id: orderRef,
    status: d.status ?? null,
    matched_count: data?.length ?? 0,
  })
}
