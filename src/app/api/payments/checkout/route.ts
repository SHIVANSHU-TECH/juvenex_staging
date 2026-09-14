import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { logAudit } from '@/lib/audit'
import { resolveTrustedProducts } from '@/lib/checkout-catalog'
import { config } from '@/lib/config'
import { encryptPHI } from '@/lib/encryption'
import { logger } from '@/lib/logger'
import {
  classifyProductAccess,
  tierForPlan,
  tierForPlanAndProtocols,
  type MarketplaceTier,
} from '@/lib/marketplace-access'
import {
  buildMembershipOrderItem,
  resolveMembershipSelection,
  type MembershipOrderItem,
} from '@/lib/membership-checkout'
import { getPaymentProvider, isPaymentConfigured } from '@/lib/payments'
import { fetchPrescriptionUnlockedProductIds } from '@/lib/prescription-unlocks'
import { rateLimit } from '@/lib/rate-limit'
import { subscriptionGrantsAccess } from '@/lib/subscription-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

// POST /api/payments/checkout
//
// Creates a pending order and a hosted-checkout session with the configured
// payment provider. The user is redirected to the returned `sessionUrl` to
// pay. The actual flip to status='paid' happens via the provider webhook
// (or, in stub mode, /api/payments/confirm).
//
// Auth: requires a logged-in Juvenex user.
// Trust model: server re-fetches every product price from `shop_products`;
// client-supplied price_cents is ignored for total calculation. The client
// value is still echoed back into the items snapshot for receipts.

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const ITEM_MAX_QTY = 50
const MAX_ITEMS = 25

// Defensive whitelist — multiple taxonomies exist for prescription categories
// across legacy seed data, admin-created products, and the new shop SKUs. Any
// product whose category falls in this set requires a complete medical intake
// at checkout time. Server-side enforcement is the source of truth; the
// client gate is a UX hint only.
const PRESCRIPTION_CATEGORIES: ReadonlySet<string> = new Set([
  'GLP1',
  'Peptides',
  'medication',
  'Prescription',
  'Weight loss',
  'Weight loss protocol',
  'Metabolic/energy',
  'Metabolic protocol',
  'Sexual health',
  'Sexual protocol',
  'Growth protocol',
  'Recovery',
])

const itemSchema = z
  .object({
    product_id: z.string().uuid(),
    name: z.string().min(1).max(255),
    quantity: z.number().int().positive().max(ITEM_MAX_QTY),
    price_cents: z.number().int().nonnegative(),
  })
  .strict()

// Phone regex matches the frontend ShippingForm validator: digits, spaces,
// dashes, parentheses, plus sign, and dots. Length 7-20 covers everything from
// "5551234" to "+1 (555) 123-4567" without admitting URLs or arbitrary text.
const phoneRegex = /^[\d\s\-().+]{7,20}$/

// Address schema mirrors the frontend ShippingValues / BillingValues shape.
// Older revisions of this route stripped `name` and `phone` silently, which
// meant fulfillment lost the recipient name/phone for every order. Keep both
// optional here so legacy callers still validate, but allow them through.
// .strict() rejects any extra keys a compromised client might inject.
// country is locked to 'US' — the shipping form already enforces this
// client-side; the server must independently enforce it (Sec-M-13).
const addressSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    phone: z.string().regex(phoneRegex, 'Invalid phone format').optional(),
    street: z.string().min(1).max(200),
    apt: z.string().max(100).optional(),
    city: z.string().min(1).max(100),
    state: z.string().min(1).max(100),
    zip: z.string().min(1).max(32),
    country: z.literal('US').default('US'),
  })
  .strict()

