'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import BottomNav from '@/components/BottomNav'
import BrandLogo from '@/components/BrandLogo'
import { useAuth } from '@/lib/auth-context'

interface ConversionSummary {
  id: string
  amount: number | null
  commission: number | null
  status: string | null
  createdAt: string | null
}

interface AffiliateData {
  configured: boolean
  referralLink?: string
  referrals?: number
  conversions?: ConversionSummary[]
  earnings?: number
}

interface AffiliateResponse {
  success: boolean
  error?: string
  data?: AffiliateData
}

const currency = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AffiliatePage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AffiliateData | null>(null)
  const [copied, setCopied] = useState(false)

  // Redirect unauthenticated users.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/affiliate', { signal })
      const json = (await res.json().catch(() => null)) as AffiliateResponse | null
      if (!res.ok || !json?.success || !json.data) {
        setError(json?.error ?? 'Could not load your affiliate data. Please try again.')
        setData(null)
        return
      }
      setData(json.data)
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return
      console.error('affiliate load failed', err)
      setError('Could not load your affiliate data. Please try again.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [isAuthenticated, load])

  const handleCopy = async () => {
    const link = data?.referralLink
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy the link. Please copy it manually.')
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading</span>
          <div
            aria-hidden="true"
            className="w-8 h-8 border-4 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin"
          />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] shadow-xl">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/profile"
              aria-label="Back to profile"
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#EEF1ED] hover:bg-[#E2E7E0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
            >
              <svg
                aria-hidden="true"
                className="w-5 h-5 text-[#6B7567]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <BrandLogo size={40} />
              <div>
                <h1 className="text-lg font-bold text-[#2D352C]">Refer &amp; Earn</h1>
                <p className="text-xs text-[var(--accent)]">Share your link, earn rewards</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="px-4 py-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => void load()}
              className="ml-3 shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-red-600 border border-red-200 hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <>
            <div className="h-28 rounded-2xl bg-[#EEF1ED] animate-pulse" />
            <div className="h-24 rounded-2xl bg-[#EEF1ED] animate-pulse" />
            <div className="h-40 rounded-2xl bg-[#EEF1ED] animate-pulse" />
          </>
        ) : data && data.configured === false ? (
          // Friendly "coming soon" state when the affiliate program is not yet
          // configured on the server.
          <section className="bg-white rounded-2xl border border-[#E5EAE3] p-6 shadow-xl text-center">
            <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-[#EEF1ED] flex items-center justify-center text-3xl">
              &#x1F381;
            </div>
            <h2 className="text-lg font-bold text-[#2D352C]">Affiliate program is coming online soon</h2>
            <p className="mt-2 text-sm text-[#6B7567]">
              We&apos;re putting the finishing touches on our refer &amp; earn program. Check back shortly to get
              your personal link and start earning.
            </p>
          </section>
        ) : data && data.configured ? (
          <>
            {/* Referral link */}
            <section className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] rounded-2xl p-4 shadow-xl">
              <p className="text-sm font-bold text-white">Your referral link</p>
              <p className="mt-1 text-xs text-white/80">
                Share this link — when a friend joins through it, you earn.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={data.referralLink ?? ''}
                  aria-label="Your referral link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 rounded-xl border border-white/30 bg-white/95 px-3 py-2 text-sm text-[#2D352C] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!data.referralLink}
                  className="min-h-[42px] shrink-0 rounded-xl bg-white px-4 text-sm font-bold text-[var(--accent-strong)] disabled:opacity-50 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--accent)]"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </section>

            {/* Stats */}
            <section className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl text-center">
                <p className="text-2xl font-bold text-[#2D352C]">{data.referrals ?? 0}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7567]">Referrals</p>
              </div>
              <div className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl text-center">
                <p className="text-2xl font-bold text-[var(--accent-strong)]">{currency(data.earnings ?? 0)}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7567]">Earned</p>
              </div>
            </section>

            {/* Recent referrals */}
            <section className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
              <h2 className="text-lg font-bold text-[#2D352C]">Recent referrals</h2>
              <p className="text-xs text-[#6B7567]">People who signed up through your link</p>

              {(data.conversions?.length ?? 0) > 0 ? (
                <ul className="mt-3 divide-y divide-[#EEF1ED]">
                  {data.conversions!.slice(0, 10).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#2D352C]">
                          {formatDate(c.createdAt) || 'New referral'}
                        </p>
                        {c.status && (
                          <p className="text-xs capitalize text-[#8B9B83]">{c.status}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-sm font-bold text-[var(--accent-strong)]">
                        {currency(c.commission ?? 0)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 rounded-xl bg-[#FAF9F6] p-4 text-center">
                  <p className="text-sm font-semibold text-[#2D352C]">No referrals yet</p>
                  <p className="mt-1 text-xs text-[#6B7567]">
                    Share your link above to start earning rewards.
                  </p>
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>

      <BottomNav />
    </div>
  )
}
