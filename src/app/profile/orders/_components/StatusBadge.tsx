'use client'

import type { ReactNode } from 'react'
import type {
  OrderStatus,
  PaymentStatus,
  PrescribeRxStatus,
} from './types'

// Shared color tokens for status pills. Values map directly to the project's
// existing palette tokens — surface stays consistent with profile/shop.
//
// Each status also carries an inline SVG icon so the visual identity of
// "pending" / "succeeded" / "failed" survives even when colors don't read
// well (color-blindness, custom themes, screenshots, printed receipts).

interface BadgeStyle {
  label: string
  className: string
  iconKey: IconKey
}

type IconKey = 'check' | 'clock' | 'x' | 'alert' | 'refund' | 'truck'

// --- Inline icons (no extra dependency) ---------------------------------
// Inline SVGs match the lucide-react glyphs the audit asked for but keep
// the bundle small. aria-hidden because the badge text + aria-label carry
// the meaning.

interface IconProps {
  className?: string
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function ClockIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function XIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  )
}

function AlertIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  )
}

function RefundIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function TruckIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="1" y="6" width="14" height="11" rx="1" />
      <path d="M15 9h4l3 4v4h-7" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
    </svg>
  )
}

function renderIcon(key: IconKey): ReactNode {
  const cls = 'w-3.5 h-3.5 shrink-0'
  switch (key) {
    case 'check':
      return <CheckIcon className={cls} />
    case 'clock':
      return <ClockIcon className={cls} />
    case 'x':
      return <XIcon className={cls} />
    case 'alert':
      return <AlertIcon className={cls} />
    case 'refund':
      return <RefundIcon className={cls} />
    case 'truck':
      return <TruckIcon className={cls} />
    default:
      return null
  }
}

// --- Status -> style maps -----------------------------------------------

const ORDER_STATUS_STYLES: Record<OrderStatus, BadgeStyle> = {
  pending: {
    label: 'Pending',
    className: 'bg-[#EEF1ED] text-[#6B7567] border-[#D9DFD3]',
    iconKey: 'clock',
  },
  paid: {
    label: 'Paid',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    iconKey: 'check',
  },
  shipped: {
    label: 'Shipped',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    iconKey: 'truck',
  },
  fulfilled: {
    label: 'Fulfilled',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconKey: 'check',
  },
  refunded: {
    label: 'Refunded',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    iconKey: 'refund',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-red-50 text-red-700 border-red-200',
    iconKey: 'x',
  },
}

const PRESCRIBERX_STATUS_STYLES: Record<PrescribeRxStatus, BadgeStyle> = {
  not_sent: {
    label: 'Awaiting fulfillment',
    className: 'bg-[#EEF1ED] text-[#6B7567] border-[#D9DFD3]',
    iconKey: 'clock',
  },
  sent: {
    label: 'Sent to PrescribeRx',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    iconKey: 'clock',
  },
  confirmed: {
    label: 'Confirmed',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconKey: 'check',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-50 text-red-700 border-red-200',
    iconKey: 'alert',
  },
}

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, BadgeStyle> = {
  pending: {
    label: 'Pending',
    className: 'bg-[#EEF1ED] text-[#6B7567] border-[#D9DFD3]',
    iconKey: 'clock',
  },
  succeeded: {
    label: 'Succeeded',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconKey: 'check',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-50 text-red-700 border-red-200',
    iconKey: 'x',
  },
  refunded: {
    label: 'Refunded',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    iconKey: 'refund',
  },
}

const FALLBACK_STYLE: BadgeStyle = {
  label: 'Unknown',
  className: 'bg-[#EEF1ED] text-[#6B7567] border-[#D9DFD3]',
  iconKey: 'alert',
}

// --- Pill renderer ------------------------------------------------------

function Pill({ label, className, iconKey }: BadgeStyle) {
  return (
    <span
      role="status"
      aria-label={`Status: ${label}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${className}`}
    >
      {renderIcon(iconKey)}
      <span>{label}</span>
    </span>
  )
}

// --- Public components --------------------------------------------------

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const style = ORDER_STATUS_STYLES[status] ?? {
    ...FALLBACK_STYLE,
    label: status,
  }
  return <Pill {...style} />
}

export function PrescribeRxStatusBadge({
  status,
}: {
  status: PrescribeRxStatus | null
}) {
  const resolved: PrescribeRxStatus = status ?? 'not_sent'
  const style = PRESCRIBERX_STATUS_STYLES[resolved] ?? FALLBACK_STYLE
  return <Pill {...style} />
}

/**
 * Replaces the PrescribeRx fulfillment badge on MEMBERSHIP orders. A
 * membership activates the moment payment lands — nothing ships and nothing
 * is sent to PrescribeRx, so "Awaiting fulfillment" on a paid membership
 * reads like a stuck order (the exact confusion in Braeden's Jul 9 video).
 */
export function MembershipAccessBadge({ paid }: { paid: boolean }) {
  return (
    <Pill
      {...(paid
        ? {
            label: 'Membership active',
            className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            iconKey: 'check' as const,
          }
        : {
            label: 'Awaiting payment',
            className: 'bg-[#EEF1ED] text-[#6B7567] border-[#D9DFD3]',
            iconKey: 'clock' as const,
          })}
    />
  )
}

export function PaymentStatusBadge({
  status,
}: {
  status: PaymentStatus | null
}) {
  const resolved: PaymentStatus = status ?? 'pending'
  const style = PAYMENT_STATUS_STYLES[resolved] ?? FALLBACK_STYLE
  return <Pill {...style} />
}