// Intake answers — STRICT allowlist. Keys mirror the frontend
// intakeAnswersPayload() in src/app/checkout/_components/ReviewSubmit.tsx.
// Unknown keys are rejected so a compromised client cannot smuggle PHI into
// the orders.intake_answers JSONB blob. Per-field caps mirror the form's
// own input limits.
const intakeAnswersSchema = z
  .object({
    dob: z.string().max(40).optional(),
    sex: z.enum(['male', 'female', 'other']).optional(),
    weight_lbs: z.number().min(50).max(800).optional(),
    height_inches: z.number().int().min(36).max(96).optional(),
    pregnant_or_breastfeeding: z.enum(['yes', 'no', 'na']).optional(),
    allergies: z.string().max(2000).optional(),
    current_medications: z.string().max(2000).optional(),
    conditions: z.array(z.string().max(100)).max(20).optional(),
    conditions_other: z.string().max(500).optional(),
    prior_glp1: z.boolean().optional(),
    prior_glp1_which: z.string().max(200).optional(),
    prior_glp1_duration: z.string().max(200).optional(),
    hipaa_consent: z.boolean().optional(),
    telehealth_consent: z.boolean().optional(),
  })
  .strict()

type IntakeAnswers = z.infer<typeof intakeAnswersSchema>

// Optional membership the customer is buying IN THE SAME cart (members-only
// store: a non-member must add a tier to check out). When present, the order
// becomes a single recurring Kurv charge: initial_payment_amount = first-month
// membership + all products (charged now), recurring amount = membership/month.
const membershipSelectionSchema = z
  .object({
    plan: z.string().min(1).max(64),
    selectedProtocols: z.array(z.string().min(1).max(64)).max(8).optional(),
  })
  .strict()

const checkoutBodySchema = z.object({
  items: z.array(itemSchema).min(1).max(MAX_ITEMS),
  membership: membershipSelectionSchema.optional(),
  shipping_address: addressSchema,
  billing_address: addressSchema.optional(),
  intake_answers: intakeAnswersSchema,
  contact_email: z.string().email().max(254),
  contact_phone: z
    .string()
    .regex(phoneRegex, 'Invalid phone format')
    .optional(),
})

type CheckoutBody = z.infer<typeof checkoutBodySchema>
type CheckoutAddress = z.infer<typeof addressSchema>

interface ItemSnapshot {
  product_id: string
  name: string
  quantity: number
  /** Server-authoritative unit price (shop_products or live PrescribeRx catalog). */
  unit_price_cents: number
  /** unit_price_cents * quantity. */
  line_total_cents: number
}

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status })
}

async function resolveFulfillmentAddress(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string | null | undefined,
  fallback: CheckoutAddress
): Promise<CheckoutAddress> {
  if (!organizationId) return fallback

  const { data, error } = await supabase
    .from('organizations')
    .select(
      'fulfillment_name, fulfillment_phone, fulfillment_street, fulfillment_apt, fulfillment_city, fulfillment_state, fulfillment_zip, fulfillment_country'
    )
    .eq('id', organizationId)
    .maybeSingle()

  if (error) {
    logger.warn('payments/checkout: organization fulfillment address lookup failed', {
      organizationId,
      error: error.message,
    })
    return fallback
  }

  const row = data as
    | {
        fulfillment_name?: string | null
        fulfillment_phone?: string | null
        fulfillment_street?: string | null
        fulfillment_apt?: string | null
        fulfillment_city?: string | null
        fulfillment_state?: string | null
        fulfillment_zip?: string | null
        fulfillment_country?: string | null
      }
    | null

  if (
    !row?.fulfillment_name ||
    !row.fulfillment_street ||
    !row.fulfillment_city ||
    !row.fulfillment_state ||
    !row.fulfillment_zip
  ) {
    return fallback
  }

  return {
    name: row.fulfillment_name,
    phone: row.fulfillment_phone ?? undefined,
    street: row.fulfillment_street,
    apt: row.fulfillment_apt ?? undefined,
    city: row.fulfillment_city,
    state: row.fulfillment_state,
    zip: row.fulfillment_zip,
    country: 'US',
  }
}

// ---------------------------------------------------------------------------
// Total computation (server-trusted)
// ---------------------------------------------------------------------------

interface ComputedTotal {
  totalCents: number
  itemsSnapshot: ItemSnapshot[]
  /** True if any line item resolves to a prescription category. */
  requiresIntake: boolean
}

