// Shared Zod schemas for the Juvenex telehealth intake form.
//
// These schemas are used both by the multi-step client form (per-step
// validation) and by the marketing-leads mirror endpoint
// (`/api/marketing/leads`). The medical submit goes to the existing
// `/api/telehealth/appointments` endpoint, which has its own server-side
// schema; the shape here is designed so the client payload trivially maps to
// that endpoint's expected request body.
//
// PHI vs non-PHI split:
//   - Step 1 (contact) + Step 2 (identity & address) are non-PHI contact
//     fields safe to mirror into `marketing_leads`.
//   - Step 3 (medical) is PHI and MUST NEVER be written to marketing_leads.
//
// The split is enforced by the separate `marketingLeadInputSchema` below,
// which contains only contact + address fields.

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const US_STATES = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
] as const

const US_STATE_CODES = US_STATES.map(([code]) => code) as readonly string[]

/**
 * Hardcoded GLP-1 Screening encounter type. TODO: replace with a fetch from
 * `/api/telehealth/encounter-types` once that endpoint exists so admins can
 * configure additional encounter types without a code change.
 */
export const DEFAULT_ENCOUNTER_TYPE_ID =
  '019ce396-46a1-73ab-87d6-c40310555401' as const

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@juvenex.app'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strips non-digits from US phone strings; returns the last 10 digits. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D+/g, '')
  // Drop leading country code "1" if present.
  return digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits
}

