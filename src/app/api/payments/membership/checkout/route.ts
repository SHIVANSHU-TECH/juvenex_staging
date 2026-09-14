// POST /api/payments/membership/checkout
//
// Creates a pending membership order and a hosted-checkout session with the
// configured payment provider, then returns the redirect URL. The user is
// sent to `sessionUrl` to pay; the membership is activated when the order is
// confirmed paid (see /api/payments/webhook and /api/payments/verify, which
// call activateMembershipFromOrder).
//
// Auth: requires a logged-in Juvenex user.
// Trust model: the charge amount is the server-authoritative tier price
// (MarketplaceTier.priceCents). The client only chooses which plan and which
// optional protocols — never the price.

import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { logAudit } from '@/lib/audit'
import { config } from '@/lib/config'
import { validateCouponForCheckout } from '@/lib/coupons'
import { logger } from '@/lib/logger'
import {
  activateMembershipFromOrder,
  buildMembershipOrderItem,
  hasUserTrialed,
  resolveMembershipSelection,
  type MembershipCouponContext,
} from '@/lib/membership-checkout'
import { getPaymentProvider, isPaymentConfigured } from '@/lib/payments'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

const bodySchema = z
  .object({
    plan: z.string().min(1).max(64),
    selectedProtocols: z.array(z.string().min(1).max(64)).max(8).optional(),
    promoCode: z.string().trim().max(64).optional(),
    // Affiliate referral code captured client-side (Tapfiliate `?ref=`), so a
    // paid membership can be attributed server-side.
    ref: z.string().trim().max(200).optional(),
    // Start a 7-day free trial ($0 now, first charge at trial end) instead of an
    // immediate first-month charge. Honored only when membershipTrialEnabled and
    // no promo code is applied (a comped/discounted trial makes no sense).
    trial: z.boolean().optional(),
  })
  .strict()

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status })
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return jsonError(401, 'Unauthorized')

    // Payment provider must be configured — otherwise serve a graceful 503 so
    // the client can show "checkout temporarily unavailable" (same contract as
    // the product checkout route).
    if (!isPaymentConfigured()) {
      return jsonError(503, 'Payments are not available right now')
    }

    const rl = rateLimit(`membership-checkout:${user.id}`, 20, 60_000)
    if (!rl.success) return jsonError(429, 'Too many requests')

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError(400, 'Invalid request')
    const { plan, selectedProtocols } = parsed.data

    const resolved = resolveMembershipSelection(plan, selectedProtocols)
    if ('error' in resolved) {
      return jsonError(400, resolved.error)
    }
    const { tier, peptides } = resolved
    const referralCode = parsed.data.ref?.trim() || null

    // Promo / coupon code. Two sources, resolved to a discount off the list
    // tier price:
    //   1. Legacy env comp codes (MEMBERSHIP_FREE_PROMO_CODES) → 100% off.
    //   2. Admin-managed DB coupons (migration 047) → any % or $ off, with
    //      caps/expiry enforced by validateCouponForCheckout.
    // A coupon that zeroes the charge is comped one-time (activated now, no
    // provider). A partial discount is charged ONCE at the discounted price via
    // the provider (no recurring) — so the webhook amount-integrity check (which
    // compares against order.total_cents) always matches, and a leaked code can
    // never create a perpetual auto-billing discount.
    const promoCode = parsed.data.promoCode?.trim()
    if (promoCode) {
      const normalized = promoCode.toUpperCase()
      const supabase = createAdminClient()
      const appUrl = config.app.url

      let coupon: MembershipCouponContext | null = null
      let discountCents: number
      let finalCents: number

      if (config.membership.freePromoCodes.includes(normalized)) {
        // Env comp code: full comp, not tracked as a DB coupon redemption.
        discountCents = tier.priceCents
        finalCents = 0
      } else {
        const result = await validateCouponForCheckout(supabase, {
          code: normalized,
          userId: user.id,
          organizationId: user.organization_id,
          subtotalCents: tier.priceCents,
          appliesTo: 'membership',
        })
        if (!result.ok) return jsonError(400, result.error)
        coupon = {
          id: result.coupon.id,
          code: result.coupon.code,
          discountCents: result.discountCents,
        }
        discountCents = result.discountCents
        finalCents = result.finalCents
      }

      const comped = finalCents <= 0
      const item = buildMembershipOrderItem(tier, peptides, false, coupon, referralCode)

      // --- Comp ($0): activate immediately, no provider charge. ---
      if (comped) {
        const { data: compOrder, error: compError } = await supabase
          .from('orders')
          .insert({
            user_id: user.id,
            total_cents: 0,
            currency: 'usd',
            status: 'paid',
            items: [item],
            organization_id: user.organization_id,
            contact_email: user.email,
            payment_provider: coupon ? 'coupon' : 'promo',
            payment_status: 'succeeded',
            prescriberx_status: 'not_sent',
          })
          .select('id')
          .single()

        if (compError || !compOrder) {
          logger.error('membership checkout: comp order INSERT failed', {
            userId: user.id,
            error: compError?.message,
          })
          return jsonError(500, 'Internal server error')
        }

        const compOrderId = compOrder.id as string
        const activated = await activateMembershipFromOrder(supabase, {
          id: compOrderId,
          user_id: user.id,
          items: [item],
          payment_reference: null,
        })
        if (!activated) {
          logger.error('membership checkout: comp activation failed', {
            userId: user.id,
            orderId: compOrderId,
          })
          return jsonError(500, 'Failed to activate membership')
        }

        void logAudit({
          userId: user.id,
          action: 'order.created',
          resourceType: 'order',
          resourceId: compOrderId,
          details: {
            total_cents: 0,
            kind: 'membership',
            plan: tier.slug,
            promo: true,
            coupon: coupon?.code ?? null,
          },
        }).catch(() => {})

        return Response.json({
          success: true,
          data: {
            orderId: compOrderId,
            sessionUrl: `${appUrl}/checkout/success?orderId=${compOrderId}&kind=membership`,
            comped: true,
          },
        })
      }

      // --- Partial discount: one-time discounted charge via the provider. ---
      const provider = getPaymentProvider()
      const { data: discOrder, error: discError } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          total_cents: finalCents,
          currency: 'usd',
          status: 'pending',
          items: [item],
          organization_id: user.organization_id,
          contact_email: user.email,
          payment_provider: provider.name,
          payment_status: 'pending',
          prescriberx_status: 'not_sent',
        })
        .select('id')
        .single()

      if (discError || !discOrder) {
        logger.error('membership checkout: discounted order INSERT failed', {
          userId: user.id,
          error: discError?.message,
        })
        return jsonError(500, 'Internal server error')
      }

      const discOrderId = discOrder.id as string

      void logAudit({
        userId: user.id,
        action: 'order.created',
        resourceType: 'order',
        resourceId: discOrderId,
        details: {
          total_cents: finalCents,
          kind: 'membership',
          plan: tier.slug,
          coupon: coupon?.code ?? null,
          discount_cents: discountCents,
        },
      }).catch(() => {})

      let discSession
      try {
        discSession = await provider.createCheckoutSession({
          orderId: discOrderId,
          amountCents: finalCents,
          currency: 'usd',
          customerEmail: user.email,
          successUrl: `${appUrl}/checkout/success?orderId=${discOrderId}&kind=membership`,
          cancelUrl: `${appUrl}/checkout/cancel?orderId=${discOrderId}`,
          metadata: {
            orderId: discOrderId,
            userId: user.id,
            kind: 'membership',
            plan: tier.slug,
            coupon: coupon?.code ?? '',
          },
        })
      } catch (sessionError: unknown) {
        logger.error('membership checkout: discounted session creation failed', {
          userId: user.id,
          orderId: discOrderId,
          provider: provider.name,
          error:
            sessionError instanceof Error
              ? sessionError.message
              : String(sessionError),
        })
        await supabase
          .from('orders')
          .update({ status: 'cancelled', payment_status: 'failed' })
          .eq('id', discOrderId)
          .eq('payment_status', 'pending')
        return jsonError(502, 'Payment provider error')
      }

      await supabase
        .from('orders')
        .update({ payment_reference: discSession.sessionId })
        .eq('id', discOrderId)

      return Response.json({
        success: true,
        data: { orderId: discOrderId, sessionUrl: discSession.sessionUrl },
      })
    }
    // Trial vs immediate. Both use Kurv's MONTHLY recurring contract; they
    // differ only in the FIRST charge:
    //   - Immediate: initial_payment_amount = full tier price (billed now),
    //     recurring series starts +1 month.
    //   - 7-day trial: initial_payment_amount = 0 (nothing now, card tokenized),
    //     recurring series starts +7 DAYS so the first REAL charge lands at
    //     trial end and auto-converts the membership to active.
    // (Probed live: Kurv rejects amount:0 but ACCEPTS amount:<price> +
    //  initial_payment_amount:0 + future start — the exact trial shape.)
    const isTrial =
      parsed.data.trial === true && config.features.membershipTrialEnabled
    if (parsed.data.trial === true && !config.features.membershipTrialEnabled) {
      return jsonError(400, 'Free trial is not available right now')
    }

    const item = buildMembershipOrderItem(
      tier,
      peptides,
      true,
      null,
      referralCode,
      isTrial
    )
    const nextChargeDate = new Date()
    if (isTrial) {
      nextChargeDate.setDate(nextChargeDate.getDate() + 7)
    } else {
      nextChargeDate.setMonth(nextChargeDate.getMonth() + 1)
    }
    const startDate = nextChargeDate.toISOString()
    // Charged on the hosted page NOW: full price (immediate) or $0 (trial).
    const initialAmountCents = isTrial ? 0 : tier.priceCents
    // High cap = "until cancelled" (cancellation stops future charges early).
    const TOTAL_MONTHLY_PAYMENTS = 120

    const provider = getPaymentProvider()
    const supabase = createAdminClient()

    // One free trial per user: refuse a second $0 window if this user has ever
    // started a trial (any subscription row with trial_started_at set). Without
    // this the paywall resets by re-running trial checkout. Fails closed.
    if (isTrial && (await hasUserTrialed(supabase, user.id))) {
      return jsonError(
        400,
        'You have already used your free trial. Choose a plan to continue.'
      )
    }

    const { data: insertData, error: insertError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        total_cents: tier.priceCents,
        currency: 'usd',
        status: 'pending',
        items: [item],
        organization_id: user.organization_id,
        contact_email: user.email,
        payment_provider: provider.name,
        payment_status: 'pending',
        prescriberx_status: 'not_sent',
      })
      .select('id')
      .single()

    if (insertError || !insertData) {
      logger.error('membership checkout: orders INSERT failed', {
        userId: user.id,
        error: insertError?.message,
      })
      return jsonError(500, 'Internal server error')
    }

    const orderId = insertData.id as string

    void logAudit({
      userId: user.id,
      action: 'order.created',
      resourceType: 'order',
      resourceId: orderId,
      details: {
        total_cents: tier.priceCents,
        kind: 'membership',
        plan: tier.slug,
      },
    }).catch((err: unknown) => {
      logger.error('membership checkout: audit log failed', {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    const appUrl = config.app.url

    let session
    try {
      session = await provider.createCheckoutSession({
        orderId,
        amountCents: tier.priceCents,
        currency: 'usd',
        customerEmail: user.email,
        successUrl: `${appUrl}/checkout/success?orderId=${orderId}&kind=membership${isTrial ? '&trial=1' : ''}`,
        cancelUrl: `${appUrl}/checkout/cancel?orderId=${orderId}`,
        recurring: {
          interval: 'monthly',
          startDate,
          initialAmountCents,
          totalPayments: TOTAL_MONTHLY_PAYMENTS,
        },
        metadata: {
          orderId,
          userId: user.id,
          kind: 'membership',
          plan: tier.slug,
        },
      })
    } catch (sessionError: unknown) {
      logger.error('membership checkout: provider session creation failed', {
        userId: user.id,
        orderId,
        provider: provider.name,
        error:
          sessionError instanceof Error
            ? sessionError.message
            : String(sessionError),
      })
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
      logger.error('membership checkout: payment_reference UPDATE failed', {
        orderId,
        error: updateError.message,
      })
      // Non-fatal: the webhook/verify path can still correlate via metadata.
    }

    return Response.json({
      success: true,
      data: { orderId, sessionUrl: session.sessionUrl },
    })
  } catch (error: unknown) {
    logger.error('membership checkout: unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonError(500, 'Internal server error')
  }
}
