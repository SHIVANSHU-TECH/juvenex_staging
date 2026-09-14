'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import BrandLogo from '@/components/BrandLogo'
import AccessText from '@/components/AccessText'
import { useAuth } from '@/lib/auth-context'
import { isNativeApp, nativeIap, purchaseNative, restoreNative } from '@/lib/native-iap'
import {
  MARKETPLACE_GROUPS,
  MARKETPLACE_PEPTIDES,
  tierForPlan,
} from '@/lib/marketplace-access'

// Peptide display-name lookup for the selection chips.
const PEPTIDE_NAME_BY_SLUG: Readonly<Record<string, string>> = Object.fromEntries(
  MARKETPLACE_PEPTIDES.map((p) => [p.slug, p.name])
)

interface CouponPreview {
  valid: boolean
  label?: string
  discountCents?: number
  finalCents?: number
  comped?: boolean
  error?: string
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`
}

/** The affiliate referral code captured into a first-party cookie by
 *  TapfiliateScript (from `?ref=`), so a paid membership is attributed. */
function readRefCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(/(?:^|;\s*)juvenex_ref=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : undefined
}

export default function MembershipCheckoutPage() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <MembershipCheckoutContent />
    </Suspense>
  )
}

function CenteredSpinner() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
      <div
        role="status"
        aria-label="Loading"
        className="w-8 h-8 border-4 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin"
      />
    </div>
  )
}

function MembershipCheckoutContent() {
  const params = useSearchParams()
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()

  const planParam = params.get('plan') ?? ''
  const tier = useMemo(() => tierForPlan(planParam), [planParam])
  const isPurchasable = tier.slug !== 'free' && tier.priceCents > 0

  // 7-day free trial: $0 today, first charge at trial end (card required).
  // Gated by the public feature flag so a stale link can't trigger it when off.
  // WEB ONLY — the native shell sells via StoreKit/IAP, whose 7-day trial is an
  // App Store Connect introductory offer (NOT yet configured). Advertising a
  // trial the IAP can't honor would charge full price and get the app rejected
  // (guideline 3.1.2), so native never enters the trial path regardless of URL.
  const trialEnabled =
    process.env.NEXT_PUBLIC_MEMBERSHIP_TRIAL_ENABLED === 'true'
  const isTrial =
    trialEnabled && params.get('trial') === '1' && !isNativeApp()

  // How many individual peptides the member may choose. null = unlimited (all
  // peptides included, no selection required).
  const maxPeptides = tier.maxSelectablePeptides
  const showsPicker = maxPeptides !== null && maxPeptides > 0

  const [selected, setSelected] = useState<string[]>([])
  const [promoCode, setPromoCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null)
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null)
  const [checkingCode, setCheckingCode] = useState(false)

  // Send unauthenticated visitors to log in, preserving checkout intent.
  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      const next = encodeURIComponent(`/checkout/membership?plan=${tier.slug}`)
      router.replace(`/login?next=${next}`)
    }
  }, [authLoading, isAuthenticated, router, tier.slug])

  const applyPromo = async () => {
    const code = promoCode.trim()
    if (!code || checkingCode) return
    setCheckingCode(true)
    setError(null)
    try {
      const token =
        typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null
      const res = await fetch('/api/payments/membership/coupon-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan: tier.slug, code }),
      })
      const data = (await res.json().catch(() => null)) as {
        success?: boolean
        data?: CouponPreview
      } | null
      if (res.ok && data?.success && data.data) {
        setCouponPreview(data.data)
      } else {
        setCouponPreview({ valid: false, error: 'Could not check that code' })
      }
    } catch {
      setCouponPreview({ valid: false, error: 'Could not check that code' })
    } finally {
      setCheckingCode(false)
    }
  }

  const togglePeptide = (slug: string) => {
    setError(null)
    if (maxPeptides === null) return
    setSelected((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug)
      if (prev.length >= maxPeptides) return prev // at limit — ignore
      return [...prev, slug]
    })
  }

  const handleRestore = async () => {
    if (restoring) return
    setRestoring(true)
    setRestoreMsg(null)
    try {
      const result = await restoreNative()
      if (result.ok && (result.entitlements?.length ?? 0) > 0) {
        setRestoreMsg('Purchases restored. Taking you to your dashboard…')
        // Give the RevenueCat webhook a moment, then land on the app.
        window.setTimeout(() => router.push('/dashboard'), 1500)
      } else if (result.ok) {
        setRestoreMsg('No previous purchases found for this Apple ID.')
      } else {
        setRestoreMsg('Could not restore purchases. Please try again.')
      }
    } catch {
      setRestoreMsg('Could not restore purchases. Please try again.')
    } finally {
      setRestoring(false)
    }
  }

  const handlePay = async () => {
    if (submitting) return
    if (showsPicker && selected.length < maxPeptides) {
      setError(
        `Please choose ${maxPeptides} peptide${
          maxPeptides === 1 ? '' : 's'
        } to continue.`
      )
      return
    }
    setSubmitting(true)
    setError(null)

    // Inside the native app shell, Apple/Google require the digital membership
    // to be sold through in-app purchase (StoreKit) rather than the web
    // checkout. Persist the chosen peptides first (so activation from the
    // RevenueCat webhook has them), then run the native purchase. The webhook
    // flips the subscription to active server-side; we just route to success.
    if (nativeIap()) {
      try {
        const token =
          typeof window !== 'undefined'
            ? window.localStorage.getItem('auth_token')
            : null
        // Persist the chosen peptides BEFORE charging. If this fails, do NOT
        // proceed — otherwise the member pays via StoreKit and the webhook
        // activates them with a stale/empty peptide selection (a plan that
        // unlocks nothing), with no UI to fix it.
        const selectRes = await fetch('/api/payments/membership/select', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ plan: tier.slug, selectedProtocols: selected }),
        }).catch(() => null)
        if (!selectRes || !selectRes.ok) {
          setError('Could not start your purchase. Please try again.')
          setSubmitting(false)
          return
        }

        const result = await purchaseNative(tier.slug, user?.id)
        if (result.ok) {
          router.push('/checkout/success?kind=membership&via=iap')
          return
        }
        if (result.error === 'cancelled') {
          setSubmitting(false)
          return
        }
        setError(
          result.error === 'store_unavailable'
            ? 'The App Store is unavailable right now. Please try again.'
            : 'Could not complete the purchase. Please try again.'
        )
        setSubmitting(false)
        return
      } catch {
        setError('Could not complete the purchase. Please try again.')
        setSubmitting(false)
        return
      }
    }

    try {
      const token =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('auth_token')
          : null
      const res = await fetch('/api/payments/membership/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          plan: tier.slug,
          selectedProtocols: selected,
          // A trial can't combine with a promo (server ignores trial when a
          // promo is present); don't send the promo on a trial checkout.
          promoCode: isTrial ? undefined : promoCode.trim() || undefined,
          ref: readRefCookie(),
          trial: isTrial || undefined,
        }),
      })
      const data = (await res.json().catch(() => null)) as {
        success?: boolean
        error?: string
        data?: { sessionUrl?: string }
      } | null

      if (res.status === 503) {
        setError(
          'Checkout is temporarily unavailable while we finalize our payment processor. Your selection is saved — please try again soon.'
        )
        setSubmitting(false)
        return
      }
      if (!res.ok || !data?.success || !data.data?.sessionUrl) {
        setError(data?.error ?? 'Could not start checkout. Please try again.')
        setSubmitting(false)
        return
      }
      // Hand off to the provider's hosted payment page. Deliberately keep
      // `submitting` true here — the overlay must stay up while the browser
      // navigates to the hosted page (which itself takes a few seconds), or
      // the button re-enables mid-redirect and invites a double charge.
      window.location.href = data.data.sessionUrl
      return
    } catch {
      setError('Could not start checkout. Please try again.')
    }
    setSubmitting(false)
  }

  if (authLoading || !isAuthenticated) {
    return <CenteredSpinner />
  }

  if (!isPurchasable) {
    return (
      <main className="min-h-screen bg-[#FAF9F6] text-[#2D352C] px-4 py-12">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold">Choose a membership</h1>
          <p className="mt-3 text-sm text-[#6B7567]">
            That plan isn&apos;t available for purchase. Pick a membership tier to
            continue.
          </p>
          <Link
            href="/upgrade"
            className="mt-6 inline-flex px-6 py-3 rounded-xl bg-[var(--accent-strong)] text-white font-bold"
          >
            View memberships
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#FAF9F6] text-[#2D352C]">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link
            href="/upgrade"
            aria-label="Back to memberships"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#EEF1ED] hover:bg-[#E2E7E0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
          >
            <svg aria-hidden="true" className="w-5 h-5 text-[#6B7567]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-3">
            <BrandLogo size={32} className="rounded-lg shadow object-contain bg-white p-0.5" />
            <h1 className="text-lg font-bold">Membership checkout</h1>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <section className="rounded-2xl border border-[#E5EAE3] bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold">{tier.label}</h2>
            <span className="text-lg font-bold text-[var(--accent-strong)]">
              {tier.price}
            </span>
          </div>
          <p className="mt-2 text-sm text-[#6B7567]"><AccessText>{tier.tagline}</AccessText></p>
          <ul className="mt-4 space-y-1.5">
            {tier.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2 text-sm">
                <span aria-hidden="true" className="text-[var(--accent-strong)]">✓</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </section>

        {showsPicker && (
          <section className="rounded-2xl border border-[#E5EAE3] bg-white p-5 shadow-sm">
            <h3 className="font-bold">
              Choose your peptide{maxPeptides === 1 ? '' : 's'}
            </h3>
            <p className="mt-1 text-sm text-[#6B7567]">
              Pick {maxPeptides} peptide{maxPeptides === 1 ? '' : 's'} from
              any protocol group ({selected.length}/{maxPeptides} chosen).
            </p>
            <div className="mt-4 space-y-5">
              {MARKETPLACE_GROUPS.map((group) => (
                <div key={group.slug}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#8B9B83]">
                    {group.label}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {group.peptides.map((slug) => {
                      const checked = selected.includes(slug)
                      const atLimit = !checked && selected.length >= maxPeptides
                      return (
                        <button
                          key={slug}
                          type="button"
                          aria-pressed={checked}
                          disabled={atLimit}
                          onClick={() => togglePeptide(slug)}
                          className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 ${
                            checked
                              ? 'border-[var(--accent-strong)] bg-[#EAF0E5]'
                              : 'border-[#E5EAE3] bg-white'
                          } ${atLimit ? 'opacity-50 cursor-not-allowed' : 'hover:border-[var(--accent)]'}`}
                        >
                          <span className="font-medium">
                            {PEPTIDE_NAME_BY_SLUG[slug] ?? slug}
                          </span>
                          <span aria-hidden="true">{checked ? '✓' : '+'}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Promo codes are hidden inside the native app: Apple disallows
            out-of-band discounts on IAP, and the StoreKit purchase can't honor
            a coupon anyway — showing "Activate free membership" while charging
            full price would be a 3.1.1 / misleading-pricing rejection. Comp
            codes stay on the web. */}
        {!isNativeApp() && !isTrial && (
        <section className="rounded-2xl border border-[#E5EAE3] bg-white p-5 shadow-sm">
          <label htmlFor="promo-code" className="block text-sm font-bold">
            Promo code
          </label>
          <p className="mt-1 text-xs text-[#6B7567]">
            Have a code? Enter it to apply member pricing.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              id="promo-code"
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value)
                setError(null)
                setCouponPreview(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void applyPromo()
                }
              }}
              placeholder="Enter promo code"
              className="flex-1 rounded-xl border border-[#E5EAE3] px-3 py-2 text-sm uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            />
            <button
              type="button"
              onClick={() => void applyPromo()}
              disabled={!promoCode.trim() || checkingCode}
              className="rounded-xl px-4 py-2 text-sm font-semibold bg-[#EEF1ED] text-[#2D352C] hover:bg-[#E2E7E0] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkingCode ? 'Checking…' : 'Apply'}
            </button>
          </div>

          {couponPreview?.valid && (
            <p className="mt-3 rounded-xl bg-[#EAF0E5] px-4 py-3 text-sm text-[#2D352C]">
              <span className="font-semibold">{couponPreview.label}</span> applied.{' '}
              {couponPreview.comped ? (
                <>Your membership is <span className="font-semibold">free</span> for this period.</>
              ) : (
                <>
                  You&apos;ll pay{' '}
                  <span className="font-semibold">
                    {formatCents(couponPreview.finalCents ?? tier.priceCents)}
                  </span>{' '}
                  <span className="text-[#6B7567] line-through">{tier.price.replace(' / mo', '')}</span>
                </>
              )}
            </p>
          )}
          {couponPreview && !couponPreview.valid && (
            <p className="mt-3 rounded-xl bg-[#FCEBEA] px-4 py-3 text-sm text-[#9B2C2C]">
              {couponPreview.error ?? 'That code isn’t valid.'}
            </p>
          )}
        </section>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-[#FCEBEA] px-4 py-3 text-sm text-[#9B2C2C]">
            {error}
          </p>
        )}

        {submitting && (
          <div
            role="status"
            aria-live="polite"
            className="fixed inset-0 z-[1100] flex flex-col items-center justify-center gap-4 bg-white/90 px-8 text-center backdrop-blur-sm"
          >
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--accent-strong)] border-t-transparent" />
            <p className="text-base font-semibold text-[#2D352C]">
              Connecting you to our secure payment page…
            </p>
            <p className="max-w-xs text-sm leading-5 text-[#6B7567]">
              This usually takes about 10 seconds. Please don&apos;t close or
              refresh this page.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={handlePay}
          disabled={submitting}
          className="block w-full min-h-12 py-3 rounded-xl bg-[var(--accent-strong)] text-white font-bold text-base hover:bg-[var(--accent-strong)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
        >
          {submitting
            ? 'Starting checkout…'
            : isTrial
              ? 'Start 7-day free trial'
              : couponPreview?.valid && couponPreview.comped
                ? 'Activate free membership'
                : couponPreview?.valid
                  ? `Continue to payment — ${formatCents(couponPreview.finalCents ?? tier.priceCents)}`
                  : promoCode.trim()
                    ? 'Apply promo code & continue'
                    : `Continue to payment — ${tier.price.replace(' / mo', '/mo')}`}
        </button>

        {isTrial && !isNativeApp() && (
          <p className="text-center text-xs leading-5 text-[#6B7567]">
            <span className="font-semibold text-[#2D352C]">$0 due today.</span>{' '}
            Your card is saved and your {tier.label} membership stays free for 7
            days. After the trial we charge{' '}
            {tier.price.replace(' / mo', '/month')} and it renews monthly until
            you cancel — cancel anytime before day 7 to avoid any charge.
          </p>
        )}

        {/* App Store requires the subscription title, length, and price to be
            clearly shown on the purchase screen, plus a visible restore path,
            auto-renew disclosure, and functional Terms of Use (EULA) + Privacy
            links (guideline 3.1.2). Native only. */}
        {isNativeApp() && (
          <>
            <div className="rounded-xl bg-[#F4F6F2] px-4 py-3 text-center">
              <p className="text-sm font-semibold text-[#2D352C]">
                {tier.label} membership — {tier.price.replace(' / mo', '/month')}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#6B7567]">
                Auto-renewable subscription, billed monthly. Payment is charged
                to your Apple Account at confirmation of purchase and renews each
                month unless auto-renew is turned off at least 24 hours before
                the current period ends. Manage or cancel anytime in your App
                Store account settings.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRestore}
              disabled={restoring}
              className="block w-full min-h-11 py-2 text-sm font-semibold text-[var(--accent-strong)] underline disabled:opacity-50"
            >
              {restoring ? 'Restoring…' : 'Restore purchases'}
            </button>
          </>
        )}
        {restoreMsg && (
          <p role="status" className="text-center text-xs text-[#6B7567]">
            {restoreMsg}
          </p>
        )}

        <p className="text-center text-xs leading-5 text-[#6B7567]">
          Membership fees are for platform access only. Juvenex does not sell
          consultations, peptides, prescriptions, medications, protocols, or
          medical services. By continuing you agree to the{' '}
          {/* Guideline 3.1.2(c): the in-app subscription screen must link to the
              EULA the subscription is ACTUALLY sold under. Native purchases go
              through Apple IAP with no custom EULA set in App Store Connect, so
              that is Apple's STANDARD EULA — linking to our own /legal/terms
              there is what got the app rejected. Web (Kurv) keeps our own
              Membership Agreement. Plain <a> (not next/link) so the native shell
              hands the external URL to Safari; no target=_blank (dead tap in a
              WebView). */}
          {isNativeApp() ? (
            <a
              href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
              className="font-semibold text-[var(--accent-strong)] underline"
            >
              Terms of Use (EULA)
            </a>
          ) : (
            <Link href="/legal/terms" className="font-semibold text-[var(--accent-strong)] underline">
              Terms of Use (EULA)
            </Link>
          )}{' '}
          and{' '}
          <Link href="/legal/privacy" className="font-semibold text-[var(--accent-strong)] underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
