/**
 * Dummy-card checkout → IdunRX-style `createOrder_test`.
 * Upstream: https://panel.whitelabelmd.com/Juvenex/api/createOrder_test
 *
 * Stripe path (create-intent / finalize) remains separate and is gated off
 * while NEXT_PUBLIC_JX_USE_DUMMY_CARD=true.
 */
import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { createOrderTestSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'
import { persistJuvenexOrder } from '@/lib/juvenex/persist-order'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

const UPSTREAM_SUCCESS = 1

export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if ('response' in auth) return auth.response
  const parsed = await parseBody(request, createOrderTestSchema)
  if ('response' in parsed) return parsed.response
  if (parsed.data.email.toLowerCase() !== auth.user.email.toLowerCase()) {
    return Response.json({ error: 'Order email must match the signed-in user' }, { status: 403 })
  }

  try {
    const result = await juvenexClient.createOrderTest(parsed.data)
    const orderIds =
      result.order_ids?.length
        ? result.order_ids
        : result.order_id
          ? [String(result.order_id)]
          : []

    if (result?.status === UPSTREAM_SUCCESS && orderIds.length) {
      const d = parsed.data
      const billingSeparate = d.billingSameAsShipping === 'NO'
      const shipping = {
        address: d.address,
        address2: d.address2,
        city_name: d.city_name,
        state_name: d.state_name,
        zip_code: d.zip_code,
      }
      const billing = billingSeparate
        ? {
            address: d.billing_address ?? '',
            city_name: d.billing_city_name ?? '',
            state_name: d.billing_state_name ?? '',
            zip_code: d.billing_zip_code ?? '',
          }
        : shipping

      for (let i = 0; i < orderIds.length; i++) {
        const product = d.products[Math.min(i, d.products.length - 1)]
        try {
          await persistJuvenexOrder({
            user_id: auth.user.id,
            product_id: String(product.product_id),
            vendor_order_id: String(orderIds[i]),
            vendor_status: String(result.status),
            contact_email: d.email,
            shipping_address: shipping,
            billing_address: billing,
            first_name: d.first_name,
            last_name: d.last_name,
            phone: d.phone,
          })
        } catch (persistError: unknown) {
          logger.error('juvenex/orders: order persistence threw unexpectedly', {
            userId: auth.user.id,
            orderId: String(orderIds[i]),
            error: persistError instanceof Error ? persistError.message : String(persistError),
          })
        }
      }
    }

    return Response.json({
      ...result,
      order_id: orderIds[0] ?? result.order_id,
      order_ids: orderIds.length ? orderIds : result.order_ids,
    })
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
