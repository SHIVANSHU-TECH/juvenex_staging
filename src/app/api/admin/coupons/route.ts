import { type NextRequest } from 'next/server'
import { z } from 'zod'

import {
  COUPON_COLUMNS,
  normalizeCouponCode,
  generateCouponCode,
  type Coupon,
} from '@/lib/coupons'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

// GET  /api/admin/coupons        → list all coupons (newest first)
// POST /api/admin/coupons        → create a coupon
// Auth: super_admin only (schema: migration 047_coupons.sql).

const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, 'Use letters, numbers, and hyphens')

const createSchema = z
  .object({
    // Optional — a random code is generated when omitted/blank.
    code: codeSchema.optional().or(z.literal('')),
    description: z.string().trim().max(200).nullable().optional(),
    discount_type: z.enum(['percent', 'fixed']),
    // percent → 1..100; fixed → amount in CENTS (>= 1).
    discount_value: z.coerce.number().int().min(0),
    applies_to: z.enum(['membership', 'all']).default('membership'),
    max_redemptions: z.coerce.number().int().min(1).nullable().optional(),
    per_user_limit: z.coerce.number().int().min(0).max(10_000).default(1),
    expires_at: z.string().trim().datetime().nullable().optional(),
    active: z.boolean().default(true),
    organization_id: z.string().uuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.discount_type === 'percent') {
      if (data.discount_value < 1 || data.discount_value > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discount_value'],
          message: 'Percent discount must be between 1 and 100',
        })
      }
    } else if (data.discount_value < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discount_value'],
        message: 'Fixed discount must be at least 1 cent',
      })
    }
  })

async function requireSuperAdmin() {
  const user = await getAuthUser()
  if (!user) {
    return {
      ok: false as const,
      response: Response.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    }
  }
  if (user.role !== 'super_admin') {
    return {
      ok: false as const,
      response: Response.json(
        { success: false, error: 'Forbidden: super_admin role required' },
        { status: 403 }
      ),
    }
  }
  return { ok: true as const, user }
}

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`admin-coupons:${auth.user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('coupons')
      .select(COUPON_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      logger.error('Admin coupons list error', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    return Response.json({ success: true, data: { coupons: (data ?? []) as Coupon[] } })
  } catch (error: unknown) {
    logger.error('Admin coupons list unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`admin-coupons-create:${auth.user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid coupon', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const p = parsed.data
    const supabase = createAdminClient()

    const baseRow = {
      description: p.description?.trim() || null,
      discount_type: p.discount_type,
      discount_value: p.discount_value,
      applies_to: p.applies_to,
      max_redemptions: p.max_redemptions ?? null,
      per_user_limit: p.per_user_limit,
      expires_at: p.expires_at ?? null,
      active: p.active,
      organization_id: p.organization_id ?? null,
      created_by: auth.user.id,
    }

    // Insert with the provided code, or generate one and retry on collision.
    const explicitCode = p.code ? normalizeCouponCode(p.code) : null
    let lastError: string | undefined
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code =
        explicitCode ?? generateCouponCode(crypto.getRandomValues(new Uint8Array(6)))
      const { data, error } = await supabase
        .from('coupons')
        .insert({ code, ...baseRow })
        .select(COUPON_COLUMNS)
        .single()

      if (!error && data) {
        return Response.json({ success: true, data: { coupon: data as Coupon } }, { status: 201 })
      }
      if (error?.code === '23505') {
        // Duplicate code. If the admin picked it, surface a 409; if generated,
        // loop to try another.
        if (explicitCode) {
          return Response.json(
            { success: false, error: 'A coupon with this code already exists' },
            { status: 409 }
          )
        }
        lastError = error.message
        continue
      }
      logger.error('Admin coupon create error', { error: error?.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    logger.error('Admin coupon create: exhausted code generation attempts', {
      error: lastError,
    })
    return Response.json(
      { success: false, error: 'Could not generate a unique code, try again' },
      { status: 500 }
    )
  } catch (error: unknown) {
    logger.error('Admin coupon create unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
