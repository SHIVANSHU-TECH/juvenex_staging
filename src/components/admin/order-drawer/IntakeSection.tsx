'use client'

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import Section from './Section'
import { isObject, normaliseAddress } from './helpers'
import type { NormalisedAddress } from './helpers'
import type { AdminOrderDetail } from './types'

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderIntakeValue(value: unknown): ReactNode {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    return value.map((v) => String(v)).join(', ')
  }
  return (
    <pre className="text-xs leading-relaxed bg-white border border-[#E5EAE3] rounded-md p-2 overflow-x-auto">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

// ---------------------------------------------------------------------------
// Plain-text formatter for clipboard. Output is intentionally line-oriented
// and label-prefixed so an admin can scan it once and paste section-by-section
// into the PrescribeRx patient-create form.
// ---------------------------------------------------------------------------

function humaniseKey(key: string): string {
  // snake_case + camelCase -> Title Case
  const spaced = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function flattenIntakeValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((v) => flattenIntakeValue(v))
      .filter((s) => s !== '')
      .join(', ')
  }
  if (isObject(value)) {
    return JSON.stringify(value)
  }
  return String(value)
}

function formatAddressBlock(addr: NormalisedAddress): string {
  const lines: string[] = []
  if (addr.name) lines.push(addr.name)
  const streetLine = [addr.street, addr.apt].filter((p) => p).join(', ')
  if (streetLine) lines.push(streetLine)
  const cityLine = [addr.city, addr.state].filter((p) => p).join(', ')
  const cityZip = [cityLine, addr.zip].filter((p) => p).join(' ').trim()
  if (cityZip) lines.push(cityZip)
  if (addr.country) lines.push(addr.country)
  if (addr.phone) lines.push(`Phone: ${addr.phone}`)
  return lines.join('\n')
}

interface ClipboardSource {
  customerName: string | null
  contactEmail: string | null
  contactPhone: string | null
  shipping: NormalisedAddress | null
  intake: Record<string, unknown> | null
  orderId: string
}

