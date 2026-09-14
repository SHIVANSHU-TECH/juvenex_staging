'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { DEFAULT_ENCOUNTER_TYPE_ID } from '@/lib/intakeSchema'
import type { FullIntake } from '@/lib/intakeSchema'

interface EncounterTypeOption {
  id: string
  name: string
  is_featured: boolean
  requires_labs: boolean
}

interface EncounterTypesResponse {
  success: boolean
  data?: EncounterTypeOption[]
}

type MedicalFields = Pick<
  FullIntake,
  | 'encounterTypeId'
  | 'reasonForVisit'
  | 'heightFeet'
  | 'heightInches'
  | 'weightLb'
  | 'goalWeightLb'
  | 'medicalConditions'
  | 'currentMedications'
  | 'consent'
>
type MedicalErrors = Partial<Record<keyof MedicalFields, string>>

const INPUT_CLASS =
  'w-full px-4 py-3 min-h-[44px] rounded-xl bg-white border border-[#E5EAE3] text-[#2D352C] shadow-sm focus:border-[var(--accent-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors aria-[invalid=true]:border-red-400'

interface Props {
  values: MedicalFields
  errors: MedicalErrors
  // Generic over `keyof FullIntake` to match the parent dispatcher; see
  // IntakeStep2Address for rationale.
  onChange: <K extends keyof FullIntake>(field: K, value: FullIntake[K]) => void
}

/**
 * Step 3 — Encounter type & medical fields.
 *
 * The encounter-type select is hydrated from `/api/telehealth/encounter-types`
 * on mount. While the request is in-flight, the select is disabled and shows
 * a "Loading visit types…" option. On error, the select stays disabled with
 * a small inline error and falls back to the env-derived
 * `DEFAULT_ENCOUNTER_TYPE_ID` so the form remains submittable.
 *
 * Default selection precedence:
 *   1. Whatever id is already in `formState.encounterTypeId` (and exists in
 *      the fetched list)
 *   2. The first `is_featured: true` type
 *   3. The first item in the list
 */
