'use client'

import { useCallback, useState } from 'react'
import Section from './Section'
import StatusBadge from './StatusBadge'
import ActionButton from './ActionButton'
import { prescriberXVariant } from './helpers'
import type { AdminOrderDetail } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESCRIBERX_DASHBOARD_URL =
  'https://prescribe-rx.com/sales/encounters/create'

// GLP-1 Screening encounter type UUID — per stored ops memory this is the
// value the admin pastes into PrescribeRx for net-new GLP-1 patients.
const GLP1_SCREENING_ENCOUNTER_UUID =
  '019ce396-46a1-73ab-87d6-c40310555401'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FulfillmentSectionProps {
  order: AdminOrderDetail
  refInput: string
  onRefChange: (v: string) => void
  busy: string | null
  onMarkSent: () => void
  onMarkConfirmed: () => void
  onMarkFulfilled: () => void
  onMarkFailed: () => void
  onRetryMarkSent: () => void
}

type CopyKind = 'idle' | 'copied' | 'error'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FulfillmentSection({
  order,
  refInput,
  onRefChange,
  busy,
  onMarkSent,
  onMarkConfirmed,
  onMarkFulfilled,
  onMarkFailed,
  onRetryMarkSent,
}: FulfillmentSectionProps) {
  const prx = order.prescriberx_status ?? 'not_sent'

  // The high-level order status owns whether *any* fulfillment action is
  // possible. Cancelled / refunded orders are read-only.
  const orderTerminal =
    order.status === 'cancelled' || order.status === 'refunded'

  const isBusy = busy !== null

  // -------------------------------------------------------------------------
  // PrescribeRx UUID copy helper — independent of the intake copy button so
  // admins can grab just the encounter type when re-running.
  // -------------------------------------------------------------------------

  const [uuidCopy, setUuidCopy] = useState<CopyKind>('idle')

  const handleCopyUuid = useCallback(async () => {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(GLP1_SCREENING_ENCOUNTER_UUID)
        setUuidCopy('copied')
      } else {
        setUuidCopy('error')
      }
    } catch {
      setUuidCopy('error')
    }
    window.setTimeout(() => setUuidCopy('idle'), 2500)
  }, [])

  return (
    <Section title="PrescribeRx Fulfillment">
      <div className="space-y-4">
        {/* Status row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[#6B7568]">Current</span>
          <StatusBadge status={prx} variant={prescriberXVariant(prx)} />
          {order.prescriberx_sent_at && (
            <span
              className="text-xs text-[#6B7568]"
              title={new Date(order.prescriberx_sent_at).toLocaleString()}
            >
              {new Date(order.prescriberx_sent_at).toLocaleDateString()}
            </span>
          )}
        </div>

        {orderTerminal && (
          <div
            role="note"
            className="text-xs text-[#6B7568] bg-[#F5F8F3] border border-[#E5EAE3] rounded-lg px-3 py-2"
          >
            Order is {order.status}. Fulfillment actions disabled.
          </div>
        )}

        {/* PrescribeRx dashboard handoff — visible whenever prx work is in
            progress (not_sent / sent / failed). Hidden once confirmed since
            the encounter is already filed. */}
        {!orderTerminal && prx !== 'confirmed' && (
          <DashboardHandoff
            uuidCopyState={uuidCopy}
            onCopyUuid={handleCopyUuid}
          />
        )}

        {/* State-driven CTA cluster */}
        <StateMachineActions
          prx={prx}
          orderStatus={order.status}
          orderTerminal={orderTerminal}
          isBusy={isBusy}
          busyLabel={busy}
          refInput={refInput}
          onRefChange={onRefChange}
          onMarkSent={onMarkSent}
          onMarkConfirmed={onMarkConfirmed}
          onMarkFulfilled={onMarkFulfilled}
          onMarkFailed={onMarkFailed}
          onRetryMarkSent={onRetryMarkSent}
        />

        {/* Fulfilled-by trail */}
        {order.fulfilled_at && (
          <p className="text-xs text-[#6B7568]">
            Fulfilled {new Date(order.fulfilled_at).toLocaleString()}
            {order.fulfilled_by && (
              <span className="ml-1 font-mono">
                by {order.fulfilled_by.slice(0, 8)}
              </span>
            )}
          </p>
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// DashboardHandoff — deeplink + copy-to-clipboard for the GLP-1 Screening
// encounter UUID. Pure markup, no state of its own; copy state is owned by
// the parent so the button can render idle/copied/error consistently.
// ---------------------------------------------------------------------------

interface DashboardHandoffProps {
  uuidCopyState: CopyKind
  onCopyUuid: () => void
}

function DashboardHandoff({
  uuidCopyState,
  onCopyUuid,
}: DashboardHandoffProps) {
  const copyLabel =
    uuidCopyState === 'copied'
      ? 'Copied'
      : uuidCopyState === 'error'
        ? 'Copy failed'
        : 'Copy UUID'

  return (
    <div className="space-y-2 bg-white border border-[#E5EAE3] rounded-lg p-3">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={PRESCRIBERX_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg bg-[var(--accent-strong)] text-white text-sm font-medium hover:bg-[#4F6A44] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/40"
        >
          <ExternalIcon />
          <span>Open PrescribeRx Dashboard</span>
        </a>
        <span className="text-[11px] text-[#6B7568]">
          Opens in a new tab
        </span>
      </div>

      <div>
        <p className="text-[11px] font-medium text-[#6B7568] mb-1">
          GLP-1 Screening encounter type
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="font-mono text-xs bg-[#F5F8F3] border border-[#E5EAE3] rounded px-2 py-1 text-[#2D352C] break-all">
            {GLP1_SCREENING_ENCOUNTER_UUID}
          </code>
          <button
            type="button"
            onClick={onCopyUuid}
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/40 ${
              uuidCopyState === 'copied'
                ? 'bg-[#E6EFE2] border-[var(--accent-strong)] text-[#2D352C]'
                : uuidCopyState === 'error'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-white border-[#E5EAE3] text-[#2D352C] hover:bg-[#F5F8F3]'
            }`}
          >
            <CopyIcon variant={uuidCopyState === 'copied' ? 'check' : 'copy'} />
            <span>{copyLabel}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StateMachineActions — exhaustive, prx-status driven CTA cluster. Each
// branch renders the actions valid in that state and nothing else, so the
// admin never sees a button they cannot use.
// ---------------------------------------------------------------------------

interface StateMachineActionsProps {
  prx: string
  orderStatus: string
  orderTerminal: boolean
  isBusy: boolean
  busyLabel: string | null
  refInput: string
  onRefChange: (v: string) => void
  onMarkSent: () => void
  onMarkConfirmed: () => void
  onMarkFulfilled: () => void
  onMarkFailed: () => void
  onRetryMarkSent: () => void
}

function StateMachineActions({
  prx,
  orderStatus,
  orderTerminal,
  isBusy,
  busyLabel,
  refInput,
  onRefChange,
  onMarkSent,
  onMarkConfirmed,
  onMarkFulfilled,
  onMarkFailed,
  onRetryMarkSent,
}: StateMachineActionsProps) {
  if (orderTerminal) {
    // Cancelled / refunded — no actions available, but we still surface the
    // existing reference number for the audit trail.
    if (refInput) {
      return (
        <div className="text-xs text-[#6B7568]">
          PrescribeRx reference:{' '}
          <span className="font-mono text-[#2D352C]">{refInput}</span>
        </div>
      )
    }
    return null
  }

  if (prx === 'not_sent') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-[#6B7568]">
          Step 1 — open PrescribeRx, create the patient + encounter using the
          copied intake. Step 2 — return here and mark sent.
        </p>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="Mark Sent to PrescribeRx"
            tone="primary"
            disabled={isBusy}
            loading={busyLabel === 'Mark Sent'}
            onClick={onMarkSent}
          />
        </div>
      </div>
    )
  }

  if (prx === 'sent') {
    return (
      <div className="space-y-3">
        <ReferenceInput
          value={refInput}
          onChange={onRefChange}
          helpText="Patient ID returned by PrescribeRx after the encounter is created."
        />
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="Mark Confirmed"
            tone="primary"
            disabled={isBusy}
            loading={busyLabel === 'Mark Confirmed'}
            onClick={onMarkConfirmed}
          />
          <ActionButton
            label="Mark Failed"
            tone="danger"
            disabled={isBusy}
            loading={busyLabel === 'Mark Failed'}
            onClick={onMarkFailed}
          />
        </div>
      </div>
    )
  }

  if (prx === 'confirmed') {
    // Mark Fulfilled requires the high-level order.status to be 'paid' or
    // 'shipped' — the API enforces this server-side. Surface the guard in the
    // UI so admins aren't surprised by a 422 after they click.
    const canFulfill = orderStatus === 'paid' || orderStatus === 'shipped'
    return (
      <div className="space-y-3">
        {refInput && (
          <div className="text-xs text-[#6B7568]">
            PrescribeRx reference:{' '}
            <span className="font-mono text-[#2D352C]">{refInput}</span>
          </div>
        )}
        {!canFulfill && (
          <p className="text-xs text-[#6B7568] bg-[#F5F8F3] border border-[#E5EAE3] rounded-lg px-3 py-2">
            PrescribeRx confirmed. Order status is{' '}
            <span className="font-mono">{orderStatus}</span> — fulfillment
            requires status <span className="font-mono">paid</span> or{' '}
            <span className="font-mono">shipped</span>.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="Mark Order Fulfilled"
            tone="primary"
            disabled={isBusy || !canFulfill}
            loading={busyLabel === 'Mark Fulfilled'}
            onClick={onMarkFulfilled}
            title={
              canFulfill
                ? undefined
                : `Cannot fulfill from status: ${orderStatus}`
            }
          />
        </div>
      </div>
    )
  }

  if (prx === 'failed') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Last attempt failed. Retry once the issue is resolved on the
          PrescribeRx side.
        </p>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="Retry — Mark Sent Again"
            tone="primary"
            disabled={isBusy}
            loading={busyLabel === 'Mark Sent'}
            onClick={onRetryMarkSent}
          />
        </div>
      </div>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// ReferenceInput — small wrapper so the input + label + help-text stays
// consistent in the 'sent' branch.
// ---------------------------------------------------------------------------

interface ReferenceInputProps {
  value: string
  onChange: (v: string) => void
  helpText?: string
}

function ReferenceInput({ value, onChange, helpText }: ReferenceInputProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[#6B7568] mb-1">
        PrescribeRx patient / encounter reference
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. RX-2026-04-28-0001"
        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
      />
      {helpText && (
        <span className="block mt-1 text-[11px] text-[#6B7568]">
          {helpText}
        </span>
      )}
    </label>
  )
}

// ---------------------------------------------------------------------------
// Inline icons
// ---------------------------------------------------------------------------

function ExternalIcon() {
  return (
    <svg
      className="h-4 w-4 flex-none"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3h4v4" />
      <path d="m13 3-6 6" />
      <path d="M11 9v3.5A1.5 1.5 0 0 1 9.5 14H4a1 1 0 0 1-1-1V7.5A1.5 1.5 0 0 1 4.5 6H8" />
    </svg>
  )
}

function CopyIcon({ variant }: { variant: 'copy' | 'check' }) {
  if (variant === 'check') {
    return (
      <svg
        className="h-3.5 w-3.5 flex-none"
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
      className="h-3.5 w-3.5 flex-none"
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
