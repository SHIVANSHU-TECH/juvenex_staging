import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { COUPON_COLUMNS, normalizeCouponCode, type Coupon } from '@/lib/coupons'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

// PATCH  /api/admin/coupons/[id] — edit a coupon (toggle active, change limits…)
// DELETE /api/admin/coupons/[id] — delete a coupon (redemptions cascade)
// Auth: super_admin only.

const idSchema = z.string().uuid()

const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, 'Use letters, numbers, and hyphens')

const updateSchema = z
  .object({
    code: codeSchema.optional(),
    description: z.string().trim().max(200).nullable().optional(),
    discount_type: z.enum(['percent', 'fixed']).optional(),
    discount_value: z.coerce.number().int().min(0).optional(),
    applies_to: z.enum(['membership', 'all']).optional(),
    max_redemptions: z.coerce.number().int().min(1).nullable().optional(),
    per_user_limit: z.coerce.number().int().min(0).max(10_000).optional(),
    expires_at: z.string().trim().datetime().nullable().optional(),
    active: z.boolean().optional(),
    organization_id: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' })
  .superRefine((data, ctx) => {
    // Discount changes must supply BOTH type and value so the value can be
    // range-validated against the type (percent 1..100, fixed ≥ 1 cent).
    const hasType = data.discount_type !== undefined
    const hasValue = data.discount_value !== undefined
    if (hasType !== hasValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discount_value'],
        message: 'Change discount type and value together',
      })
      return
    }
    if (hasType && hasValue) {
      if (data.discount_type === 'percent') {
        if (data.discount_value! < 1 || data.discount_value! > 100) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['discount_value'],
            message: 'Percent discount must be between 1 and 100',
          })
        }
      } else if (data.discount_value! < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discount_value'],
          message: 'Fixed discount must be at least 1 cent',
        })
      }
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`admin-coupons-update:${auth.user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id } = await params
    const idParse = idSchema.safeParse(id)
    if (!idParse.success) {
      return Response.json({ success: false, error: 'Invalid coupon id' }, { status: 400 })
    }

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid update', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Build the update payload, normalizing code + trimming description.
    const u = parsed.data
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (u.code !== undefined) patch.code = normalizeCouponCode(u.code)
    if (u.description !== undefined) patch.description = u.description?.trim() || null
    if (u.discount_type !== undefined) patch.discount_type = u.discount_type
    if (u.discount_value !== undefined) patch.discount_value = u.discount_value
    if (u.applies_to !== undefined) patch.applies_to = u.applies_to
    if (u.max_redemptions !== undefined) patch.max_redemptions = u.max_redemptions
    if (u.per_user_limit !== undefined) patch.per_user_limit = u.per_user_limit
    if (u.expires_at !== undefined) patch.expires_at = u.expires_at
    if (u.active !== undefined) patch.active = u.active
    if (u.organization_id !== undefined) patch.organization_id = u.organization_id

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('coupons')
      .update(patch)
      .eq('id', idParse.data)
      .select(COUPON_COLUMNS)
      .single()

    if (error) {
      if (error.code === '23505') {
        return Response.json(
          { success: false, error: 'A coupon with this code already exists' },
          { status: 409 }
        )
      }
      if (error.code === 'PGRST116') {
        return Response.json({ success: false, error: 'Coupon not found' }, { status: 404 })
      }
      logger.error('Admin coupon update error', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    return Response.json({ success: true, data: { coupon: data as Coupon } })
  } catch (error: unknown) {
    logger.error('Admin coupon update unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`admin-coupons-delete:${auth.user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { id } = await params
    const idParse = idSchema.safeParse(id)
    if (!idParse.success) {
      return Response.json({ success: false, error: 'Invalid coupon id' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase.from('coupons').delete().eq('id', idParse.data)
    if (error) {
      logger.error('Admin coupon delete error', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    return Response.json({ success: true, data: { deleted: idParse.data } })
  } catch (error: unknown) {
    logger.error('Admin coupon delete unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
