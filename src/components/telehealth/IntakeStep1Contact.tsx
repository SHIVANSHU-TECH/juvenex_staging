'use client'

import { useId } from 'react'
import type { FullIntake } from '@/lib/intakeSchema'

type ContactFields = Pick<FullIntake, 'firstName' | 'lastName' | 'email' | 'phone'>
type ContactErrors = Partial<Record<keyof ContactFields, string>>

const INPUT_CLASS =
  'w-full px-4 py-3 min-h-[44px] rounded-xl bg-white border border-[#E5EAE3] text-[#2D352C] shadow-sm focus:border-[var(--accent-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors aria-[invalid=true]:border-red-400'

interface Props {
  values: ContactFields
  errors: ContactErrors
  // Generic over `keyof FullIntake` to match the parent dispatcher; the step
  // only ever calls onChange with its own field names which is a sound
  // subset of FullIntake.
  onChange: <K extends keyof FullIntake>(field: K, value: FullIntake[K]) => void
}

export default function IntakeStep1Contact({ values, errors, onChange }: Props) {
  const firstNameId = useId()
  const lastNameId = useId()
  const emailId = useId()
  const phoneId = useId()
  const firstNameErrId = useId()
  const lastNameErrId = useId()
  const emailErrId = useId()
  const phoneErrId = useId()

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor={firstNameId}
            className="block text-sm font-medium text-[#2D352C] mb-2"
          >
            First name
            <span className="text-red-600" aria-hidden="true"> *</span>
          </label>
          <input
            id={firstNameId}
            type="text"
            autoComplete="given-name"
            value={values.firstName}
            onChange={(e) => onChange('firstName', e.target.value)}
            aria-invalid={Boolean(errors.firstName)}
            aria-describedby={errors.firstName ? firstNameErrId : undefined}
            className={INPUT_CLASS}
            required
          />
          {errors.firstName && (
            <p id={firstNameErrId} role="alert" className="mt-1 text-sm text-red-700">
              {errors.firstName}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor={lastNameId}
            className="block text-sm font-medium text-[#2D352C] mb-2"
          >
            Last name
            <span className="text-red-600" aria-hidden="true"> *</span>
          </label>
          <input
            id={lastNameId}
            type="text"
            autoComplete="family-name"
            value={values.lastName}
            onChange={(e) => onChange('lastName', e.target.value)}
            aria-invalid={Boolean(errors.lastName)}
            aria-describedby={errors.lastName ? lastNameErrId : undefined}
            className={INPUT_CLASS}
            required
          />
          {errors.lastName && (
            <p id={lastNameErrId} role="alert" className="mt-1 text-sm text-red-700">
              {errors.lastName}
            </p>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor={emailId}
          className="block text-sm font-medium text-[#2D352C] mb-2"
        >
          Email
          <span className="text-red-600" aria-hidden="true"> *</span>
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.email}
          onChange={(e) => onChange('email', e.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? emailErrId : undefined}
          className={INPUT_CLASS}
          required
        />
        {errors.email && (
          <p id={emailErrId} role="alert" className="mt-1 text-sm text-red-700">
            {errors.email}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor={phoneId}
          className="block text-sm font-medium text-[#2D352C] mb-2"
        >
          Phone (US)
          <span className="text-red-600" aria-hidden="true"> *</span>
        </label>
        <input
          id={phoneId}
          type="tel"
          autoComplete="tel-national"
          inputMode="tel"
          placeholder="(555) 123-4567"
          value={values.phone}
          onChange={(e) => onChange('phone', e.target.value)}
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? phoneErrId : undefined}
          className={INPUT_CLASS}
          required
        />
        {errors.phone && (
          <p id={phoneErrId} role="alert" className="mt-1 text-sm text-red-700">
            {errors.phone}
          </p>
        )}
      </div>
    </div>
  )
}
