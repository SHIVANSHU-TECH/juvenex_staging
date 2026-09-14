import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { encryptArray, decryptArray } from '@/lib/encryption'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Explicit SELECT list — never use '*'. Includes both the plaintext PHI
// columns (legacy fallback) and their encrypted mirrors so the decrypt step
// in decryptProfileForOwner() can read them. Do NOT include password_hash or
// any column that is not on the patient_profiles table.
const PATIENT_PROFILE_COLUMNS =
  'id, user_id, current_weight, target_weight, starting_weight, height, age, gender, activity_level, diet_type, primary_goal, allergies, restrictions, favorite_foods, foods_to_avoid, conditions, medications, has_glp1_experience, allergies_enc, restrictions_enc, foods_to_avoid_enc, conditions_enc, medications_enc, created_at, updated_at'

interface PatientProfileRow {
  id: string
  user_id: string
  current_weight: number | null
  target_weight: number | null
  starting_weight: number | null
  height: number | null
  age: number | null
  gender: string | null
  activity_level: string | null
  diet_type: string | null
  primary_goal: string | null
  allergies: string[] | null
  restrictions: string[] | null
  favorite_foods: string[] | null
  foods_to_avoid: string[] | null
  conditions: string[] | null
  medications: string[] | null
  has_glp1_experience: boolean | null
  // Encrypted mirrors (migration 008). When present, these take precedence
  // over the plaintext columns above. See src/lib/encryption.ts.
  allergies_enc: string | null
  restrictions_enc: string | null
  foods_to_avoid_enc: string | null
  conditions_enc: string | null
  medications_enc: string | null
  created_at: string
  updated_at: string
}

const PHI_ARRAY_FIELDS = [
  'allergies',
  'restrictions',
  'foods_to_avoid',
  'conditions',
  'medications',
] as const

/**
 * Returns a new profile object with encrypted PHI array columns decrypted
 * into their plaintext counterparts for transmission to the authenticated
 * owner. Falls back to the legacy plaintext column when *_enc is null.
 * Always strips the *_enc columns from the returned object so ciphertext
 * never leaks over the wire.
 */
function decryptProfileForOwner(
  row: PatientProfileRow | null
): PatientProfileRow | null {
  if (!row) return null

  const decrypted: PatientProfileRow = { ...row }

  for (const field of PHI_ARRAY_FIELDS) {
    const encKey = `${field}_enc` as const
    const encValue = row[encKey]
    if (encValue) {
      decrypted[field] = decryptArray(encValue)
    }
    // Remove ciphertext from the outbound payload.
    decrypted[encKey] = null
  }

  return decrypted
}

// PHI array columns (allergies, medications, conditions, restrictions,
// foods_to_avoid) are encrypted at rest via src/lib/encryption.ts into the
// _enc mirror columns per HIPAA §164.312(a)(2)(iv). These fields MUST NOT be
// embedded into AI prompts (see src/lib/phi-sanitizer.ts).
const patientProfileSchema = z.object({
  current_weight: z.number().positive().optional(),
  target_weight: z.number().positive().optional(),
  starting_weight: z.number().positive().optional(),
  height: z.number().positive().optional(),
  age: z.number().int().min(1).max(150).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  activity_level: z
    .enum(['sedentary', 'light', 'moderate', 'active', 'very_active'])
    .optional(),
  diet_type: z
    .enum([
      'balanced',
      'keto',
      'low_carb',
      'mediterranean',
      'paleo',
      'low_fat',
    ])
    .optional(),
  primary_goal: z
    .enum([
      'weight_loss',
      'maintain',
      'muscle_gain',
      'glp1_optimize',
      'blood_sugar',
    ])
    .optional(),
  allergies: z.array(z.string()).optional(),
  restrictions: z.array(z.string()).optional(),
  favorite_foods: z.array(z.string()).optional(),
  foods_to_avoid: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  has_glp1_experience: z.boolean().optional(),
})

const createPatientProfileSchema = patientProfileSchema.extend({
  current_weight: z.number().positive(),
  height: z.number().positive(),
  age: z.number().int().min(1).max(150),
  gender: z.enum(['male', 'female', 'other']),
  primary_goal: z.enum([
    'weight_loss',
    'maintain',
    'muscle_gain',
    'glp1_optimize',
    'blood_sugar',
  ]),
})

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}