export default function IntakeStep3Medical({ values, errors, onChange }: Props) {
  const encounterId = useId()
  const [encounterTypes, setEncounterTypes] = useState<EncounterTypeOption[]>([])
  const [encounterTypesLoading, setEncounterTypesLoading] = useState(true)
  const [encounterTypesError, setEncounterTypesError] = useState<string | null>(null)
  const initializedDefaultRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/telehealth/encounter-types', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as EncounterTypesResponse
        if (!json.success || !Array.isArray(json.data)) {
          throw new Error('Invalid response')
        }
        return json.data
      })
      .then((list) => {
        setEncounterTypes(list)
        // Choose default exactly once, only if the parent hasn't already
        // committed to a value present in the fetched list.
        if (initializedDefaultRef.current) return
        initializedDefaultRef.current = true
        const currentId = values.encounterTypeId
        const currentExists = list.some((t) => t.id === currentId)
        if (currentExists) return
        const featured = list.find((t) => t.is_featured)
        const next = featured?.id ?? list[0]?.id ?? DEFAULT_ENCOUNTER_TYPE_ID
        if (next !== currentId) onChange('encounterTypeId', next)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setEncounterTypesError('Could not load visit types — using default.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setEncounterTypesLoading(false)
      })

    return () => controller.abort()
    // Intentionally run once on mount; we do not want to refetch on every
    // keystroke as the parent's reducer rebuilds `values`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedType = encounterTypes.find((t) => t.id === values.encounterTypeId)
  const showLabsHint = selectedType?.requires_labs === true
  const reasonId = useId()
  const heightFtId = useId()
  const heightInId = useId()
  const weightId = useId()
  const goalWeightId = useId()
  const condId = useId()
  const medsId = useId()
  const consentId = useId()
  const reasonErrId = useId()
  const heightErrId = useId()
  const weightErrId = useId()
  const goalErrId = useId()
  const consentErrId = useId()
  const reasonHelperId = useId()

  const heightError = errors.heightFeet ?? errors.heightInches
  const reasonLen = values.reasonForVisit.length

  return (
    <div className="space-y-6">
      <div>
        <label
          htmlFor={encounterId}
          className="block text-sm font-medium text-[#2D352C] mb-2"
        >
          Visit type
        </label>
        <select
          id={encounterId}
          value={values.encounterTypeId || DEFAULT_ENCOUNTER_TYPE_ID}
          onChange={(e) => onChange('encounterTypeId', e.target.value)}
          className={INPUT_CLASS}
          disabled={encounterTypesLoading || encounterTypes.length === 0}
        >
          {encounterTypesLoading && (
            <option value={values.encounterTypeId || DEFAULT_ENCOUNTER_TYPE_ID}>
              Loading visit types…
            </option>
          )}
          {!encounterTypesLoading && encounterTypes.length === 0 && (
            <option value={DEFAULT_ENCOUNTER_TYPE_ID}>GLP-1 Screening</option>
          )}
          {!encounterTypesLoading &&
            encounterTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
        {encounterTypesError ? (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {encounterTypesError}
          </p>
        ) : showLabsHint ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            This visit type may require recent lab results.
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor={reasonId}
          className="block text-sm font-medium text-[#2D352C] mb-2"
        >
          Reason for visit
          <span className="text-red-600" aria-hidden="true"> *</span>
        </label>
        <textarea
          id={reasonId}
          rows={4}
          maxLength={500}
          value={values.reasonForVisit}
          onChange={(e) => onChange('reasonForVisit', e.target.value)}
          aria-invalid={Boolean(errors.reasonForVisit)}
          aria-describedby={
            errors.reasonForVisit
              ? `${reasonErrId} ${reasonHelperId}`
              : reasonHelperId
          }
          placeholder="Briefly describe what you'd like to discuss with the provider…"
          className={INPUT_CLASS}
          required
        />
        <p
          id={reasonHelperId}
          className="mt-1 text-xs text-[var(--text-muted)]"
        >
          {reasonLen}/500 characters · 20 minimum
        </p>
        {errors.reasonForVisit && (
          <p id={reasonErrId} role="alert" className="mt-1 text-sm text-red-700">
            {errors.reasonForVisit}
          </p>
        )}
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-[#2D352C] mb-2">
          Height
          <span className="text-red-600" aria-hidden="true"> *</span>
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor={heightFtId}
              className="block text-xs text-[var(--text-muted)] mb-1"
            >
              Feet
            </label>
            <input
              id={heightFtId}
              type="number"
              inputMode="numeric"
              min={3}
              max={8}
              value={Number.isFinite(values.heightFeet) && values.heightFeet > 0 ? values.heightFeet : ''}
              onChange={(e) => onChange('heightFeet', e.target.value === '' ? 0 : Number(e.target.value))}
              aria-invalid={Boolean(errors.heightFeet)}
              aria-describedby={heightError ? heightErrId : undefined}
              className={INPUT_CLASS}
              required
            />
          </div>
          <div>
            <label
              htmlFor={heightInId}
              className="block text-xs text-[var(--text-muted)] mb-1"
            >
              Inches
            </label>
            <input
              id={heightInId}
              type="number"
              inputMode="numeric"
              min={0}
              max={11}
              value={Number.isFinite(values.heightInches) && values.heightInches >= 0 ? values.heightInches : ''}
              onChange={(e) => onChange('heightInches', e.target.value === '' ? 0 : Number(e.target.value))}
              aria-invalid={Boolean(errors.heightInches)}
              aria-describedby={heightError ? heightErrId : undefined}
              className={INPUT_CLASS}
              required
            />
          </div>
        </div>
        {heightError && (
          <p id={heightErrId} role="alert" className="mt-1 text-sm text-red-700">
            {heightError}
          </p>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor={weightId}
            className="block text-sm font-medium text-[#2D352C] mb-2"
          >
            Current weight (lb)
            <span className="text-red-600" aria-hidden="true"> *</span>
          </label>
          <input
            id={weightId}
            type="number"
            inputMode="numeric"
            min={1}
            value={values.weightLb > 0 ? values.weightLb : ''}
            onChange={(e) => onChange('weightLb', e.target.value === '' ? 0 : Number(e.target.value))}
            aria-invalid={Boolean(errors.weightLb)}
            aria-describedby={errors.weightLb ? weightErrId : undefined}
            className={INPUT_CLASS}
            required
          />
          {errors.weightLb && (
            <p id={weightErrId} role="alert" className="mt-1 text-sm text-red-700">
              {errors.weightLb}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor={goalWeightId}
            className="block text-sm font-medium text-[#2D352C] mb-2"
          >
            Goal weight (lb)
            <span className="text-red-600" aria-hidden="true"> *</span>
          </label>
          <input
            id={goalWeightId}
            type="number"
            inputMode="numeric"
            min={1}
            value={values.goalWeightLb > 0 ? values.goalWeightLb : ''}
            onChange={(e) => onChange('goalWeightLb', e.target.value === '' ? 0 : Number(e.target.value))}
            aria-invalid={Boolean(errors.goalWeightLb)}
            aria-describedby={errors.goalWeightLb ? goalErrId : undefined}
            className={INPUT_CLASS}
            required
          />
          {errors.goalWeightLb && (
            <p id={goalErrId} role="alert" className="mt-1 text-sm text-red-700">
              {errors.goalWeightLb}
            </p>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor={condId}
          className="block text-sm font-medium text-[#2D352C] mb-2"
        >
          Medical conditions (optional)
        </label>
        <textarea
          id={condId}
          rows={3}
          maxLength={2000}
          value={values.medicalConditions ?? ''}
          onChange={(e) => onChange('medicalConditions', e.target.value)}
          placeholder="E.g., type 2 diabetes, hypertension…"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label
          htmlFor={medsId}
          className="block text-sm font-medium text-[#2D352C] mb-2"
        >
          Current medications (optional)
        </label>
        <textarea
          id={medsId}
          rows={3}
          maxLength={2000}
          value={values.currentMedications ?? ''}
          onChange={(e) => onChange('currentMedications', e.target.value)}
          placeholder="E.g., metformin 500mg, lisinopril 10mg…"
          className={INPUT_CLASS}
        />
      </div>

      <div className="bg-[#EEF1ED] border border-[#D8DFD5] rounded-xl p-4">
        <label htmlFor={consentId} className="flex items-start gap-3 cursor-pointer">
          <input
            id={consentId}
            type="checkbox"
            checked={values.consent === true}
            onChange={(e) => onChange('consent', e.target.checked as MedicalFields['consent'])}
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={errors.consent ? consentErrId : undefined}
            className="mt-1 w-5 h-5 rounded border-[var(--accent-strong)] text-[var(--accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            required
          />
          <span className="text-sm text-[#2D352C]">
            I consent to share this information with PrescribeRx telehealth
            services so a licensed provider can review my intake and contact
            me about a consultation. My information is encrypted in transit.
          </span>
        </label>
        {errors.consent && (
          <p id={consentErrId} role="alert" className="mt-2 text-sm text-red-700">
            {errors.consent}
          </p>
        )}
      </div>
    </div>
  )
}
