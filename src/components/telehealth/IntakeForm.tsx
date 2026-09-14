'use client'

import { useEffect, useReducer, useRef } from 'react'
import {
  contactStepSchema,
  identityStepSchema,
  medicalStepSchema,
  fullIntakeSchema,
  toAppointmentsBody,
  toMarketingLeadInput,
  SUPPORT_EMAIL,
  DEFAULT_ENCOUNTER_TYPE_ID,
  type FullIntake,
} from '@/lib/intakeSchema'
import IntakeStep1Contact from './IntakeStep1Contact'
import IntakeStep2Address from './IntakeStep2Address'
import IntakeStep3Medical from './IntakeStep3Medical'
import IntakeStep4Review from './IntakeStep4Review'

// ---------------------------------------------------------------------------
// Step machine
// ---------------------------------------------------------------------------

const STEPS = [
  {
    label: 'Contact',
    title: 'Your contact details',
    desc: 'How PrescribeRx will reach you with your payment link and Zoom link.',
  },
  {
    label: 'Identity & Address',
    title: 'Identity & address',
    desc: 'Your address and date of birth — required by the licensed provider.',
  },
  {
    label: 'Medical',
    title: 'Encounter & medical info',
    desc: 'Help your provider understand your goals before the consult.',
  },
  {
    label: 'Review',
    title: 'Review & submit',
    desc: 'Confirm everything looks right, then submit.',
  },
] as const

const CONTACT_KEYS = ['firstName', 'lastName', 'email', 'phone'] as const
const IDENTITY_KEYS = [
  'dob',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
] as const

type StepIndex = 0 | 1 | 2 | 3
type ErrorMap = Partial<Record<keyof FullIntake, string>>

type SubmitStatus =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'success' }

interface State {
  step: StepIndex
  values: FullIntake
  errors: ErrorMap
  status: SubmitStatus
}

const initialState: State = {
  step: 0,
  values: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    encounterTypeId: DEFAULT_ENCOUNTER_TYPE_ID,
    reasonForVisit: '',
    heightFeet: 0,
    heightInches: 0,
    weightLb: 0,
    goalWeightLb: 0,
    medicalConditions: '',
    currentMedications: '',
    // Form starts un-checked; literal(true) is enforced at submit time.
    consent: false as unknown as true,
  },
  errors: {},
  status: { kind: 'idle' },
}

type Action =
  | { type: 'set_field'; field: keyof FullIntake; value: FullIntake[keyof FullIntake] }
  | { type: 'set_step'; step: StepIndex }
  | { type: 'set_errors'; errors: ErrorMap }
  | { type: 'set_status'; status: SubmitStatus }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set_field':
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
        // Clear that field's error on edit.
        errors: { ...state.errors, [action.field]: undefined },
      }
    case 'set_step':
      return { ...state, step: action.step, errors: {} }
    case 'set_errors':
      return { ...state, errors: action.errors }
    case 'set_status':
      return { ...state, status: action.status }
    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const STEP_SCHEMAS = [contactStepSchema, identityStepSchema, medicalStepSchema] as const

function pickStepInput(step: StepIndex, v: FullIntake): Record<string, unknown> {
  if (step === 0) {
    return { firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone }
  }
  if (step === 1) {
    return {
      dob: v.dob,
      addressLine1: v.addressLine1,
      addressLine2: v.addressLine2,
      city: v.city,
      state: v.state,
      postalCode: v.postalCode,
    }
  }
  return {
    encounterTypeId: v.encounterTypeId,
    reasonForVisit: v.reasonForVisit,
    heightFeet: v.heightFeet,
    heightInches: v.heightInches,
    weightLb: v.weightLb,
    goalWeightLb: v.goalWeightLb,
    medicalConditions: v.medicalConditions,
    currentMedications: v.currentMedications,
    consent: v.consent,
  }
}

function validateStep(step: StepIndex, values: FullIntake): ErrorMap {
  if (step === 3) return {}
  const r = STEP_SCHEMAS[step].safeParse(pickStepInput(step, values))
  if (r.success) return {}
  const errors: ErrorMap = {}
  for (const issue of r.error.issues) {
    const key = issue.path[0] as keyof FullIntake | undefined
    if (key && !errors[key]) errors[key] = issue.message
  }
  return errors
}

