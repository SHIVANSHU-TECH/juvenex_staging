'use client'

import { useState } from 'react'

interface IntakeSummaryProps {
  intake: Record<string, unknown> | null
}

interface IntakeRow {
  label: string
  value: string
}

// Ordered list of well-known intake fields we surface in the patient view.
// Anything else is dropped from the formatted view — the raw payload may
// include consent flags or computed values the patient doesn't need to see.
const KNOWN_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'dob', label: 'Date of birth' },
  { key: 'sex', label: 'Sex' },
  { key: 'weightLbs', label: 'Weight (lbs)' },
  { key: 'heightFeet', label: 'Height (ft)' },
  { key: 'heightInches', label: 'Height (in)' },
  { key: 'pregnant', label: 'Pregnant' },
  { key: 'allergies', label: 'Allergies' },
  { key: 'currentMedications', label: 'Current medications' },
  { key: 'conditions', label: 'Conditions' },
  { key: 'conditionsOther', label: 'Other conditions' },
  { key: 'priorGlp1', label: 'Prior GLP-1 use' },
  { key: 'priorGlp1Which', label: 'Prior GLP-1 medication' },
  { key: 'priorGlp1Duration', label: 'Prior GLP-1 duration' },
]

function formatValue(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  if (Array.isArray(raw)) {
    const filtered = raw.filter(
      (item) => item !== null && item !== undefined && item !== ''
    )
    return filtered.length > 0 ? filtered.join(', ') : ''
  }
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No'
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw)
    } catch {
      return ''
    }
  }
  return String(raw)
}

export default function IntakeSummary({ intake }: IntakeSummaryProps) {
  const [expanded, setExpanded] = useState(false)

  if (!intake || Object.keys(intake).length === 0) {
    return null
  }

  const rows: IntakeRow[] = []
  for (const field of KNOWN_FIELDS) {
    if (!(field.key in intake)) continue
    const formatted = formatValue(intake[field.key])
    if (formatted.length === 0) continue
    rows.push({ label: field.label, value: formatted })
  }

  if (rows.length === 0) {
    return null
  }

  return (
    <section
      className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-5"
      aria-labelledby="intake-summary-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="intake-summary-heading"
          className="text-sm font-semibold text-[#2D352C]"
        >
          Medical intake
        </h2>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls="intake-summary-body"
          className="text-sm font-medium text-[var(--accent-strong)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 rounded px-1"
        >
          {expanded ? 'Hide' : 'View intake answers'}
        </button>
      </div>
      {expanded && (
        <dl
          id="intake-summary-body"
          className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3"
        >
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#8B9B83]">
                {row.label}
              </dt>
              <dd className="mt-0.5 text-sm text-[#2D352C] break-words">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
