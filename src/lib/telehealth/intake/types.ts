/**
 * Telehealth intake service boundary.
 *
 * UI talks only to this interface. Today: StaticIntakeService (mock).
 * Later: swap implementation to real Intake API without rebuilding the VIP UI.
 */

import { z } from 'zod'

/** TEMPORARY static schema — replace fields when Intake API arrives. */
export const staticIntakeSchema = z.object({
  firstName: z.string().trim().min(1, 'Required').max(80),
  lastName: z.string().trim().min(1, 'Required').max(80),
  email: z.string().trim().email('Enter a valid email'),
  phone: z
    .string()
    .trim()
    .min(10, 'Enter a valid phone')
    .max(20),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  sexAtBirth: z.enum(['female', 'male', 'other', 'prefer_not']),
  heightFeet: z.coerce.number().int().min(3).max(8),
  heightInches: z.coerce.number().int().min(0).max(11),
  weightLb: z.coerce.number().min(50).max(800),
  reasonForVisit: z.string().trim().min(3, 'Please share a short reason').max(500),
  currentMedications: z.string().trim().max(1000).optional().default(''),
  allergies: z.string().trim().max(1000).optional().default(''),
  medicalConditions: z.string().trim().max(1000).optional().default(''),
  consentsToTelehealth: z.literal(true, {
    message: 'Consent is required to continue',
  }),
})

export type StaticIntakeValues = z.infer<typeof staticIntakeSchema>

export interface IntakeSubmissionResult {
  /** Opaque id from the intake provider (mock or real API). */
  intakeId: string
  submittedAt: string
  values: StaticIntakeValues
  /** Marks this result as coming from the temporary static provider. */
  provider: 'static' | 'intake_api'
}

export interface TelehealthIntakeService {
  readonly providerName: 'static' | 'intake_api'
  validate(values: unknown): {
    success: true
    data: StaticIntakeValues
  } | {
    success: false
    errors: Partial<Record<keyof StaticIntakeValues, string>>
  }
  /** Persist / submit intake. Static impl stores locally + returns a mock id. */
  submit(values: StaticIntakeValues, context: {
    productSlug: string
    productId: string
    userId?: string | null
  }): Promise<IntakeSubmissionResult>
}

export const EMPTY_INTAKE_VALUES: StaticIntakeValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  sexAtBirth: 'prefer_not',
  heightFeet: 5,
  heightInches: 6,
  weightLb: 160,
  reasonForVisit: '',
  currentMedications: '',
  allergies: '',
  medicalConditions: '',
  consentsToTelehealth: false as unknown as true,
}
