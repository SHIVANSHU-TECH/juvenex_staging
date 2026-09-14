'use client'

import { useState } from 'react'
import Link from 'next/link'

import { isNativeApp } from '@/lib/native-iap'

import {
  MARKETPLACE_GROUPS,
  peptidesForPlan,
  tierForPlan,
} from '@/lib/marketplace-access'
import { peptideName } from '@/lib/shop-quiz'

export interface ProfileSubscription {
  id: string
  plan?: string
  status?: string
  current_period_end?: string
  /** Peptide slugs the member chose at checkout (subscriptions.selected_protocols). */
  selected_protocols?: string[] | null
}

interface ProfilePurchasesTabProps {
  dataLoading: boolean
  subscription: ProfileSubscription | null
  subscriptionActive: boolean
}

/**
 * The member's included peptides, with self-service editing up to the tier cap.
 * The membership tier (price/count) is unchanged — only WHICH peptides are
 * unlocked. Unlimited plans have nothing to pick, so editing is hidden there.
 */
function IncludedPeptides({
  plan,
  initialSelected,
}: {
  plan?: string
  initialSelected?: string[] | null
}) {
  const tier = tierForPlan(plan)
  const cap = tier.maxSelectablePeptides
  const unlimited = cap === null

  const [selected, setSelected] = useState<string[]>(() =>
    [...peptidesForPlan(plan, initialSelected)]
  )
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (unlimited) {
    return (
      <div className="mt-3 pt-3 border-t border-[#EEF1ED]">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8B9B83]">
          Included in your plan
        </p>
        <p className="mt-1.5 text-sm text-[#2D352C]">
          All peptides included — every product in the marketplace is unlocked.
        </p>
      </div>
    )
  }

  const startEdit = () => {
    setDraft([...selected])
    setMsg(null)
    setEditing(true)
  }

  const toggle = (slug: string) => {
    setDraft((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug)
      if (cap !== null && prev.length >= cap) return prev // at cap — ignore
      return [...prev, slug]
    })
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/patient/membership/protocols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedProtocols: draft }),
      })
      const data = (await res.json().catch(() => null)) as {
        success?: boolean
        error?: string
        data?: { selectedProtocols?: string[] }
      } | null
      if (!res.ok || !data?.success) {
        setMsg(data?.error ?? 'Could not update your peptides. Please try again.')
        return
      }
      setSelected(data.data?.selectedProtocols ?? draft)
      setEditing(false)
      setMsg('Your included peptides were updated.')
    } catch {
      setMsg('Could not update your peptides. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-[#EEF1ED]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8B9B83]">
          Included in your plan
        </p>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="text-xs font-semibold text-[var(--accent-strong)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 rounded"
          >
            Change
          </button>
        )}
      </div>

      {!editing ? (
        <>
          {selected.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2" role="list">
              {selected.map((slug) => (
                <li
                  key={slug}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {peptideName(slug)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-[#6B7567]">
              You haven&apos;t chosen your peptide{cap === 1 ? '' : 's'} yet — tap
              Change to pick.
            </p>
          )}
          {msg && (
            <p role="status" className="mt-2 text-xs text-emerald-700">
              {msg}
            </p>
          )}
        </>
      ) : (
        <div className="mt-2">
          <p className="text-xs text-[#6B7567]">
            Choose any {cap} peptide{cap === 1 ? '' : 's'} across the groups below.
            <span className="ml-1 font-semibold text-[#2D352C]">
              {draft.length}/{cap} selected
            </span>
          </p>
          <div className="mt-2 space-y-3">
            {MARKETPLACE_GROUPS.map((group) => (
              <div key={group.slug}>
                <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#8B9B83]">
                  {group.label}
                </p>
                <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {group.peptides.map((slug) => {
                    const checked = draft.includes(slug)
                    const atCap = cap !== null && draft.length >= cap && !checked
                    return (
                      <label
                        key={slug}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                          checked
                            ? 'border-[var(--accent-strong)] bg-emerald-50'
                            : atCap
                              ? 'border-[#E5EAE3] bg-[#FAF9F6] opacity-50'
                              : 'border-[#E5EAE3] bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={atCap || saving}
                          onChange={() => toggle(slug)}
                          className="h-4 w-4 accent-[var(--accent-strong)]"
                        />
                        <span className="text-[#2D352C]">{peptideName(slug)}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {msg && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {msg}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="min-h-11 flex-1 rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            >
              {saving ? 'Saving…' : 'Save peptides'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setMsg(null) }}
              disabled={saving}
              className="min-h-11 rounded-xl border border-[#E5EAE3] bg-white px-4 py-2 text-sm font-semibold text-[#2D352C] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProfilePurchasesTab({
  dataLoading,
  subscription,
  subscriptionActive,
}: ProfilePurchasesTabProps) {
  const [cancelling, setCancelling] = useState(false)
  const [cancelMsg, setCancelMsg] = useState<string | null>(null)

  const handleCancelMembership = async () => {
    if (cancelling) return
    const confirmed = window.confirm(
      'Cancel your membership? Future monthly charges will stop. You keep access until the end of the period you already paid for.'
    )
    if (!confirmed) return
    setCancelling(true)
    setCancelMsg(null)
    try {
      // Auth token is attached automatically by the global fetch patch.
      const res = await fetch('/api/payments/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = (await res.json().catch(() => null)) as {
        success?: boolean
        data?: { status?: string; access_until?: string | null }
      } | null
      if (!res.ok || !data?.success) {
        setCancelMsg('Could not cancel right now. Please try again or contact support.')
        return
      }
      const until = data.data?.access_until
      setCancelMsg(
        until
          ? `Membership cancelled. Access continues until ${new Date(until).toLocaleDateString()}.`
          : 'Membership cancelled.'
      )
      // Refresh so the subscription card reflects the new state.
      window.setTimeout(() => window.location.reload(), 1500)
    } catch {
      setCancelMsg('Could not cancel right now. Please try again or contact support.')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="space-y-3">
      {dataLoading ? (
        <>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#EEF1ED]" />
                  <div className="space-y-1">
                    <div className="h-4 bg-[#EEF1ED] rounded w-32" />
                    <div className="h-3 bg-[#EEF1ED] rounded w-20" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          {subscription ? (
            <div className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#EEF1ED] flex items-center justify-center text-xl">
                    &#x1F4B3;
                  </div>
                  <div>
                    <p className="font-medium text-[#2D352C]">
                      {tierForPlan(subscription.plan).label} membership
                      <span className="text-xs text-[#8B9B83] font-normal">
                        {' '}
                        · {tierForPlan(subscription.plan).price}
                      </span>
                    </p>
                    <p className="text-xs text-[#8B9B83]">
                      {subscriptionActive ? 'Active' : subscription.status ?? 'Inactive'}
                      {subscription.current_period_end &&
                        ` - Renews ${new Date(subscription.current_period_end).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`text-xs font-bold ${subscriptionActive ? 'text-green-600' : 'text-red-500'}`}
                  >
                    {subscriptionActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              {/* What this plan actually unlocks — the member's chosen peptides.
                  Resolved through the same authoritative helper the shop's
                  server-side gate uses, so this list always matches real
                  access (legacy group selections expand, Unlimited → all). */}
              {subscriptionActive && (
                <IncludedPeptides
                  plan={subscription.plan}
                  initialSelected={subscription.selected_protocols}
                />
              )}
              {subscriptionActive && (
                <div className="mt-3 pt-3 border-t border-[#EEF1ED]">
                  {isNativeApp() ? (
                    // In the app, membership is an Apple auto-renewable
                    // subscription — it can ONLY be cancelled in App Store
                    // settings. Calling our web cancel endpoint here can't stop
                    // Apple billing yet would say "cancelled" (misleading). The
                    // native shell opens this external URL in the App Store app.
                    <a
                      href="https://apps.apple.com/account/subscriptions"
                      className="text-sm font-medium text-[var(--accent-strong)] underline underline-offset-4"
                    >
                      Manage or cancel subscription
                    </a>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleCancelMembership}
                        disabled={cancelling}
                        className="text-sm font-medium text-red-600 underline underline-offset-4 hover:text-red-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 rounded"
                      >
                        {cancelling ? 'Cancelling…' : 'Cancel membership'}
                      </button>
                      {cancelMsg && (
                        <p role="status" className="mt-2 text-xs text-[#6B7567]">
                          {cancelMsg}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#E5EAE3] p-8 shadow-xl text-center">
              <p className="text-3xl mb-2">&#x1F6D2;</p>
              <p className="text-[#6B7567] font-medium">No purchases yet</p>
              <p className="text-xs text-[#8B9B83] mt-1">Visit the shop to get started</p>
            </div>
          )}
        </>
      )}
      <Link
        href="/store"
        className="block text-center py-3 bg-white rounded-2xl border border-[#E5EAE3] shadow-xl text-[var(--accent)] font-bold"
      >
        Browse Shop &rarr;
      </Link>
    </div>
  )
}
