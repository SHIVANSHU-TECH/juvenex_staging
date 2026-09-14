/**
 * Turns one authorized PaymentIntent into N vendor orders, atomically on the
 * money side.
 *
 * THE CONTRACT
 * The client has already run `stripe.confirmPayment`, so the card is
 * AUTHORIZED but not captured (`requires_capture`). This route then:
 *   1. proves the intent belongs to the signed-in user,
 *   2. calls `Create_Order_Offline` once per line, sequentially, every call
 *      carrying the SAME `payment_token` (the intent id),
 *   3. captures on total success, cancels the authorization on any failure.
 * The customer therefore ends up either charged with a full set of orders, or
 * not charged at all. Never partially charged.
 *
 * WHAT THIS DOES NOT UNDO
 * Cancelling the hold does not delete vendor orders that already succeeded
 * earlier in the same bag. Those ids come back in `completedOrderIds` and are
 * logged at error level: the customer is not out any money, but support has
 * orders to void upstream. Making that automatic needs a vendor cancel call we
 * do not have today.
 *
 * ORDERING
 * Persistence and the confirmation email happen only after a successful
 * capture, so nothing is recorded or emailed for money that was released.
 */
import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { finalizeOrderSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser } from '@/lib/juvenex/route-utils'
import { persistJuvenexOrder } from '@/lib/juvenex/persist-order'
import { getStripeClient, paymentNotConfigured } from '@/lib/juvenex/stripe'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

/** Upstream success. 5 = declined, 0 = validation error (see schemas.ts). */
const UPSTREAM_SUCCESS = 1

/** Releases the hold, never throwing — the caller is already on a failure path. */
async function releaseHold(
  stripe: NonNullable<ReturnType<typeof getStripeClient>>,
  intentId: string,
  userId: string
): Promise<void> {
  try {
    await stripe.paymentIntents.cancel(intentId)
  } catch (error: unknown) {
    // The customer keeps an authorization hold that will expire on its own,
    // but it must be visible to us in the meantime.
    logger.error('finalize: could not cancel authorization — hold left standing', {
      userId,
      intentId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(5, 'finalize')
  if ('response' in auth) return auth.response

  const parsed = await parseBody(request, finalizeOrderSchema)
  if ('response' in parsed) return parsed.response

  const stripe = getStripeClient()
  if (!stripe) return paymentNotConfigured()

  const { intent_id: intentId, lines } = parsed.data
  const sessionEmail = auth.user.email.toLowerCase()

  // Every line must be addressed to the signed-in user, same rule the other
  // order routes enforce.
  if (lines.some((line) => line.email.toLowerCase() !== sessionEmail)) {
    return Response.json(
      { error: 'Order email must match the signed-in user' },
      { status: 403 }
    )
  }

  let intent
  try {
    intent = await stripe.paymentIntents.retrieve(intentId)
  } catch (error: unknown) {
    logger.warn('finalize: intent lookup failed', {
      userId: auth.user.id,
      intentId,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      { error: 'payment_not_found', message: 'That payment could not be found.' },
      { status: 404 }
    )
  }

  // Ownership: the intent's metadata was written by create-intent under this
  // user's session. Checking it here is what stops one customer from
  // finalizing another's authorization into their own orders.
  const intentUserId = intent.metadata?.juvenex_user_id
  const intentEmail = (intent.metadata?.juvenex_email ?? '').toLowerCase()
  if (intentUserId !== auth.user.id || intentEmail !== sessionEmail) {
    logger.warn('finalize: rejected — intent does not belong to caller', {
      userId: auth.user.id,
      intentId,
    })
    return Response.json(
      { error: 'This payment does not belong to your account.' },
      { status: 403 }
    )
  }

  // Only an authorized-not-captured intent may be finalized. Anything else is
  // a replay (already captured), an abandoned attempt, or a card that never
  // completed — none of which may become orders.
  if (intent.status !== 'requires_capture') {
    return Response.json(
      {
        error: 'payment_not_authorized',
        message:
          intent.status === 'succeeded'
            ? 'This payment has already been completed.'
            : 'This payment was not authorized. No card was charged.',
        status: intent.status,
      },
      { status: 409 }
    )
  }

  const completedOrderIds: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    let orderId: string | undefined
    let failure: string | null = null

    try {
      const result = await juvenexClient.createOfflineOrder({
        ...line,
        // The authorization is the payment. Discounts were already applied to
        // the amount Stripe holds, so passing promo_codes here would ask the
        // vendor to discount a second time.
        promo_codes: null,
        payment_token: intentId,
      })
      if (result?.status === UPSTREAM_SUCCESS && result.order_id) {
        orderId = String(result.order_id)
      } else {
        failure = result?.message || 'The order system rejected this item.'
      }
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : 'Could not reach the order system.'
    }

    if (failure || !orderId) {
      await releaseHold(stripe, intentId, auth.user.id)
      if (completedOrderIds.length > 0) {
        // Money released, but these upstream orders are real and now unpaid.
        logger.error('finalize: bag failed after partial success — orphaned vendor orders', {
          userId: auth.user.id,
          intentId,
          orphanedOrderIds: completedOrderIds,
          failedProductId: line.product_id,
        })
      }
      return Response.json({
        success: false,
        completedOrderIds,
        failedAtLine: i,
        failedProductId: line.product_id,
        error: failure ?? 'The order system rejected this item.',
        message: 'No payment was taken — your card authorization has been released.',
      })
    }

    completedOrderIds.push(orderId)
  }

  // Every line has an order. Take the money.
  try {
    await stripe.paymentIntents.capture(intentId)
  } catch (error: unknown) {
    // Orders exist upstream but the charge did not complete. Deliberately NOT
    // reported as a retryable failure: retrying would duplicate the orders.
    logger.error('finalize: capture failed after all vendor orders succeeded', {
      userId: auth.user.id,
      intentId,
      orderIds: completedOrderIds,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      {
        success: false,
        captured: false,
        completedOrderIds,
        error: 'capture_failed',
        message:
          'Your orders were placed but the payment did not complete. Do not re-order — support has been notified.',
      },
      { status: 502 }
    )
  }

  // Mirror locally so history and admin tooling do not depend on the vendor
  // being reachable. As in the legacy route, persistence can never turn an
  // already-captured order into an API failure.
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    try {
      const billingSeparate = line.billingSameAsShipping === 'NO'
      const shipping = {
        address: line.address,
        address2: line.address2,
        city_name: line.city_name,
        state_name: line.state_name,
        zip_code: line.zip_code,
      }
      await persistJuvenexOrder({
        user_id: auth.user.id,
        product_id: String(line.product_id),
        vendor_order_id: completedOrderIds[i],
        vendor_status: String(UPSTREAM_SUCCESS),
        contact_email: line.email,
        shipping_address: shipping,
        billing_address: billingSeparate
          ? {
              address: line.billing_address ?? '',
              city_name: line.billing_city_name ?? '',
              state_name: line.billing_state_name ?? '',
              zip_code: line.billing_zip_code ?? '',
            }
          : shipping,
        first_name: line.first_name,
        last_name: line.last_name,
        phone: line.phone,
      })
    } catch (persistError: unknown) {
      logger.error('finalize: order persistence threw unexpectedly', {
        userId: auth.user.id,
        orderId: completedOrderIds[i],
        error: persistError instanceof Error ? persistError.message : String(persistError),
      })
    }
  }

  return Response.json({ success: true, captured: true, orderIds: completedOrderIds })
}