async function computeTotals(
  body: CheckoutBody,
  userId: string,
  organizationId: string | null,
  effectiveTier: MarketplaceTier
): Promise<ComputedTotal | { error: string }> {
  const supabase = createAdminClient()

  const productIds = Array.from(new Set(body.items.map((i) => i.product_id)))

  // Resolve prices from the SAME catalog the shop served: local shop_products
  // first, then the live PrescribeRx catalog for any id not seeded locally.
  // Previously this route looked at shop_products only, so PrescribeRx-catalog
  // products (e.g. anastrozole) were rejected as "Unknown product" at checkout.
  let byId: Awaited<ReturnType<typeof resolveTrustedProducts>>
  try {
    byId = await resolveTrustedProducts(productIds)
  } catch (error: unknown) {
    logger.error('payments/checkout: product catalog resolution failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { error: 'Internal server error' }
  }

  const itemsSnapshot: ItemSnapshot[] = []
  let totalCents = 0
  let requiresIntake = false
  // Authorize products against the tier the customer WILL HAVE after this
  // checkout (their active membership, or the tier they're buying right now).
  const tier = effectiveTier
  const prescriptionUnlockedProductIds = await fetchPrescriptionUnlockedProductIds(
    supabase,
    userId,
    { productIds }
  )

  for (const item of body.items) {
    const product = byId.get(item.product_id)
    if (!product) {
      // Resolved in neither shop_products nor the live catalog. Name the item
      // (client-supplied, already length-capped) so the shopper knows exactly
      // which line to remove instead of seeing a raw product id.
      logger.warn('payments/checkout: item unresolved in catalog', {
        productId: item.product_id,
      })
      return {
        error: `"${item.name}" is no longer available. Please remove it from your cart and try again.`,
      }
    }
    if (!product.is_active) {
      return {
        error: `"${product.name}" is currently unavailable. Please remove it from your cart and try again.`,
      }
    }
    // Guard: a trusted unit price must be a positive integer number of cents.
    // A missing/zero upstream price (e.g. a PrescribeRx item with no pricing)
    // must NOT silently drop or create a $0 line — surface it explicitly.
    if (!Number.isInteger(product.price_cents) || product.price_cents <= 0) {
      logger.warn('payments/checkout: item has no purchasable price', {
        productId: item.product_id,
        source: product.source,
        priceCents: product.price_cents,
      })
      return {
        error: `"${product.name}" is not available for online purchase right now. Please contact support.`,
      }
    }
    const access = classifyProductAccess(product, tier)
    const prescriptionUnlocked = prescriptionUnlockedProductIds.has(product.id)
    if (access.locked && !prescriptionUnlocked) {
      return {
        error: `${product.name} requires the ${access.requiredTier.label} tier.`,
      }
    }
    if (
      typeof product.category === 'string' &&
      (PRESCRIPTION_CATEGORIES.has(product.category) ||
        PRESCRIPTION_CATEGORIES.has(access.group.label))
    ) {
      requiresIntake = true
    }
    const lineTotal = product.price_cents * item.quantity
    totalCents += lineTotal
    itemsSnapshot.push({
      product_id: item.product_id,
      name: item.name,
      quantity: item.quantity,
      unit_price_cents: product.price_cents,
      line_total_cents: lineTotal,
    })
  }

  return { totalCents, itemsSnapshot, requiresIntake }
}

// Resolve whether the user currently has PAID, in-period membership access and
// the tier it grants. Mirrors the access rules in /api/payments/subscription:
// only 'active'/'trialing' count, recurring subs (with an external handle) stay
// active until cancelled, one-time grants expire at current_period_end.
async function getActiveMembership(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ active: boolean; tier: MarketplaceTier }> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, stripe_subscription_id, selected_protocols')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      logger.warn('payments/checkout: subscription lookup failed; treating as non-member', {
        userId,
        error: error.message,
      })
    }
    return { active: false, tier: tierForPlan(null) }
  }

  const active = subscriptionGrantsAccess(data)

  return {
    active,
    tier: active
      ? tierForPlanAndProtocols(
          (data.plan as string | null | undefined) ?? null,
          data.selected_protocols as string[] | null | undefined
        )
      : tierForPlan(null),
  }
}

// ---------------------------------------------------------------------------
// Intake gate (server-trusted)
// ---------------------------------------------------------------------------

