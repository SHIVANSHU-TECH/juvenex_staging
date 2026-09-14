'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ApiEnvelope } from '@/lib/api-types'
import type {
  AdminAffiliate,
  AdminAffiliatesData,
} from '@/app/api/admin/affiliates/route'

type AffiliatesResponse = ApiEnvelope<AdminAffiliatesData>

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="h-8 w-8 shrink-0 rounded-full bg-[#E6EFE2] text-[var(--accent-strong)] flex items-center justify-center text-xs font-semibold">
      {initialsOf(name)}
    </div>
  )
}

function NotConnectedNotice() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white border border-[#E5EAE3] px-6 py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-[#E6EFE2] text-[var(--accent-strong)] flex items-center justify-center">
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M13.828 10.172a4 4 0 0 0-5.656 0l-3 3a4 4 0 1 0 5.656 5.656l1.5-1.5" />
          <path d="M10.172 13.828a4 4 0 0 0 5.656 0l3-3a4 4 0 1 0-5.656-5.656l-1.5 1.5" />
        </svg>
      </div>
      <p className="text-sm font-medium text-[#2D352C]">
        Affiliate program isn&apos;t connected yet
      </p>
      <p className="text-sm text-[#6B7568] max-w-md">
        Add{' '}
        <code className="px-1.5 py-0.5 rounded bg-[#F5F8F3] border border-[#E5EAE3] font-mono text-xs text-[var(--accent-strong)]">
          TAPFILIATE_API_KEY
        </code>{' '}
        to the server environment to enable affiliate tracking and start
        showing referral performance here.
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white border border-[#E5EAE3] px-6 py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-[#E6EFE2] text-[var(--accent-strong)] flex items-center justify-center">
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
        </svg>
      </div>
      <p className="text-sm text-[#2D352C]">No affiliates yet.</p>
      <p className="text-sm text-[#6B7568] max-w-md">
        Affiliates appear here once members start sharing their referral links.
      </p>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div
      className="rounded-2xl bg-white border border-[#E5EAE3] shadow-sm overflow-hidden"
      aria-busy="true"
      aria-label="Loading affiliates"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-16 border-b border-[#E5EAE3] last:border-b-0 bg-[#E5EAE3]/30 animate-pulse"
        />
      ))}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#E5EAE3] rounded-2xl shadow-sm px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7568]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-[#2D352C] tabular-nums">
        {value}
      </p>
    </div>
  )
}

function AffiliateRow({ affiliate }: { affiliate: AdminAffiliate }) {
  return (
    <tr className="border-b border-[#E5EAE3] last:border-b-0 hover:bg-[#F5F8F3]/60">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={affiliate.name} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#2D352C] truncate">
              {affiliate.name}
            </p>
            {affiliate.email && (
              <p className="text-xs text-[#6B7568] truncate">
                {affiliate.email}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {affiliate.referralLink ? (
          <a
            href={affiliate.referralLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-[var(--accent-strong)] hover:underline break-all"
          >
            {affiliate.referralLink}
          </a>
        ) : (
          <span className="text-xs text-[#8B9B83]">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right text-sm text-[#2D352C] tabular-nums">
        {affiliate.referrals}
      </td>
      <td className="px-4 py-3 text-right text-sm text-[#2D352C] tabular-nums">
        {affiliate.conversions}
      </td>
      <td className="px-4 py-3 text-right text-sm font-medium text-[#2D352C] tabular-nums">
        {formatMoney(affiliate.earnings)}
      </td>
    </tr>
  )
}

export default function AffiliatesTab() {
  const [data, setData] = useState<AdminAffiliatesData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/affiliates')
      const json = (await res.json()) as AffiliatesResponse
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'Failed to load affiliates')
        setData(null)
        return
      }
      setData(json.data)
    } catch (err) {
      console.error('AffiliatesTab load failed', err)
      setError('Network error')
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totalEarnings =
    data?.affiliates.reduce((sum, a) => sum + a.earnings, 0) ?? 0

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 pb-20">
      <header className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-[#2D352C]">Affiliates</h1>
          <p className="text-sm text-[#6B7567] mt-1">
            Referral partners, links, and conversion earnings via Tapfiliate.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={isLoading}
          aria-label="Refresh affiliates"
          title="Refresh"
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white border border-[#E5EAE3] text-[#2D352C] hover:bg-[#F5F8F3] disabled:opacity-50"
        >
          <svg
            className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 10a7 7 0 0 1 12-5l2 2" />
            <path d="M17 4v4h-4" />
            <path d="M17 10a7 7 0 0 1-12 5l-2-2" />
            <path d="M3 16v-4h4" />
          </svg>
        </button>
      </header>

      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <div
          className="p-6 bg-white border border-[#E5EAE3] rounded-2xl text-sm text-red-600"
          role="alert"
        >
          {error}
        </div>
      ) : data && !data.configured ? (
        <NotConnectedNotice />
      ) : data && data.affiliates.length === 0 ? (
        <EmptyState />
      ) : data ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Affiliates" value={String(data.affiliates.length)} />
            <StatCard label="Conversions" value={String(data.conversions)} />
            <StatCard label="Total earnings" value={formatMoney(totalEarnings)} />
          </div>

          <div className="bg-white border border-[#E5EAE3] rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#F5F8F3] text-left">
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6B7568]">
                      Affiliate
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6B7568]">
                      Referral link
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B7568]">
                      Referrals
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B7568]">
                      Conversions
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B7568]">
                      Earnings
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.affiliates.map((a) => (
                    <AffiliateRow key={a.id} affiliate={a} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
