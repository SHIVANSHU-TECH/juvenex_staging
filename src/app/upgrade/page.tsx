'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { MARKETPLACE_TIERS } from '@/lib/marketplace-access'
import { prettyPathLabel } from '@/lib/membership'
import AccessText from '@/components/AccessText'
import { isNativeApp } from '@/lib/native-iap'

export default function UpgradePage() {
  return (
    <Suspense fallback={<UpgradeFallback />}>
      <UpgradeContent />
    </Suspense>
  )
}

function UpgradeFallback() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--accent-strong)]" />
    </div>
  )
}

function UpgradeContent() {
  const params = useSearchParams()
  const from = params.get('from')
  const fromLabel = prettyPathLabel(from)
  const tiers = MARKETPLACE_TIERS
  // WEB ONLY — the native shell's IAP 7-day trial (ASC introductory offer) isn't
  // configured, so native must not advertise a trial it can't honor (App Store
  // guideline 3.1.2). Native sees the plain "Choose {tier}" subscribe CTA.
  const trialEnabled =
    process.env.NEXT_PUBLIC_MEMBERSHIP_TRIAL_ENABLED === 'true' && !isNativeApp()

  return (
    <main className="min-h-screen bg-[#FAF9F6] text-[#2D352C] px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#2D352C]">
            Choose a membership to continue
          </h1>
          {from && (
            <p className="mt-3 text-sm text-[#6B7567]">
              Unlock {fromLabel} with a membership.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.slug}
              className="bg-white rounded-2xl border border-[#E5EAE3] shadow-xl p-5 flex flex-col"
            >
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg font-bold text-[#2D352C]">{tier.label}</h2>
                <span className="text-sm font-semibold text-[var(--accent-strong)]">
                  {tier.price}
                </span>
              </div>
              <p className="text-sm text-[#6B7567] mb-4">
                <AccessText>{tier.tagline}</AccessText>
              </p>
              <ul className="text-xs uppercase tracking-wide text-[#8B9B83] space-y-1 mb-6 flex-1">
                {tier.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              {/* The free tier isn't purchasable — /checkout/membership?plan=free
                  dead-ends on "That plan isn't available for purchase." Show a
                  non-CTA note instead of a Choose button so there's no dead end. */}
              {tier.priceCents > 0 ? (
                trialEnabled ? (
                  <div className="space-y-2">
                    <Link
                      href={`/checkout/membership?plan=${tier.slug}&trial=1`}
                      className="block text-center w-full py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] text-white font-bold shadow-md hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                    >
                      Start 7-day free trial
                    </Link>
                    <p className="text-center text-xs text-[#6B7567]">
                      $0 today — then {tier.price.replace(' / mo', '/mo')} after 7
                      days. Cancel anytime.
                    </p>
                    <Link
                      href={`/checkout/membership?plan=${tier.slug}`}
                      className="block text-center w-full text-xs font-semibold text-[#6B7567] underline hover:text-[#2D352C]"
                    >
                      or subscribe now — {tier.price.replace(' / mo', '/mo')}
                    </Link>
                  </div>
                ) : (
                  <Link
                    href={`/checkout/membership?plan=${tier.slug}`}
                    className="block text-center w-full py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] text-white font-bold shadow-md hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                  >
                    Choose {tier.label}
                  </Link>
                )
              ) : (
                <p className="text-center w-full py-3 min-h-[44px] flex items-center justify-center text-xs font-semibold text-[#8B9B83]">
                  Included with every account
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/community"
            className="text-sm text-[#6B7567] underline hover:text-[#2D352C]"
          >
            Back to community
          </Link>
        </div>
      </div>
    </main>
  )
}
