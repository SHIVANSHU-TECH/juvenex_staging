import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { provisionOrgAdmin, ProvisioningError } from '@/lib/org-admin-provision'
import { rateLimit } from '@/lib/rate-limit'
import { isAllowedImageUrl, IMAGE_URL_ALLOWLIST_MESSAGE } from '@/lib/url-allowlist'

const whiteLabelSignupSchema = z.object({
  organizationName: z.string().min(2, 'Organization name is required').max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only'),
  type: z.enum(['clinic', 'practice', 'hospital', 'wellness_center']).default('clinic'),
  email: z.string().email('Business email is required').max(254),
  phone: z.string().max(20).optional(),
  website: z.string().url().max(500).optional().or(z.literal('')),
  logoUrl: z
    .string()
    .url()
    .refine(isAllowedImageUrl, IMAGE_URL_ALLOWLIST_MESSAGE)
    .optional()
    .or(z.literal('')),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a valid hex color')
    .default('#8FA888'),
  fulfillmentName: z.string().min(1, 'Fulfillment recipient is required').max(200),
  fulfillmentPhone: z.string().max(20).optional(),
  fulfillmentStreet: z.string().min(1, 'Fulfillment street is required').max(200),
  fulfillmentApt: z.string().max(100).optional(),
  fulfillmentCity: z.string().min(1, 'Fulfillment city is required').max(100),
  fulfillmentState: z.string().min(1, 'Fulfillment state is required').max(100),
  fulfillmentZip: z.string().min(1, 'Fulfillment ZIP is required').max(32),
  adminFirstName: z.string().min(1, 'First name is required').max(80),
  adminLastName: z.string().min(1, 'Last name is required').max(80),
  adminEmail: z.string().email('Admin email is required').max(254),
  adminPassword: z.string().min(12, 'Password must be at least 12 characters').max(128),
})

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

function referralCodeFromSlug(slug: string): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${slug.replace(/-/g, '').slice(0, 10).toUpperCase()}-${suffix}`
}

export async function POST(request: NextRequest): Promise<Response> {
  const ip = getClientIp(request)
  // Logo uploads now go through /api/white-label/logo (its own budget), so a
  // failed logo pick no longer consumes a signup attempt. Allow a reasonable
  // number of genuine retries (slug taken, fixing a field) before throttling.
  const rl = rateLimit(`white-label-signup:${ip}`, 8, 10 * 60_000)
  if (!rl.success) {
    return Response.json(
      { success: false, error: 'Too many signup attempts. Please try again in a few minutes.' },
      { status: 429 }
    )
  }

  try {
    const body = await request.json().catch(() => null)
    const parsed = whiteLabelSignupSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const input = parsed.data
    const supabase = getSupabase()

    const { data: existingSlug } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', input.slug)
      .maybeSingle()

    if (existingSlug) {
      return Response.json(
        { success: false, error: 'That white-label URL is already taken' },
        { status: 409 }
      )
    }

    const referralCode = referralCodeFromSlug(input.slug)
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: input.organizationName,
        slug: input.slug,
        type: input.type,
        email: input.email,
        phone: input.phone || null,
        website: input.website || null,
        logo_url: input.logoUrl || null,
        primary_color: input.primaryColor,
        brand_name: input.organizationName,
        brand_primary_color: input.primaryColor,
        brand_logo_url: input.logoUrl || null,
        referral_code: referralCode,
        fulfillment_name: input.fulfillmentName,
        fulfillment_phone: input.fulfillmentPhone || null,
        fulfillment_street: input.fulfillmentStreet,
        fulfillment_apt: input.fulfillmentApt || null,
        fulfillment_city: input.fulfillmentCity,
        fulfillment_state: input.fulfillmentState,
        fulfillment_zip: input.fulfillmentZip,
        fulfillment_country: 'US',
      })
      .select('id, name, slug, type, logo_url, primary_color, referral_code')
      .single()

    if (orgError || !orgData) {
      logger.error('white-label signup: organization insert failed', {
        error: orgError?.message,
      })
      return Response.json(
        { success: false, error: 'Could not create white-label account' },
        { status: 500 }
      )
    }

    try {
      const admin = await provisionOrgAdmin(supabase, {
        organizationId: orgData.id as string,
        email: input.adminEmail,
        firstName: input.adminFirstName,
        lastName: input.adminLastName,
        password: input.adminPassword,
      })

      await logAudit({
        userId: admin.adminId,
        action: 'white_label_signup',
        resourceType: 'organization',
        resourceId: orgData.id as string,
        ipAddress: ip,
      }).catch(() => {})

      return Response.json(
        {
          success: true,
          data: {
            organization: orgData,
            admin: {
              id: admin.adminId,
              email: admin.adminEmail,
            },
            loginUrl: '/login',
            orgUrl: `/org/${input.slug}`,
          },
        },
        { status: 201 }
      )
    } catch (error: unknown) {
      await supabase.from('organizations').delete().eq('id', orgData.id)

      if (error instanceof ProvisioningError && error.message.includes('already been registered')) {
        return Response.json(
          { success: false, error: 'An account with this admin email already exists' },
          { status: 409 }
        )
      }

      logger.error('white-label signup: admin provisioning failed', {
        orgId: orgData.id,
        stage: error instanceof ProvisioningError ? error.stage : 'unknown',
      })
      return Response.json(
        { success: false, error: 'Could not create the admin account' },
        { status: 500 }
      )
    }
  } catch (error: unknown) {
    logger.error('white-label signup error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
