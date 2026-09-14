/**
 * Coupon check flow (Nextvial-aligned):
 * 1) Top layer — groupon/check-coupon (Sema vs Tirz product eligibility)
 * 2) Existing — check_coupons_v3 (site_id=612) or Juvenex Check_Coupons fallback
 */
import type { NextRequest } from 'next/server'
import { juvenexClient } from '@/lib/juvenex/client'
import { filterProductsByGrouponCheck } from '@/lib/juvenex/groupon-check'
import { z } from 'zod'
import { clientIp, parseBody, rateLimited, upstreamError } from '@/lib/juvenex/route-utils'

export const runtime = 'nodejs'

const CHECK_COUPONS_V3_URL =
  process.env.CHECK_COUPONS_V3_URL ||
  'https://panel.whitelabelmd.com/wlmdbackend/api/check_coupons_v3'

const bodySchema = z.object({
  promo_code: z.string().trim().min(1).max(100),
  /** Single id (legacy per-line) or many (cart-level IdunRX style). */
  product_id: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1))]).optional(),
  product_ids: z.array(z.string().trim().min(1)).optional(),
  email: z.string().trim().email().max(320).optional(),
})

export async function POST(request: NextRequest) {
  const limited = rateLimited(`juvenex-coupon:${clientIp(request)}`, 30)
  if (limited) return limited
  const parsed = await parseBody(request, bodySchema)
  if ('response' in parsed) return parsed.response

  const codeLimited = rateLimited(
    `juvenex-coupon-code:${parsed.data.promo_code.toLowerCase()}`,
    20
  )
  if (codeLimited) return codeLimited

  const ids = normalizeProductIds(parsed.data)
  if (!ids.length) {
    return Response.json({ error: 'product_id is required' }, { status: 400 })
  }

  try {
    // 1) Top layer — identify which bag products this Groupon/coupon works for.
    const grouponGate = await filterProductsByGrouponCheck(ids, parsed.data.promo_code)
    if (!grouponGate.ok) {
      return Response.json(
        {
          status: 0,
          message: grouponGate.message,
          error: grouponGate.message,
        },
        { status: 200 }
      )
    }
    const eligibleIds = grouponGate.productIds

    const siteIdRaw = process.env.JUVENEX_CHECKOUT_SITE_ID
    const siteId = siteIdRaw ? Number(siteIdRaw) : NaN

    // 2) Existing coupon API — only for products that passed the Groupon gate.
    if (Number.isFinite(siteId) && siteId > 0) {
      const upstream = await fetch(CHECK_COUPONS_V3_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId,
          promo_codes: parsed.data.promo_code,
          product_id: eligibleIds.join(','),
          email: parsed.data.email || '',
        }),
      })
      const json: {
        status?: number | boolean
        message?: string
        code?: string
        discount_amount?: string | number
        discount_percent?: string | number
        data?: {
          code?: string
          discount_amount?: string | number
          discount_percent?: string | number
        }
      } = await upstream.json().catch(() => ({}))

      const ok = json.status === 1 || json.status === true
      if (!ok) {
        return Response.json(
          { status: 0, message: json.message || 'Invalid code', error: json.message || 'Invalid code' },
          { status: 200 }
        )
      }

      const data = json.data || {}
      const code = data.code || json.code || parsed.data.promo_code
      const discount =
        data.discount_amount ?? json.discount_amount ?? data.discount_percent ?? json.discount_percent ?? '0'

      return Response.json({
        status: 1,
        message: 'ok',
        data: {
          code: String(code),
          discount_amount: String(discount),
        },
        product_ids: eligibleIds,
        groupon_checked: true,
      })
    }

    // Fallback — existing Juvenex Check_Coupons (first eligible product).
    const first = eligibleIds[0]
    const result = await juvenexClient.checkCoupon({
      promo_code: parsed.data.promo_code,
      product_id: first,
    })
    return Response.json({
      ...result,
      product_ids: eligibleIds,
      groupon_checked: true,
    })
  } catch (error: unknown) {
    return upstreamError(error)
  }
}

function normalizeProductIds(data: z.infer<typeof bodySchema>): string[] {
  if (Array.isArray(data.product_ids) && data.product_ids.length) return data.product_ids
  if (Array.isArray(data.product_id)) return data.product_id
  if (typeof data.product_id === 'string' && data.product_id.includes(',')) {
    return data.product_id.split(',').map((s) => s.trim()).filter(Boolean)
  }
  if (typeof data.product_id === 'string' && data.product_id) return [data.product_id]
  return []
}
