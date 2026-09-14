import type { ReactNode } from 'react'
import { STATUS_PALETTE, type StatusVariant } from '@/lib/admin-theme'

interface StatusPillProps {
  variant: StatusVariant
  children: ReactNode
  className?: string
}

/**
 * Small rounded status pill used across admin tables and cards.
 * Linear/Stripe-style: soft tinted background + colored text, optional
 * ring for definition against off-white surfaces.
 */
export default function StatusPill({
  variant,
  children,
  className = '',
}: StatusPillProps) {
  const palette = STATUS_PALETTE[variant]
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${palette.bg} ${palette.text} ${palette.ring} ${className}`}
    >
      {children}
    </span>
  )
}