function firstStepWithError(errs: ErrorMap): StepIndex {
  const keys = Object.keys(errs) as Array<keyof FullIntake>
  if (keys.some((k) => (CONTACT_KEYS as readonly string[]).includes(k))) return 0
  if (keys.some((k) => (IDENTITY_KEYS as readonly string[]).includes(k))) return 1
  return 2
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

type SubmitResult = { ok: true } | { ok: false; status: number; message: string }

const NETWORK_ERROR =
  "We're having trouble booking right now. Please check your connection and try again."
const PROVIDER_ERROR =
  "We're having trouble booking right now. Please try again in a few minutes."

async function postAppointments(intake: FullIntake): Promise<SubmitResult> {
  let res: Response
  try {
    res = await fetch('/api/telehealth/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toAppointmentsBody(intake)),
    })
  } catch {
    return { ok: false, status: 0, message: NETWORK_ERROR }
  }
  if (res.ok) return { ok: true }
  // Provider errors (502/503) and any 5xx — never echo upstream messages,
  // which may contain reflected PHI.
  if (res.status >= 500) return { ok: false, status: res.status, message: PROVIDER_ERROR }
  if (res.status === 401) return { ok: false, status: 401, message: 'Please sign in and try again.' }
  if (res.status === 429) {
    return { ok: false, status: 429, message: 'Too many attempts. Please wait a minute and try again.' }
  }
  const json = (await res.json().catch(() => null)) as { error?: string } | null
  return {
    ok: false,
    status: res.status,
    message: json?.error ?? 'Unable to submit your intake. Please try again.',
  }
}

async function postMarketingLead(intake: FullIntake): Promise<void> {
  // Fire-and-forget. Failures are server-logged; never surfaced to the user.
  try {
    await fetch('/api/marketing/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toMarketingLeadInput(intake)),
    })
  } catch {
    // No-op.
  }
}

// ---------------------------------------------------------------------------
// UI primitives
// ---------------------------------------------------------------------------

