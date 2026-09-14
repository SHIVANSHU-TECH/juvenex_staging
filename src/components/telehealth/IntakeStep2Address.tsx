'use client'

import { useId } from 'react'
import { US_STATES } from '@/lib/intakeSchema'
import type { FullIntake } from '@/lib/intakeSchema'

type IdentityFields = Pick<
  FullIntake,
  | 'dob'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'postalCode'
>
type IdentityErrors = Partial<Record<keyof IdentityFields, string>>

const INPUT_CLASS =
  'w-full px-4 py-3 min-h-[44px] rounded-xl bg-white border border-[#E5EAE3] text-[#2D352C] shadow-sm focus:border-[var(--accent-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors aria-[invalid=true]:border-red-400'

interface Props {
  values: IdentityFields
  errors: IdentityErrors
  // Generic over `keyof FullIntake` rather than the local subset so the
  // parent IntakeForm can hand its own typed dispatcher down without an
  // unsound cast. The step only ever calls this with its own field names.
  onChange: <K extends keyof FullIntake>(field: K, value: FullIntake[K]) => void
}

export default function IntakeStep2Address({ values, errors, onChange }: Props) {
  const dobId = useId()
  const line1Id = useId()
  const line2Id = useId()
  const cityId = useId()
  const stateId = useId()
  const zipId = useId()
  const dobErrId = useId()
  const line1ErrId = useId()
  const cityErrId = useId()
  const stateErrId = useId()
  const zipErrId = useId()

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor={dobId}
          className="block text-sm font-medium text-[#2D352C] mb-2"
        >
          Date of birth
          <span className="text-red-600" aria-hidden="true"> *</span>
        </label>
        <input
          id={dobId}
          type="date"
          autoComplete="bday"
          value={values.dob}
          onChange={(e) => onChange('dob', e.target.value)}
          aria-invalid={Boolean(errors.dob)}
          aria-describedby={errors.dob ? dobErrId : undefined}
          className={INPUT_CLASS}
          required
        />
        {errors.dob && (
          <p id={dobErrId} role="alert" className="mt-1 text-sm text-red-700">
            {errors.dob}
          </p>
        )}
        <p className="mt-1 text-xs text-[var(--text-muted)]">You must be 18 or older.</p>
      </div>

      <div>
        <label
          htmlFor={line1Id}
          className="block text-sm font-medium text-[#2D352C] mb-2"
        >
          Street address
          <span className="text-red-600" aria-hidden="true"> *</span>
        </label>
        <input
          id={line1Id}
          type="text"
          autoComplete="address-line1"
          value={values.addressLine1}
          onChange={(e) => onChange('addressLine1', e.target.value)}
          aria-invalid={Boolean(errors.addressLine1)}
          aria-describedby={errors.addressLine1 ? line1ErrId : undefined}
          className={INPUT_CLASS}
          required
        />
        {errors.addressLine1 && (
          <p id={line1ErrId} role="alert" className="mt-1 text-sm text-red-700">
            {errors.addressLine1}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor={line2Id}
          className="block text-sm font-medium text-[#2D352C] mb-2"
        >
          Apartment, suite, unit (optional)
        </label>
        <input
          id={line2Id}
          type="text"
          autoComplete="address-line2"
          value={values.addressLine2 ?? ''}
          onChange={(e) => onChange('addressLine2', e.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-1">
          <label
            htmlFor={cityId}
            className="block text-sm font-medium text-[#2D352C] mb-2"
          >
            City
            <span className="text-red-600" aria-hidden="true"> *</span>
          </label>
          <input
            id={cityId}
            type="text"
            autoComplete="address-level2"
            value={values.city}
            onChange={(e) => onChange('city', e.target.value)}
            aria-invalid={Boolean(errors.city)}
            aria-describedby={errors.city ? cityErrId : undefined}
            className={INPUT_CLASS}
            required
          />
          {errors.city && (
            <p id={cityErrId} role="alert" className="mt-1 text-sm text-red-700">
              {errors.city}
            </p>
          )}
        </div>

        <div className="sm:col-span-1">
          <label
            htmlFor={stateId}
            className="block text-sm font-medium text-[#2D352C] mb-2"
          >
            State
            <span className="text-red-600" aria-hidden="true"> *</span>
          </label>
          <select
            id={stateId}
            autoComplete="address-level1"
            value={values.state}
            onChange={(e) => onChange('state', e.target.value)}
            aria-invalid={Boolean(errors.state)}
            aria-describedby={errors.state ? stateErrId : undefined}
            className={INPUT_CLASS}
            required
          >
            <option value="">Select…</option>
            {US_STATES.map(([code, name]) => (
              <option key={code} value={code}>
                {code} — {name}
              </option>
            ))}
          </select>
          {errors.state && (
            <p id={stateErrId} role="alert" className="mt-1 text-sm text-red-700">
              {errors.state}
            </p>
          )}
        </div>

        <div className="sm:col-span-1">
          <label
            htmlFor={zipId}
            className="block text-sm font-medium text-[#2D352C] mb-2"
          >
            ZIP code
            <span className="text-red-600" aria-hidden="true"> *</span>
          </label>
          <input
            id={zipId}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={values.postalCode}
            onChange={(e) => onChange('postalCode', e.target.value.replace(/\D/g, ''))}
            aria-invalid={Boolean(errors.postalCode)}
            aria-describedby={errors.postalCode ? zipErrId : undefined}
            className={INPUT_CLASS}
            required
          />
          {errors.postalCode && (
            <p id={zipErrId} role="alert" className="mt-1 text-sm text-red-700">
              {errors.postalCode}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
