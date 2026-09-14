import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { signToken } from '@/lib/jwt'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { peptidesForPlan } from '@/lib/marketplace-access'

const PAID_TIER_SLUGS = [
  'base',
  'tier_2',
  'unlimited',
  'metabolic_reset',
  'optimization',
  'optimization_metabolic',
  'completely_optimized',
] as const

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  referralCode: z.string().optional(),
  inviteCode: z.string().optional(),
  membershipTier: z.enum([
    'free',
    'base',
    'tier_2',
    'unlimited',
    'metabolic_reset',
    'optimization',
    'optimization_metabolic',
    'completely_optimized',
  ]).optional(),
  selectedProtocols: z.array(z.string()).optional(),
})

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Resolve the organization_id to assign to a new user.
 *
 * Priority:
 *  1. DEFAULT_ORGANIZATION_ID env var (explicit single-tenant config)
 *  2. The oldest organizations row by created_at (deterministic fallback for
 *     single-tenant deployments that have exactly one org)
 *
 * Returns null only if no organization exists at all (brand-new empty DB).
 * In that case we still create the user; they just won't be able to create
 * community posts until an org row is seeded.
 */
async function resolveDefaultOrganizationId(
  supabase: ReturnType<typeof getSupabase>
): Promise<string | null> {
  const envId = process.env.DEFAULT_ORGANIZATION_ID
  if (envId && envId.length > 0) return envId

  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.warn('auth/register: failed to resolve default organization', {
      error: error.message,
    })
    return null
  }
  return (data?.id as string | undefined) ?? null
}

/**
 * Resolve the organization a new user belongs to.
 *
 * If they signed up via an org referral link (/register?ref=<referral_code>),
 * the new profile MUST be scoped to THAT org — otherwise it lands on the main
 * Juvenex org and TenantGuard bounces them out of the tenant they joined from.
 * Only when there is no (or no matching) referral code do we fall back to the
 * default single-tenant org.
 *
 * Note: this is the ONLY place an org is assigned from a client-supplied code,
 * and it happens exactly once at account creation. Login never re-derives the
 * org from a client value (that would be a tenant-spoofing hole) — it reads the
 * org already stored on the profile.
 */
async function resolveOrganizationId(
  supabase: ReturnType<typeof getSupabase>,
  referralCode: string | null | undefined
): Promise<string | null> {
  if (referralCode && referralCode.trim().length > 0) {
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .eq('referral_code', referralCode.trim())
      .maybeSingle()
    if (error) {
      logger.warn('auth/register: referral_code org lookup failed', {
        error: error.message,
      })
    } else if (data?.id) {
      return data.id as string
    }
  }
  return resolveDefaultOrganizationId(supabase)
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown'
  const rateLimitKey = `register:${ip}`
  const rl = rateLimit(rateLimitKey, 20, 60_000)
  if (!rl.success) {
    return NextResponse.json(
      { success: false, error: 'Too many registration attempts. Please try again later.' },
      { status: 429 }
    )
  }

  try {
    const body = await request.json()
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { email, password, name, phone, referralCode, membershipTier, selectedProtocols } = parsed.data
    // selectedProtocols are the chosen peptide slugs; resolve + clamp them to
    // the tier's limit (Unlimited expands to every peptide) before storing.
    const accessProtocols = [...peptidesForPlan(membershipTier, selectedProtocols)]
    const supabase = getSupabase()

    // Resolve the organization for the new user. When they came in via an org
    // referral link (?ref=<referral_code>), scope them to THAT org so they
    // stay inside the tenant they signed up from; otherwise fall back to the
    // default org. All posts require organization_id, so this is also what
    // lets a new signup immediately use community features.
    const defaultOrgId = await resolveOrganizationId(supabase, referralCode)

    // Create user via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, phone, selected_protocols: accessProtocols },
    })

    if (authError || !authData.user) {
      if (authError?.message?.includes('already been registered')) {
        return NextResponse.json(
          { success: false, error: 'An account with this email already exists' },
          { status: 409 }
        )
      }
      logger.error('auth/register createUser failed', {
        email,
        error: authError?.message ?? 'No user returned',
      })
      return NextResponse.json(
        { success: false, error: 'Registration failed' },
        { status: 500 }
      )
    }

    // The auth.users trigger normally creates this row. Keep a fallback so a
    // trigger hiccup does not make signup look broken to the user.
    // organization_id is included here so both the trigger-created row and the
    // upsert path end up org-scoped, allowing immediate community access.
    const profilePayload: Record<string, unknown> = {
      id: authData.user.id,
      email,
      name,
      phone: phone || null,
      role: 'patient',
    }
    if (defaultOrgId) profilePayload.organization_id = defaultOrgId

    const { error: profileUpsertError } = await supabase
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })

    if (profileUpsertError) {
      logger.error('auth/register profile upsert failed', {
        userId: authData.user.id,
        error: profileUpsertError.message,
      })
      return NextResponse.json(
        { success: false, error: 'Could not finish creating your profile. Please try again.' },
        { status: 500 }
      )
    }

    // Get the created profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, email, phone, role, organization_id')
      .eq('id', authData.user.id)
      .single()

    // Tier-on-signup: paid tiers get a pending subscription row.
    // Free tier (default) creates no subscription row.
    const isPaidTier = membershipTier != null &&
      (PAID_TIER_SLUGS as readonly string[]).includes(membershipTier)
    if (isPaidTier && membershipTier) {
      const { error: subError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: authData.user.id,
          plan: membershipTier,
          status: 'pending',
          selected_protocols: accessProtocols,
        })
      if (subError) {
        logger.error('auth/register subscription create failed', {
          userId: authData.user.id,
          plan: membershipTier,
          error: subError.message,
        })
      }
    }

    const token = signToken(authData.user.id)

    await logAudit({
      userId: authData.user.id,
      action: 'register',
      resourceType: 'auth',
      ipAddress: ip,
    })

    const userPayload = {
      id: authData.user.id,
      email: authData.user.email || email,
      name: profile?.name || name,
      role: profile?.role || 'patient',
      organizationId: profile?.organization_id || null,
      phone: profile?.phone || phone || null,
    }

    // Envelope: standardized `success` + `data`. Top-level `user` / `token`
    // remain for backwards-compatibility with existing fetchApi clients.
    return NextResponse.json({
      success: true,
      data: { user: userPayload, token },
      user: userPayload,
      token,
    })
  } catch (error: unknown) {
    logger.error('auth/register error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