function buildClipboardText(src: ClipboardSource): string {
  const sections: string[] = []

  // Header — order id makes it easy to cross-ref the PrescribeRx encounter.
  sections.push(`PrescribeRx Patient — Juvenex Order ${src.orderId}`)

  // Customer block
  const customer: string[] = ['CUSTOMER']
  if (src.customerName) customer.push(`Name: ${src.customerName}`)
  if (src.contactEmail) customer.push(`Email: ${src.contactEmail}`)
  if (src.contactPhone) customer.push(`Phone: ${src.contactPhone}`)
  if (customer.length > 1) sections.push(customer.join('\n'))

  // Shipping address block
  if (src.shipping) {
    sections.push(`SHIPPING ADDRESS\n${formatAddressBlock(src.shipping)}`)
  }

  // Intake block — keep the answers verbatim, one per line.
  if (src.intake) {
    const lines: string[] = ['MEDICAL INTAKE']
    for (const [key, value] of Object.entries(src.intake)) {
      const flat = flattenIntakeValue(value)
      if (flat === '') continue
      lines.push(`${humaniseKey(key)}: ${flat}`)
    }
    if (lines.length > 1) sections.push(lines.join('\n'))
  }

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface IntakeSectionProps {
  order: AdminOrderDetail
}

type CopyState = 'idle' | 'copied' | 'error'

export default function IntakeSection({ order }: IntakeSectionProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')

  const intakeRecord = isObject(order.intake_answers)
    ? (order.intake_answers as Record<string, unknown>)
    : null

  const filteredEntries = intakeRecord
    ? Object.entries(intakeRecord).filter(
        ([, v]) => v !== null && v !== undefined && v !== ''
      )
    : []

  const shipping = normaliseAddress(order.shipping_address)
  const customerName = order.customer_name?.trim() || null
  const contactEmail = order.contact_email ?? order.customer_email ?? null
  const contactPhone = order.contact_phone ?? null

  // Copy is meaningful when at least one of: intake, shipping, contact info.
  const hasAnythingToCopy =
    filteredEntries.length > 0 ||
    shipping !== null ||
    Boolean(contactEmail) ||
    Boolean(contactPhone) ||
    Boolean(customerName)

  const handleCopy = useCallback(async () => {
    const text = buildClipboardText({
      customerName,
      contactEmail,
      contactPhone,
      shipping,
      intake:
        filteredEntries.length > 0
          ? Object.fromEntries(filteredEntries)
          : null,
      orderId: order.id,
    })

    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(text)
        setCopyState('copied')
      } else {
        setCopyState('error')
      }
    } catch {
      setCopyState('error')
    }
    // Reset state after a short delay so the user sees the confirmation.
    window.setTimeout(() => setCopyState('idle'), 2500)
  }, [
    customerName,
    contactEmail,
    contactPhone,
    shipping,
    filteredEntries,
    order.id,
  ])

  const copyLabel =
    copyState === 'copied'
      ? 'Copied'
      : copyState === 'error'
        ? 'Copy failed'
        : 'Copy intake to clipboard'

  // ---------------------------------------------------------------------
  // Empty / no-intake states. Even in these cases we still want the copy
  // button when there's a shipping address — admins still paste contact +
  // address into PrescribeRx for non-prescription accounts.
  // ---------------------------------------------------------------------

  if (!intakeRecord) {
    return (
      <Section title="HIPAA Medical Intake">
        <div className="space-y-3">
          <p className="text-sm text-[#6B7568]">
            No intake (non-prescription order)
          </p>
          {hasAnythingToCopy && (
            <CopyButton
              onClick={handleCopy}
              label={copyLabel}
              state={copyState}
            />
          )}
        </div>
      </Section>
    )
  }

  if (filteredEntries.length === 0) {
    return (
      <Section title="HIPAA Medical Intake">
        <div className="space-y-3">
          <p className="text-sm text-[#6B7568]">Intake submitted but empty.</p>
          {hasAnythingToCopy && (
            <CopyButton
              onClick={handleCopy}
              label={copyLabel}
              state={copyState}
            />
          )}
        </div>
      </Section>
    )
  }

  return (
    <Section title="HIPAA Medical Intake">
      <div className="space-y-3">
        <dl className="space-y-2 text-sm">
          {filteredEntries.map(([key, value]) => (
            <div
              key={key}
              className="grid grid-cols-[10rem_1fr] gap-3 items-start"
            >
              <dt className="text-xs text-[#6B7568] capitalize pt-0.5">
                {key.replace(/_/g, ' ')}
              </dt>
              <dd className="text-[#2D352C] break-words">
                {renderIntakeValue(value)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="pt-2 border-t border-[#E5EAE3]">
          <CopyButton
            onClick={handleCopy}
            label={copyLabel}
            state={copyState}
          />
          <p className="mt-2 text-[11px] text-[#6B7568]">
            Includes customer contact, shipping address, and intake answers —
            ready to paste into the PrescribeRx patient form.
          </p>
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// CopyButton — extracted so the icon + a11y wiring stays consistent across
// the three rendering branches.
// ---------------------------------------------------------------------------

interface CopyButtonProps {
  onClick: () => void
  label: string
  state: CopyState
}

function CopyButton({ onClick, label, state }: CopyButtonProps) {
  const tone =
    state === 'copied'
      ? 'bg-[#E6EFE2] border-[var(--accent-strong)] text-[#2D352C]'
      : state === 'error'
        ? 'bg-red-50 border-red-200 text-red-700'
        : 'bg-white border-[#E5EAE3] text-[#2D352C] hover:bg-[#F5F8F3]'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-live="polite"
      className={`inline-flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/40 ${tone}`}
    >
      <CopyIcon state={state} />
      <span>{label}</span>
    </button>
  )
}

function CopyIcon({ state }: { state: CopyState }) {
  if (state === 'copied') {
    return (
      <svg
        className="h-4 w-4 flex-none"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m3 8 3.5 3.5L13 5" />
      </svg>
    )
  }
  return (
    <svg
      className="h-4 w-4 flex-none"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="8" height="8" rx="1.5" />
      <path d="M3 11V4a1 1 0 0 1 1-1h7" />
    </svg>
  )
}