/** Returns whole-year age from a YYYY-MM-DD DOB string. */
export function ageFromDob(dob: string): number {
  const d = new Date(`${dob}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return -1
  const now = new Date()
  let age = now.getUTCFullYear() - d.getUTCFullYear()
  const m = now.getUTCMonth() - d.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1
  return age
}

/** Combine ft+in into total inches. */
export function feetInchesToInches(feet: number, inches: number): number {
  return Math.round(feet * 12 + inches)
}

// ---------------------------------------------------------------------------
// Per-step schemas (client-side validation)
// ---------------------------------------------------------------------------

const phoneSchema = z
  .string()
  .min(1, 'Phone is required')
  .transform((v) => normalizePhone(v))
  .refine((v) => v.length === 10, 'Enter a 10-digit US phone number')

export const contactStepSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(100, 'First name is too long'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name is required')
    .max(100, 'Last name is too long'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  phone: phoneSchema,
})

export type ContactStep = z.infer<typeof contactStepSchema>

export const identityStepSchema = z.object({
  dob: z
    .string()
    .min(1, 'Date of birth is required')
    .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), {
      message: 'Enter a valid date',
    })
    .refine((v) => ageFromDob(v) >= 18, {
      message: 'You must be 18 or older',
    })
    .refine((v) => ageFromDob(v) < 120, {
      message: 'Enter a valid date of birth',
    }),
  addressLine1: z
    .string()
    .trim()
    .min(1, 'Street address is required')
    .max(200, 'Address is too long'),
  addressLine2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z
    .string()
    .trim()
    .min(1, 'City is required')
    .max(100, 'City is too long'),
  state: z
    .string()
    .min(1, 'State is required')
    .refine((v) => US_STATE_CODES.includes(v), 'Select a US state'),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/u, 'Enter a 5-digit ZIP code'),
})

export type IdentityStep = z.infer<typeof identityStepSchema>

export const medicalStepSchema = z.object({
  encounterTypeId: z.string().uuid().default(DEFAULT_ENCOUNTER_TYPE_ID),
  reasonForVisit: z
    .string()
    .trim()
    .min(20, 'Please share at least 20 characters about your reason for visit')
    .max(500, 'Keep your answer under 500 characters'),
  heightFeet: z
    .number({ message: 'Enter your height' })
    .int('Whole numbers only')
    .min(3, 'Enter a valid height')
    .max(8, 'Enter a valid height'),
  heightInches: z
    .number({ message: 'Enter your height' })
    .int('Whole numbers only')
    .min(0, 'Enter a valid height')
    .max(11, 'Inches must be 0–11'),
  weightLb: z
    .number({ message: 'Enter your weight' })
    .positive('Enter a valid weight')
    .max(1500, 'Enter a valid weight'),
  goalWeightLb: z
    .number({ message: 'Enter your goal weight' })
    .positive('Enter a valid goal weight')
    .max(1500, 'Enter a valid goal weight'),
  medicalConditions: z.string().trim().max(2000).optional().or(z.literal('')),
  currentMedications: z.string().trim().max(2000).optional().or(z.literal('')),
  consent: z.literal(true, {
    message: 'You must consent to share your information with PrescribeRx',
  }),
})

export type MedicalStep = z.infer<typeof medicalStepSchema>

// ---------------------------------------------------------------------------
// Form-wide aggregate (Step 4 — review & submit)
// ---------------------------------------------------------------------------

export const fullIntakeSchema = contactStepSchema
  .and(identityStepSchema)
  .and(medicalStepSchema)

export type FullIntake = z.infer<typeof fullIntakeSchema>

// ---------------------------------------------------------------------------
// Mapping → /api/telehealth/appointments request body
// ---------------------------------------------------------------------------

/**
 * Build the request body for `POST /api/telehealth/appointments`. The route
 * now accepts the FullIntake object directly so it can build the PrescribeRx
 * unified-intake payload server-side.
 *
 * The previous shape (a flat object with `name`, `height`, `healthGoal`,
 * `consentGiven`, etc.) is no longer accepted by the route. This helper now
 * returns the FullIntake itself so the existing `IntakeForm` caller continues
 * to work without modification.
 *
 * @deprecated Pass the FullIntake directly. This helper is kept only so that
 * legacy callers compile; new code should not import it.
 */
export function toAppointmentsBody(intake: FullIntake): FullIntake {
  return intake
}

// ---------------------------------------------------------------------------
// Mapping → PrescribeRx /telehealth/intake/unified request body
// ---------------------------------------------------------------------------

/**
 * Splits a free-text "list of items" string into a trimmed array. Accepts
 * common separators: newline, semicolon, comma. Empty entries are dropped.
 * Returns an empty array for nullish or empty input — never null/undefined.
 */
function splitMedicalList(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw
    .split(/[\n;,]/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export interface UnifiedAddress {
  street: string
  city: string
  state: string
  zip: string
}

export interface UnifiedPatient {
  first_name: string
  last_name: string
  email: string
  date_of_birth: string
  phone: string
  /** Omitted when intake reports `prefer_not_to_say` — provider treats absence as unspecified. */
  gender?: 'male' | 'female'
  address: UnifiedAddress
}

export interface UnifiedVitals {
  height_inches: number
  weight_lbs: number
}

export interface UnifiedMedicalHistory {
  allergies: string[]
  medications: string[]
  conditions: string[]
}

export interface UnifiedAnswers {
  reason_for_visit: string
  goal_weight_lbs?: number
  consent_telehealth: boolean
  consent_hipaa: boolean
}

export interface UnifiedIntakeBody {
  encounter_type_id: string
  patient: UnifiedPatient
  vitals: UnifiedVitals
  medical_history: UnifiedMedicalHistory
  answers: UnifiedAnswers
  product_ids: string[]
}

export interface ToUnifiedIntakeOptions {
  /** Optional product UUIDs to attach to the encounter. Defaults to []. */
  product_ids?: string[]
}

/**
 * Build the request body for PrescribeRx's
 * `POST /telehealth/intake/unified` endpoint. Maps the FullIntake form state
 * 1-to-1; never invents data.
 *
 * Edge cases:
 *   - `sex === 'prefer_not_to_say'` → `gender` field is OMITTED (not sent).
 *   - `addressLine2` (when present) is concatenated to `address.street` with `, `.
 *   - Phone is normalised to digits-only before send (provider expects E.164-ish).
 *   - `currentMedications` and `medicalConditions` are split on `\n`, `;`, or `,`.
 *   - `allergies` is always an empty array — the v3.0 intake form does not
 *     collect allergies. When/if added, plumb it through here.
 *   - `goal_weight_lbs` is only included when the intake captured it.
 */
export function toUnifiedIntakeBody(
  intake: FullIntake,
  opts: ToUnifiedIntakeOptions = {}
): UnifiedIntakeBody {
  const heightInches = feetInchesToInches(
    intake.heightFeet,
    intake.heightInches
  )
  const street =
    intake.addressLine2 && intake.addressLine2.trim().length > 0
      ? `${intake.addressLine1}, ${intake.addressLine2.trim()}`
      : intake.addressLine1

  // The form's `sex` field is not in FullIntake yet — current v3.0 intake
  // intentionally does NOT collect sex (per Braeden, GLP-1 protocol is
  // gender-neutral at intake). We therefore omit `gender` entirely. If a
  // future schema adds `sex`, gate the assignment on its value.

  const patient: UnifiedPatient = {
    first_name: intake.firstName,
    last_name: intake.lastName,
    email: intake.email,
    date_of_birth: intake.dob,
    phone: normalizePhone(intake.phone),
    address: {
      street,
      city: intake.city,
      state: intake.state,
      zip: intake.postalCode,
    },
  }

  const answers: UnifiedAnswers = {
    reason_for_visit: intake.reasonForVisit,
    consent_telehealth: intake.consent === true,
    consent_hipaa: intake.consent === true,
  }
  if (typeof intake.goalWeightLb === 'number' && intake.goalWeightLb > 0) {
    answers.goal_weight_lbs = intake.goalWeightLb
  }

  return {
    encounter_type_id: intake.encounterTypeId,
    patient,
    vitals: {
      height_inches: heightInches,
      weight_lbs: intake.weightLb,
    },
    medical_history: {
      allergies: [],
      medications: splitMedicalList(intake.currentMedications),
      conditions: splitMedicalList(intake.medicalConditions),
    },
    answers,
    product_ids: opts.product_ids ?? [],
  }
}

// ---------------------------------------------------------------------------
// Marketing-leads mirror schema (NON-PHI ONLY)
// ---------------------------------------------------------------------------

/**
 * Server-validated input for `POST /api/marketing/leads`. Contains only
 * non-PHI contact + address fields. **NEVER add medical fields here.** The
 * organization_id is derived from the authenticated user — clients cannot
 * override it.
 */
export const marketingLeadInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dob: z
    .string()
    .min(10)
    .max(10)
    .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), {
      message: 'Invalid date',
    }),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(1).max(100),
  state: z
    .string()
    .min(2)
    .max(2)
    .refine((v) => US_STATE_CODES.includes(v), 'Invalid US state'),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/u, 'Invalid ZIP'),
  phone: z
    .string()
    .trim()
    .transform((v) => normalizePhone(v))
    .refine((v) => v.length === 10, 'Invalid US phone'),
  source: z.string().trim().max(64).default('telehealth_intake'),
})

export type MarketingLeadInput = z.infer<typeof marketingLeadInputSchema>

/** Derive a marketing-leads payload from the full intake (drops PHI). */
export function toMarketingLeadInput(
  intake: FullIntake
): MarketingLeadInput {
  return {
    email: intake.email,
    firstName: intake.firstName,
    lastName: intake.lastName,
    dob: intake.dob,
    addressLine1: intake.addressLine1,
    addressLine2: intake.addressLine2 || '',
    city: intake.city,
    state: intake.state,
    postalCode: intake.postalCode,
    phone: intake.phone,
    source: 'telehealth_intake',
  }
}
