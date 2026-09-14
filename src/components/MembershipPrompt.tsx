'use client'

import Link from 'next/link'
import { MARKETPLACE_TIERS } from '@/lib/marketplace-access'
import AccessText from '@/components/AccessText'

interface MembershipPromptProps {
  title: string
  eyebrow?: string
  description: string
  ctaBase: string
  highlightedTierLabel?: string | null
  onClose: () => void
  // When false, the prompt is a hard gate: clicking the backdrop does NOT
  // dismiss it (no paywall bypass). The corner control still calls onClose,
  // but the caller wires that to leave the gated area entirely rather than
  // silently revealing it. Defaults to true (a normal, dismissible prompt).
  dismissible?: boolean
  // Accessible label + visible text for the corner control. For a hard gate
  // this should describe leaving (e.g. "Leave store"), not "Close".
  closeLabel?: string
}

export default function MembershipPrompt({
  title,
  eyebrow = 'Membership required',
  description,
  ctaBase,
  highlightedTierLabel,
  onClose,
  dismissible = true,
  closeLabel,
}: MembershipPromptProps) {
  // This prompt is a "membership required" gate (consult/intake). The free tier
  // never unlocks a gated feature, so offering a "Choose Free" card here just
  // dead-ends the user — show only the paid membership tiers.
  const tiers = MARKETPLACE_TIERS.filter((tier) => tier.slug !== 'free')
  const cornerLabel = closeLabel ?? 'Close membership options'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="membership-prompt-title"
      className="fixed inset-0 z-[60] flex items-end bg-black/50 px-3 py-4 sm:items-center sm:justify-center"
      onMouseDown={(event) => {
        // Backdrop click dismisses only when this is not a hard gate.
        if (dismissible && event.target === event.currentTarget) onClose()
      }}
    >
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#FAF9F6] p-4 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent-strong)]">
              {eyebrow}
            </p>
            <h2 id="membership-prompt-title" className="mt-1 text-xl font-bold text-[#2D352C]">
              {title}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
            <p className="mt-3 rounded-xl border-2 border-green-500 bg-green-50 px-4 py-3 text-base font-bold leading-snug text-green-600 sm:text-lg">
              <AccessText>
                Transparency matters to us! Real Savings. No Hidden Markups. By
                signing up, you receive ACCESS to exclusive Member-only pricing
                passed directly to you.
              </AccessText>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={cornerLabel}
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl px-3 text-sm font-medium text-[#6B7567] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
          >
            {dismissible ? <span aria-hidden="true">✕</span> : <span>Leave</span>}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {tiers.map((tier) => (
            <Link
              key={tier.slug}
              href={`${ctaBase}${ctaBase.includes('?') ? '&' : '?'}plan=${tier.slug}`}
              className={`rounded-xl border-2 bg-white p-4 shadow-sm transition hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 ${
                highlightedTierLabel === tier.label
                  ? 'border-[var(--accent-strong)]'
                  : 'border-[#E5EAE3]'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-[#2D352C]">{tier.label}</span>
                <span className="text-sm font-bold text-[var(--accent-strong)]">
                  {tier.price}
                </span>
              </div>
              {tier.slug === 'optimization' && (
                <span className="mt-2 inline-flex rounded-full bg-[#EAF0E5] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-strong)]">
                  Most popular
                </span>
              )}
              <p className="mt-2 text-xs leading-snug text-[var(--text-muted)]">
                <AccessText>{tier.tagline}</AccessText>
              </p>
              <span className="mt-3 inline-flex text-xs font-bold text-[var(--accent-strong)]">
                Choose {tier.label}
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-4 rounded-xl border border-[#E5EAE3] bg-white px-4 py-3 text-xs leading-5 text-[#6B7567]">
          Membership fees are for platform access only. Juvenex does not sell
          consultations, peptides, prescriptions, medications, protocols, or
          medical services. By continuing, you agree to the{' '}
          <Link href="/legal/terms" className="font-semibold text-[var(--accent-strong)] underline">
            Membership Agreement
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="font-semibold text-[var(--accent-strong)] underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