function ProgressBar({ stepIndex }: { stepIndex: StepIndex }) {
  return (
    <div className="mb-6">
      <div className="flex gap-2 mb-3" aria-hidden="true">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= stepIndex ? 'bg-[var(--accent-strong)]' : 'bg-[#E5EAE3]'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

interface NavProps {
  onBack?: () => void
  onNext: () => void
  nextLabel: string
  disabled?: boolean
}

function Nav({ onBack, onNext, nextLabel, disabled }: NavProps) {
  return (
    <div className="flex gap-3 mt-8">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3.5 min-h-[44px] rounded-xl border-2 border-[#E5EAE3] text-[var(--text-muted)] font-semibold hover:border-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
        >
          Back
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        className="flex-1 py-3.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] text-white font-semibold shadow-md shadow-[var(--accent-strong)]/20 hover:shadow-lg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-all"
      >
        {nextLabel}
      </button>
    </div>
  )
}

function SuccessState({ email }: { email: string }) {
  return (
    <section
      aria-labelledby="success-heading"
      className="bg-white rounded-3xl border border-[#E5EAE3] shadow-sm p-6 sm:p-8 text-center space-y-4"
    >
      <div
        className="w-16 h-16 rounded-full bg-[#EEF1ED] flex items-center justify-center text-3xl mx-auto"
        aria-hidden="true"
      >
        ✓
      </div>
      <h2 id="success-heading" className="text-2xl font-bold text-[#2D352C]" tabIndex={-1}>
        Check your email
      </h2>
      <p className="text-[var(--text-muted)] leading-relaxed">
        Your intake was submitted to PrescribeRx. They&apos;ll send <strong>{email}</strong> a
        message shortly with a payment link and a Zoom link to talk with the doctor.
      </p>
      <p className="text-sm text-[var(--text-muted)]">
        Don&apos;t see it within 15 minutes? Check spam, or reach out to{' '}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-[var(--accent-strong)] underline underline-offset-2"
        >
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main form component
// ---------------------------------------------------------------------------

export default function IntakeForm() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const errorRef = useRef<HTMLDivElement | null>(null)

  // Focus the step heading on step change. Screen readers re-announce via the
  // live region. Skip on success (separate heading owns focus there).
  useEffect(() => {
    if (state.status.kind === 'success') return
    headingRef.current?.focus()
  }, [state.step, state.status.kind])

  useEffect(() => {
    if (state.status.kind === 'error') errorRef.current?.focus()
  }, [state.status])

  const goNext = () => {
    if (state.step >= 3) return
    const errs = validateStep(state.step, state.values)
    if (Object.keys(errs).length > 0) {
      dispatch({ type: 'set_errors', errors: errs })
      return
    }
    dispatch({ type: 'set_step', step: (state.step + 1) as StepIndex })
  }

  const goBack = () => {
    if (state.step > 0) dispatch({ type: 'set_step', step: (state.step - 1) as StepIndex })
  }

  const onEditStep = (i: 0 | 1 | 2) => dispatch({ type: 'set_step', step: i })

  const handleFieldChange = <K extends keyof FullIntake>(field: K, value: FullIntake[K]) => {
    dispatch({ type: 'set_field', field, value })
  }

  const handleSubmit = async () => {
    // Final whole-form validation as defense in depth.
    const parsed = fullIntakeSchema.safeParse(state.values)
    if (!parsed.success) {
      const errs: ErrorMap = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FullIntake | undefined
        if (key && !errs[key]) errs[key] = issue.message
      }
      dispatch({ type: 'set_errors', errors: errs })
      dispatch({ type: 'set_step', step: firstStepWithError(errs) })
      return
    }

    dispatch({ type: 'set_status', status: { kind: 'submitting' } })

    // Submit only to the clinical/telehealth path. We intentionally do not
    // mirror telehealth identifiers into marketing_leads because contact +
    // DOB/address from a medical intake is PHI-adjacent and should not be
    // duplicated outside the provider workflow.
    const [apptResult] = await Promise.allSettled([
      postAppointments(parsed.data),
    ])

    if (apptResult.status === 'rejected') {
      dispatch({ type: 'set_status', status: { kind: 'error', message: PROVIDER_ERROR } })
      return
    }
    const appt = apptResult.value
    dispatch({
      type: 'set_status',
      status: appt.ok ? { kind: 'success' } : { kind: 'error', message: appt.message },
    })
  }

  if (state.status.kind === 'success') return <SuccessState email={state.values.email} />

  const { label, title, desc } = STEPS[state.step]
  const submitting = state.status.kind === 'submitting'
  const errorMessage = state.status.kind === 'error' ? state.status.message : null

  return (
    <>
      {/* Live region announces step transitions to screen readers. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        Step {state.step + 1} of {STEPS.length}: {label}
      </div>

      <ProgressBar stepIndex={state.step} />

      <p className="text-sm text-[var(--text-muted)] mb-2">
        Step {state.step + 1} of {STEPS.length} · {label}
      </p>

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-bold text-[#2D352C] mb-2 focus:outline-none"
      >
        {title}
      </h2>
      <p className="text-sm text-[var(--text-muted)] mb-6">{desc}</p>

      {state.step === 0 && (
        <IntakeStep1Contact values={state.values} errors={state.errors} onChange={handleFieldChange} />
      )}
      {state.step === 1 && (
        <IntakeStep2Address values={state.values} errors={state.errors} onChange={handleFieldChange} />
      )}
      {state.step === 2 && (
        <IntakeStep3Medical values={state.values} errors={state.errors} onChange={handleFieldChange} />
      )}
      {state.step === 3 && <IntakeStep4Review values={state.values} onEditStep={onEditStep} />}

      {errorMessage && (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      <Nav
        onBack={state.step > 0 ? goBack : undefined}
        onNext={state.step === 3 ? handleSubmit : goNext}
        nextLabel={
          state.step === 3 ? (submitting ? 'Submitting…' : 'Submit intake') : 'Continue'
        }
        disabled={submitting}
      />
    </>
  )
}
