import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

const PROFILE_COLUMNS =
  'id, email, name, role, organization_id, phone, avatar_url, created_at, ai_personalization_consent, ai_personalization_consent_at, sleep_hours_avg'

const PATIENT_PROFILE_COLUMNS =
  'id, user_id, current_weight, target_weight, starting_weight, height, age, gender, activity_level, diet_type, primary_goal, allergies, restrictions, favorite_foods, foods_to_avoid, conditions, medications, has_glp1_experience, created_at, updated_at'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const authUser = await getAuthUser()
  if (!authUser) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const supabase = getSupabase()
    const [profileRes, patientRes] = await Promise.all([
      supabase.from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', authUser.id)
        .maybeSingle(),
      supabase.from('patient_profiles')
        .select(PATIENT_PROFILE_COLUMNS)
        .eq('user_id', authUser.id)
        .maybeSingle(),
    ])

    if (!profileRes.data) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 })
    }

    // Resolve the user's tenant slug for client-side tenant isolation.
    let organizationSlug: string | null = null
    if (profileRes.data.organization_id) {
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', profileRes.data.organization_id)
        .maybeSingle()
      organizationSlug = (orgRow?.slug as string | undefined) ?? null
    }

    const userPayload = {
      id: authUser.id,
      email: authUser.email,
      name: profileRes.data.name,
      role: profileRes.data.role,
      organizationId: profileRes.data.organization_id,
      organizationSlug,
      phone: profileRes.data.phone,
      avatarUrl: profileRes.data.avatar_url,
    }
    const payload = {
      user: userPayload,
      profile: profileRes.data,
      patientProfile: patientRes.data ?? null,
    }

    // Envelope: standardized `success` + `data`. Original fields preserved at
    // top-level so existing fetchApi consumers continue to work.
    return NextResponse.json({
      success: true,
      data: payload,
      ...payload,
    })
  } catch (error: unknown) {
    logger.error('auth/profile GET error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

const profileUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  avatar_url: z.string().url().optional(),
  ai_personalization_consent: z.boolean().optional(),
  sleep_hours_avg: z.number().min(0).max(24).optional(),
}).strict()

const patientProfileUpdateSchema = z.object({
  current_weight: z.number().positive().optional(),
  target_weight: z.number().positive().optional(),
  height: z.number().positive().optional(),
  age: z.number().int().positive().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  activity_level: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).optional(),
  diet_type: z.enum(['balanced', 'keto', 'low_carb', 'mediterranean', 'paleo', 'low_fat']).optional(),
  primary_goal: z.enum(['weight_loss', 'maintain', 'muscle_gain', 'glp1_optimize', 'blood_sugar']).optional(),
  allergies: z.array(z.string()).optional(),
  restrictions: z.array(z.string()).optional(),
  favorite_foods: z.array(z.string()).optional(),
  foods_to_avoid: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  has_glp1_experience: z.boolean().optional(),
}).strict()

const putSchema = z.object({
  profile: profileUpdateSchema.optional(),
  patientProfile: patientProfileUpdateSchema.optional(),
})

export async function PUT(request: Request) {
  const authUser = await getAuthUser()
  if (!authUser) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }

  const rl = rateLimit(`profile-update:${authUser.id}`, 30, 60_000)
  if (!rl.success) {
    return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const parsed = putSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { profile: profileFields, patientProfile: patientFields } = parsed.data
    const supabase = getSupabase()

    let updatedProfile = null
    let updatedPatientProfile = null

    if (profileFields && Object.keys(profileFields).length > 0) {
      // Consent side-effect: when ai_personalization_consent transitions to
      // true we stamp consent_at = now(); when it flips to false we null the
      // timestamp so the current value always reflects the live state.
      // Historical consent changes are emitted to audit_logs separately.
      const profilePatch: Record<string, unknown> = {
        ...profileFields,
        updated_at: new Date().toISOString(),
      }
      if (typeof profileFields.ai_personalization_consent === 'boolean') {
        profilePatch.ai_personalization_consent_at = profileFields.ai_personalization_consent
          ? new Date().toISOString()
          : null
      }

      const { data, error } = await supabase
        .from('profiles')
        .update(profilePatch)
        .eq('id', authUser.id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ success: false, error: 'Failed to update profile' }, { status: 500 })
      }
      updatedProfile = data
    }

    if (patientFields && Object.keys(patientFields).length > 0) {
      const { data, error } = await supabase
        .from('patient_profiles')
        .upsert({
          user_id: authUser.id,
          ...patientFields,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ success: false, error: 'Failed to update patient profile' }, { status: 500 })
      }
      updatedPatientProfile = data
    }

    const payload = {
      profile: updatedProfile,
      patientProfile: updatedPatientProfile,
    }

    // Envelope: standardized `success` + `data`. Top-level fields preserved
    // for backwards compatibility with existing fetchApi consumers.
    return NextResponse.json({
      success: true,
      data: payload,
      ...payload,
    })
  } catch (error: unknown) {
    logger.error('auth/profile PUT error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