/**
 * When any cart item is a prescription product, the intake_answers payload
 * MUST carry every field a clinician needs to safely review the order. The
 * client UI also enforces this, but the client is untrusted.
 *
 * Required fields per the reverse-flow PHI checklist:
 *   - HIPAA + telehealth consent (must be true)
 *   - dob, sex (demographics)
 *   - weight_lbs, height_inches (clinical baseline)
 *   - allergies (string, may be empty after explicit "None" answer)
 *   - current_medications (string, may be empty after explicit "None")
 *   - conditions (array, may be empty after explicit "no conditions selected")
 *   - pregnant_or_breastfeeding (clinical safety flag for GLP-1)
 *
 * Returns a human-friendly error message when the intake is incomplete, or
 * null when the intake is acceptable. The string fields are validated as
 * "key explicitly present" (typeof === 'string'); empty strings are allowed
 * because "no allergies" / "no medications" is a valid clinical answer the
 * user must affirmatively submit (the frontend always sends the field).
 */
function validateIntakeForPrescription(
  intake: IntakeAnswers,
  rawKeys: ReadonlySet<string>
): string | null {
  if (intake.hipaa_consent !== true) {
    return 'Medical intake required: HIPAA consent must be granted.'
  }
  if (intake.telehealth_consent !== true) {
    return 'Medical intake required: telehealth consent must be granted.'
  }
  if (!intake.dob || intake.dob.trim().length === 0) {
    return 'Medical intake required: date of birth is missing.'
  }
  if (!intake.sex) {
    return 'Medical intake required: sex assigned at birth is missing.'
  }
  if (typeof intake.weight_lbs !== 'number') {
    return 'Medical intake required: current weight is missing.'
  }
  if (typeof intake.height_inches !== 'number') {
    return 'Medical intake required: height is missing.'
  }
  if (!intake.pregnant_or_breastfeeding) {
    return 'Medical intake required: pregnant or breastfeeding answer is missing.'
  }
  // The next three fields use `rawKeys` (whether the property was present on
  // the wire) rather than truthiness. An empty allergies string is a valid
  // explicit "none" answer; a missing allergies key means the client never
  // asked the user, which is a HIPAA gap we must reject.
  if (!rawKeys.has('allergies') || typeof intake.allergies !== 'string') {
    return 'Medical intake required: allergies answer is missing.'
  }
  if (
    !rawKeys.has('current_medications') ||
    typeof intake.current_medications !== 'string'
  ) {
    return 'Medical intake required: current medications answer is missing.'
  }
  if (!rawKeys.has('conditions') || !Array.isArray(intake.conditions)) {
    return 'Medical intake required: medical conditions answer is missing.'
  }
  return null
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return jsonError(401, 'Unauthorized')

    // Production gate: when no real payment provider is configured, refuse
    // checkout gracefully rather than throwing inside getPaymentProvider().
    // This lets the app build & boot without a vendor selected; ops sets
    // PAYMENT_PROVIDER once a real one is integrated.
    if (!isPaymentConfigured()) {
      logger.warn('payments/checkout: no payment provider configured', {
        userId: user.id,
        nodeEnv: process.env.NODE_ENV,
        provider: process.env.PAYMENT_PROVIDER ?? 'stub',
      })
      return jsonError(
        503,
        'Payments are temporarily unavailable. Please contact support.'
      )
    }

    const rl = rateLimit(`payments-checkout:${user.id}`, 10, 60_000)
    if (!rl.success) return jsonError(429, 'Too many requests')

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return jsonError(400, 'Invalid JSON body')
    }

    const parsed = checkoutBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: 'Invalid request',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }
    const body = parsed.data

    // ---- Membership context (members-only store) ----
    // Products are members-only. The buyer must either already hold active
    // membership, or include a tier to buy in this same cart. When a tier is
    // bought here, the whole order becomes ONE recurring Kurv charge:
    //   initial_payment_amount = first-month membership + all products (now)
    //   recurring amount        = membership / month
    let membershipLine: MembershipOrderItem | null = null
    let membershipFirstMonthCents = 0
    let recurringMonthlyCents = 0
    let effectiveTier: MarketplaceTier

    if (body.membership) {
      const resolved = resolveMembershipSelection(
        body.membership.plan,
        body.membership.selectedProtocols
      )
      if ('error' in resolved) {
        return jsonError(400, resolved.error)
      }
      membershipLine = buildMembershipOrderItem(resolved.tier, resolved.peptides, true)
      membershipFirstMonthCents = resolved.tier.priceCents
      recurringMonthlyCents = resolved.tier.priceCents
      effectiveTier = tierForPlanAndProtocols(resolved.tier.slug, resolved.peptides)
    } else {
      const existing = await getActiveMembership(createAdminClient(), user.id)
      if (!existing.active) {
        return jsonError(
          403,
          'A membership is required to purchase store items. Add a membership to continue.'
        )
      }
      effectiveTier = existing.tier
    }

    const totals = await computeTotals(
      body,
      user.id,
      user.organization_id,
      effectiveTier
    )
    if ('error' in totals) {
      return jsonError(400, totals.error)
    }
    if (totals.totalCents <= 0) {
      return jsonError(400, 'Order total must be greater than zero')
    }

    // Amount charged NOW = products + (first-month membership, if buying one).
    const dueNowCents = totals.totalCents + membershipFirstMonthCents

    // Server-side sanity bounds: minimum $1.00, maximum $100,000.
    // Protects against sub-cent rounding errors and runaway cart totals
    // that would exceed processor limits (Sec-M-11).
    const MIN_TOTAL_CENTS = 100        // $1.00
    const MAX_TOTAL_CENTS = 10_000_000 // $100,000.00
    if (dueNowCents < MIN_TOTAL_CENTS) {
      return jsonError(400, 'Order total is below the minimum allowed amount')
    }
    if (dueNowCents > MAX_TOTAL_CENTS) {
      return jsonError(400, 'Order total exceeds the maximum allowed amount')
    }

    // Server-trusted intake gate: the client UI hides the intake step for
    // non-prescription carts, but the server must independently enforce it.
    if (totals.requiresIntake) {
      // Capture which keys were *literally present* on the parsed payload
      // (zod's .strict() preserved them). validateIntakeForPrescription
      // distinguishes "explicit empty answer" from "field never sent".
      const rawKeys = new Set<string>(Object.keys(body.intake_answers))
      if (rawKeys.size === 0) {
        return jsonError(400, 'Medical intake required for prescription items.')
      }
      const intakeError = validateIntakeForPrescription(
        body.intake_answers,
        rawKeys
      )
      if (intakeError) {
        return jsonError(400, intakeError)
      }
    }

    const provider = getPaymentProvider()
    const supabase = createAdminClient()

    // PHI encryption (HIPAA §164.312(a)(2)(iv), Sec-C-3 / DB-C-3).
    // Dual-write strategy (migration 025 grace period):
    //   - Write encrypted ciphertext to the _enc columns (new, authoritative).
    //   - Keep writing cleartext to the original columns so any reader that
    //     has not yet been updated (including webhook/confirm owned by F2) can
    //     still read orders created in this deploy.
    //   - Cleartext columns will be dropped in migration 026 once all readers
    //     are confirmed to use the _enc fallback path.
    const shippingAddress = await resolveFulfillmentAddress(
      supabase,
      user.organization_id,
      body.shipping_address
    )
    const billingAddress = body.billing_address ?? body.shipping_address
    const intakeAnswersEnc = encryptPHI(JSON.stringify(body.intake_answers))
    const shippingAddressEnc = encryptPHI(JSON.stringify(shippingAddress))
    const billingAddressEnc = encryptPHI(JSON.stringify(billingAddress))

    const { data: insertData, error: insertError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        total_cents: dueNowCents,
        currency: 'usd',
        status: 'pending',
        // Membership (if bought) rides as the first line item so the paid-order
        // handler activates the subscription AND queues the product order.
        items: membershipLine
          ? [membershipLine, ...totals.itemsSnapshot]
          : totals.itemsSnapshot,
        organization_id: user.organization_id,
        // Cleartext columns retained for grace-period backward compatibility.
        // Remove after migration 026 drops these columns.
        shipping_address: shippingAddress,
        billing_address: billingAddress,
        intake_answers: body.intake_answers,
        // Encrypted PHI columns (authoritative after migration 025).
        intake_answers_enc: intakeAnswersEnc,
        shipping_address_enc: shippingAddressEnc,
        billing_address_enc: billingAddressEnc,
        contact_email: body.contact_email,
        contact_phone: body.contact_phone ?? null,
        payment_provider: provider.name,
        payment_status: 'pending',
        prescriberx_status: 'not_sent',
      })
      .select('id')
      .single()

    if (insertError || !insertData) {
      logger.error('payments/checkout: orders INSERT failed', {
        userId: user.id,
        error: insertError?.message,
      })
      return jsonError(500, 'Internal server error')
    }

    const orderId = insertData.id as string

    // Best-effort audit. Never blocks the response — logAudit catches its own
    // errors. Metadata is intentionally PHI-free: no intake_answers, no
    // address fields. has_intake is a presence flag only.
    void logAudit({
      userId: user.id,
      action: 'order.created',
      resourceType: 'order',
      resourceId: orderId,
      details: {
        total_cents: dueNowCents,
        items_count: totals.itemsSnapshot.length,
        has_membership: Boolean(membershipLine),
        has_intake: Object.keys(body.intake_answers).length > 0,
      },
    }).catch((err: unknown) => {
      logger.error('payments/checkout: audit log failed', {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    const appUrl = config.app.url

    // Itemized lines for the hosted pay page (membership first, then products).
    const cartItems = [
      ...(membershipLine
        ? [
            {
              name: membershipLine.name,
              quantity: 1,
              unitPriceCents: membershipFirstMonthCents,
            },
          ]
        : []),
      ...totals.itemsSnapshot.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unitPriceCents: i.unit_price_cents,
      })),
    ]

    // When a membership is in the cart, this is ONE recurring charge: the full
    // due-now amount is taken immediately (initial_payment_amount); only the
    // membership recurs monthly. payment_start_date is +1 month so it can't
    // lapse mid-checkout. Products-only (existing member) = a one-time charge.
    let recurring: { interval: 'monthly'; startDate: string; initialAmountCents: number; totalPayments: number } | undefined
    if (membershipLine) {
      const nextChargeDate = new Date()
      nextChargeDate.setMonth(nextChargeDate.getMonth() + 1)
      recurring = {
        interval: 'monthly',
        startDate: nextChargeDate.toISOString(),
        initialAmountCents: dueNowCents,
        totalPayments: 120,
      }
    }

    let session
    try {
      session = await provider.createCheckoutSession({
        orderId,
        amountCents: membershipLine ? recurringMonthlyCents : dueNowCents,
        currency: 'usd',
        customerEmail: body.contact_email,
        successUrl: `${appUrl}/checkout/success?orderId=${orderId}`,
        cancelUrl: `${appUrl}/checkout/cancel?orderId=${orderId}`,
        cartItems,
        ...(recurring ? { recurring } : {}),
        metadata: { orderId, userId: user.id },
      })
    } catch (sessionError: unknown) {
      logger.error('payments/checkout: provider session creation failed', {
        userId: user.id,
        orderId,
        provider: provider.name,
        error:
          sessionError instanceof Error
            ? sessionError.message
            : String(sessionError),
      })
      // Best-effort: mark the order as cancelled so it doesn't sit in
      // pending forever. We don't surface this failure to the client beyond
      // a generic error.
      await supabase
        .from('orders')
        .update({ status: 'cancelled', payment_status: 'failed' })
        .eq('id', orderId)
        .eq('payment_status', 'pending')
      return jsonError(502, 'Payment provider error')
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({ payment_reference: session.sessionId })
      .eq('id', orderId)

    if (updateError) {
      // Non-fatal: the order is created and the user can still pay. Log so
      // ops can backfill payment_reference if reconciliation is needed.
      logger.error('payments/checkout: payment_reference update failed', {
        orderId,
        error: updateError.message,
      })
    }

    return Response.json({
      success: true,
      orderId,
      sessionUrl: session.sessionUrl,
    })
  } catch (error: unknown) {
    logger.error('payments/checkout: unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonError(500, 'Internal server error')
  }
}
