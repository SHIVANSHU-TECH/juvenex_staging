'use client'

import { US_STATES } from '@/lib/intakeSchema'
import type { FullIntake } from '@/lib/intakeSchema'

interface Props {
  values: FullIntake
  onEditStep: (stepIndex: 0 | 1 | 2) => void
}

const STATE_BY_CODE: ReadonlyMap<string, string> = new Map<string, string>(
  US_STATES.map(([code, name]) => [code, name])
)

function formatPhone(p: string): string {
  if (p.length !== 10) return p
  return `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-[#EEF1ED] last:border-b-0">
      <dt className="text-sm text-[var(--text-muted)] flex-shrink-0">{label}</dt>
      <dd className="text-sm text-[#2D352C] text-right break-words">{value || '—'}</dd>
    </div>
  )
}

interface SectionProps {
  title: string
  stepIndex: 0 | 1 | 2
  onEdit: (stepIndex: 0 | 1 | 2) => void
  children: React.ReactNode
}

function Section({ title, stepIndex, onEdit, children }: SectionProps) {
  return (
    <section
      aria-labelledby={`review-${stepIndex}`}
      className="bg-white rounded-2xl border border-[#E5EAE3] p-5"
    >
      <header className="flex items-center justify-between mb-3">
        <h3
          id={`review-${stepIndex}`}
          className="text-base font-semibold text-[#2D352C]"
        >
          {title}
        </h3>
        <button
          type="button"
          onClick={() => onEdit(stepIndex)}
          className="text-sm font-medium text-[var(--accent-strong)] underline underline-offset-2 px-2 py-1 min-h-[32px] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
          aria-label={`Edit ${title.toLowerCase()}`}
        >
          Edit
        </button>
      </header>
      <dl>{children}</dl>
    </section>
  )
}

export default function IntakeStep4Review({ values, onEditStep }: Props) {
  const heightStr = `${values.heightFeet} ft ${values.heightInches} in`
  const stateName = STATE_BY_CODE.get(values.state) ?? values.state
  const fullAddress = [
    values.addressLine1,
    values.addressLine2,
    `${values.city}, ${values.state} ${values.postalCode}`,
  ]
    .filter((part) => part && part.length > 0)
    .join(' · ')

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Review your information before submitting. You can edit any section
        below.
      </p>

      <Section title="Contact" stepIndex={0} onEdit={onEditStep}>
        <Row label="Name" value={`${values.firstName} ${values.lastName}`.trim()} />
        <Row label="Email" value={values.email} />
        <Row label="Phone" value={formatPhone(values.phone)} />
      </Section>

      <Section title="Identity & address" stepIndex={1} onEdit={onEditStep}>
        <Row label="Date of birth" value={values.dob} />
        <Row label="Address" value={fullAddress} />
        <Row label="State" value={stateName} />
      </Section>

      <Section title="Medical" stepIndex={2} onEdit={onEditStep}>
        <Row label="Visit type" value="GLP-1 Screening" />
        <Row label="Reason" value={values.reasonForVisit} />
        <Row label="Height" value={heightStr} />
        <Row label="Weight" value={`${values.weightLb} lb`} />
        <Row label="Goal weight" value={`${values.goalWeightLb} lb`} />
        {values.medicalConditions && (
          <Row label="Conditions" value={values.medicalConditions} />
        )}
        {values.currentMedications && (
          <Row label="Medications" value={values.currentMedications} />
        )}
      </Section>
    </div>
  )
}
