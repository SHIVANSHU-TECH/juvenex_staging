/**
 * Record createOrder_test successes locally (no card data).
 * Client places the order directly at panel.whitelabelmd.com (IdunRX-style);
 * this route only mirrors order ids into our DB for history/confirm email.
 */
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { parseBody, requireUser } from '@/lib/juvenex/route-utils'
import { persistJuvenexOrder } from '@/lib/juvenex/persist-order'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

const recordSchema = z.object({
  email: z.string().trim().email().max(320),
  first_name: z.string().trim().min(1).max(255),
  last_name: z.string().trim().min(1).max(255),
  phone: z.string().trim().min(7).max(40),
  address: z.string().trim().min(1).max(500),
  address2: z.string().trim().max(500).optional(),
  city_name: z.string().trim().min(1).max(255),
  state_name: z.string().trim().min(2).max(100),
  zip_code: z.string().trim().min(3).max(20),
  billingSameAsShipping: z.enum(['YES', 'NO']).optional(),
  billing_address: z.string().trim().max(500).optional(),
  billing_city_name: z.string().trim().max(255).optional(),
  billing_state_name: z.string().trim().max(100).optional(),
  billing_zip_code: z.string().trim().max(20).optional(),
  order_ids: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  products: z
    .array(
      z.object({
        product_id: z.coerce.number().int().positive(),
        product_price: z.coerce.number().nonnegative().finite(),
      })
    )
    .min(1)
    .max(20),
})

export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if ('response' in auth) return auth.response
  const parsed = await parseBody(request, recordSchema)
  if ('response' in parsed) return parsed.response

  if (parsed.data.email.toLowerCase() !== auth.user.email.toLowerCase()) {
    return Response.json({ error: 'Order email must match the signed-in user' }, { status: 403 })
  }

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

  for (let i = 0; i < d.order_ids.length; i++) {
    const product = d.products[Math.min(i, d.products.length - 1)]
    try {
      await persistJuvenexOrder({
        user_id: auth.user.id,
        product_id: String(product.product_id),
        vendor_order_id: String(d.order_ids[i]),
        vendor_status: '1',
        contact_email: d.email,
        shipping_address: shipping,
        billing_address: billing,
        first_name: d.first_name,
        last_name: d.last_name,
        phone: d.phone,
        product_price: String(product.product_price),
      })
    } catch (error: unknown) {
      logger.error('juvenex/orders/record: persist threw', {
        userId: auth.user.id,
        orderId: d.order_ids[i],
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return Response.json({ status: 1, recorded: d.order_ids.length })
}