// GET /api/patient/profile - Fetch authenticated user's patient profile
export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = getSupabase()
    const { data: patientProfile } = await supabase
      .from('patient_profiles')
      .select(PATIENT_PROFILE_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle()

    // Decrypt PHI columns for the authenticated owner only. Fall back to the
    // legacy plaintext column when the _enc mirror has not been written yet.
    const decryptedProfile = decryptProfileForOwner(
      (patientProfile as PatientProfileRow | null) ?? null
    )

    const data = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organization_id: user.organization_id,
      patient_profile: decryptedProfile,
    }

    await logAudit({ userId: user.id, action: 'view_profile', resourceType: 'patient_profile' }).catch(() => {})

    return Response.json({ success: true, data })
  } catch (error: unknown) {
    logger.error('Failed to fetch patient profile', { error: errorMessage(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/patient/profile - Initial patient profile creation after registration
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const rl = rateLimit(`patient-profile:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const body: unknown = await request.json()
    const parsed = createPatientProfileSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    // Check if patient profile already exists
    const { data: existing } = await supabase
      .from('patient_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return Response.json(
        { success: false, error: 'Patient profile already exists. Use PUT to update.' },
        { status: 409 }
      )
    }

    const d = parsed.data
    const { data, error: insertError } = await supabase
      .from('patient_profiles')
      .insert({
        user_id: user.id,
        current_weight: d.current_weight,
        target_weight: d.target_weight ?? null,
        height: d.height,
        age: d.age,
        gender: d.gender,
        activity_level: d.activity_level ?? null,
        diet_type: d.diet_type ?? null,
        primary_goal: d.primary_goal,
        // PHI fields are written ENCRYPTED into the _enc columns.
        // Plaintext columns are left null so they can be dropped in migration 009.
        allergies: null,
        restrictions: null,
        foods_to_avoid: null,
        conditions: null,
        medications: null,
        allergies_enc: d.allergies ? encryptArray(d.allergies) : null,
        restrictions_enc: d.restrictions ? encryptArray(d.restrictions) : null,
        foods_to_avoid_enc: d.foods_to_avoid ? encryptArray(d.foods_to_avoid) : null,
        conditions_enc: d.conditions ? encryptArray(d.conditions) : null,
        medications_enc: d.medications ? encryptArray(d.medications) : null,
        favorite_foods: d.favorite_foods ?? null,
        has_glp1_experience: d.has_glp1_experience ?? null,
      })
      .select(PATIENT_PROFILE_COLUMNS)
      .single()

    if (insertError) {
      logger.error('Failed to insert patient profile', { error: insertError.message })
      return Response.json(
        { success: false, error: 'Failed to save profile' },
        { status: 500 }
      )
    }

    await logAudit({ userId: user.id, action: 'create_profile', resourceType: 'patient_profile', resourceId: data?.id }).catch(() => {})

    const decrypted = decryptProfileForOwner((data as PatientProfileRow | null) ?? null)
    return Response.json({ success: true, data: decrypted }, { status: 201 })
  } catch (error: unknown) {
    logger.error('Failed to create patient profile', { error: errorMessage(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/patient/profile - Upsert patient profile
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const rl = rateLimit(`patient-profile:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const body: unknown = await request.json()
    const parsed = patientProfileSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const supabase = getSupabase()
    const d = parsed.data

    const updateFields: Record<string, unknown> = {}
    if (d.current_weight !== undefined) updateFields.current_weight = d.current_weight
    if (d.target_weight !== undefined) updateFields.target_weight = d.target_weight
    if (d.starting_weight !== undefined) updateFields.starting_weight = d.starting_weight
    if (d.height !== undefined) updateFields.height = d.height
    if (d.age !== undefined) updateFields.age = d.age
    if (d.gender !== undefined) updateFields.gender = d.gender
    if (d.activity_level !== undefined) updateFields.activity_level = d.activity_level
    if (d.diet_type !== undefined) updateFields.diet_type = d.diet_type
    if (d.primary_goal !== undefined) updateFields.primary_goal = d.primary_goal
    if (d.favorite_foods !== undefined) updateFields.favorite_foods = d.favorite_foods
    if (d.has_glp1_experience !== undefined) updateFields.has_glp1_experience = d.has_glp1_experience

    // PHI array fields: encrypt into the _enc columns and null out the legacy
    // plaintext column on every write so we never leave stale plaintext behind.
    if (d.allergies !== undefined) {
      updateFields.allergies_enc = encryptArray(d.allergies)
      updateFields.allergies = null
    }
    if (d.restrictions !== undefined) {
      updateFields.restrictions_enc = encryptArray(d.restrictions)
      updateFields.restrictions = null
    }
    if (d.foods_to_avoid !== undefined) {
      updateFields.foods_to_avoid_enc = encryptArray(d.foods_to_avoid)
      updateFields.foods_to_avoid = null
    }
    if (d.conditions !== undefined) {
      updateFields.conditions_enc = encryptArray(d.conditions)
      updateFields.conditions = null
    }
    if (d.medications !== undefined) {
      updateFields.medications_enc = encryptArray(d.medications)
      updateFields.medications = null
    }

    const { data: existing } = await supabase
      .from('patient_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    let data: PatientProfileRow | null
    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from('patient_profiles')
        .update({ ...updateFields, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .select(PATIENT_PROFILE_COLUMNS)
        .single()
      if (updateError) {
        logger.error('Failed to update patient profile', { error: updateError.message })
        return Response.json({ success: false, error: 'Failed to update profile' }, { status: 500 })
      }
      data = updated as PatientProfileRow
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('patient_profiles')
        .insert({ user_id: user.id, ...updateFields })
        .select(PATIENT_PROFILE_COLUMNS)
        .single()
      if (insertError) {
        logger.error('Failed to insert patient profile', { error: insertError.message })
        return Response.json({ success: false, error: 'Failed to save profile' }, { status: 500 })
      }
      data = inserted as PatientProfileRow
    }

    await logAudit({ userId: user.id, action: 'update_profile', resourceType: 'patient_profile' }).catch(() => {})

    const decrypted = decryptProfileForOwner(data)
    return Response.json({ success: true, data: decrypted })
  } catch (error: unknown) {
    logger.error('Failed to update patient profile', { error: errorMessage(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
