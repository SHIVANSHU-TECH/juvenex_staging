/**
 * TEMPORARY static intake implementation.
 * Replace by wiring IntakeApiService when the client Intake API is ready.
 */

import type { z } from 'zod'
import {
  EMPTY_INTAKE_VALUES,
  staticIntakeSchema,
  type IntakeSubmissionResult,
  type StaticIntakeValues,
  type TelehealthIntakeService,
} from './types'

function fieldErrors(
  issues: z.ZodIssue[]
): Partial<Record<keyof StaticIntakeValues, string>> {
  const out: Partial<Record<keyof StaticIntakeValues, string>> = {}
  for (const issue of issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !(key in out)) {
      out[key as keyof StaticIntakeValues] = issue.message
    }
  }
  return out
}

/**
 * Static / mock intake provider for demos until the real Intake API exists.
 */
export class StaticIntakeService implements TelehealthIntakeService {
  readonly providerName = 'static' as const

  validate(values: unknown) {
    const parsed = staticIntakeSchema.safeParse(values)
    if (parsed.success) {
      return { success: true as const, data: parsed.data }
    }
    return {
      success: false as const,
      errors: fieldErrors(parsed.error.issues),
    }
  }

  async submit(
    values: StaticIntakeValues,
    context: { productSlug: string; productId: string; userId?: string | null }
  ): Promise<IntakeSubmissionResult> {
    await new Promise((r) => setTimeout(r, 350))

    const intakeId = `static_intake_${Date.now().toString(36)}`
    const result: IntakeSubmissionResult = {
      intakeId,
      submittedAt: new Date().toISOString(),
      values,
      provider: 'static',
    }

    try {
      sessionStorage.setItem(
        'jx.telehealth.intake.last',
        JSON.stringify({ ...result, context })
      )
    } catch {
      /* private mode */
    }

    return result
  }
}

/** Factory — change this one line when Intake API is ready. */
export function getTelehealthIntakeService(): TelehealthIntakeService {
  // FUTURE: return new IntakeApiService()
  return new StaticIntakeService()
}

export { EMPTY_INTAKE_VALUES }
