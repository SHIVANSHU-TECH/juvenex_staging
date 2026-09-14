'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { formatMoney, formatRelative } from '@/lib/format'
import StatusPill from './StatusPill'
import { STATUS_PALETTE, type StatusVariant } from '@/lib/admin-theme'

// ---------------------------------------------------------------------------
// Types — mirror /api/admin/overview/route.ts AdminOverviewData.
// ---------------------------------------------------------------------------

interface OverviewOrder {
  id: string
  customer_name: string | null
  customer_email: string | null
  total_cents: number
  currency: string
  status: string
  created_at: string
}

interface OverviewReport {
  id: string
  reason: string
  status: string
  created_at: string
  reporter_name: string | null
  reporter_email: string | null
}

interface OverviewData {
  orgs: { total: number; new_this_week: number }
  patients: { total: number; new_this_week: number }
  reports: { pending: number }
  messages: { unread_total: number }
  recent_orders: OverviewOrder[]
  recent_reports: OverviewReport[]
}

interface OverviewResponse {
  success: boolean
  data?: OverviewData
  error?: string
}

// ---------------------------------------------------------------------------
// Inline icons (no new deps).
// ---------------------------------------------------------------------------

function Icon({ d }: { d: string }) {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

const ICON_BUILDING =
  'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16M9 7h2m-2 4h2m4-4h2m-2 4h2m-7 9v-4h6v4'
const ICON_USERS =
  'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z'
const ICON_FLAG =
  'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2zm9-13.5V9'
const ICON_CHAT =
  'M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.87 9.87 0 01-4-.8L3 20l1.3-3.9A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'

// ---------------------------------------------------------------------------
// KPI card primitive.
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string
  value: number | string
  iconPath: string
  /** Sub-label rendered under the headline number. */
  sub?: ReactNode
  /** Color of the corner status dot, if any. */
  dotClass?: string
  loading?: boolean
  onClick?: () => void
}

function KpiCard({ label, value, iconPath, sub, dotClass, loading, onClick }: KpiCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#F5F8F3] text-[var(--accent-strong)] grid place-items-center">
            <Icon d={iconPath} />
          </span>
          <span className="text-xs font-medium text-[#6B7567] uppercase tracking-wide">
            {label}
          </span>
        </div>
        {dotClass && (
          <span
            aria-hidden="true"
            className={`w-2 h-2 rounded-full ${dotClass}`}
          />
        )}
      </div>
      <p className="mt-3 text-3xl font-bold text-[#2D352C] tabular-nums">
        {loading ? <span className="inline-block w-12 h-7 bg-[#F5F8F3] rounded animate-pulse" /> : value}
      </p>
      {sub && !loading && (
        <p className="mt-1 text-xs text-[#6B7567]">{sub}</p>
      )}
    </>
  )

  const className =
    'bg-white rounded-2xl border border-[#E5EAE3] p-5 shadow-sm hover:shadow-md transition-shadow'

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2`}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={className}>
      {content}
    </div>
  )
}

function TrendUp({ count }: { count: number }) {
  if (count <= 0) {
    return <span className="text-[#8B9B83]">No change this week</span>
  }
  return (
    <span className="inline-flex items-center gap-1 text-[var(--accent-strong)]">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 3l5 6h-3v8H8V9H5l5-6z" />
      </svg>
      +{count} this week
    </span>
  )
}

// ---------------------------------------------------------------------------
// Activity cards.
// ---------------------------------------------------------------------------

function pillVariant(status: string): StatusVariant {
  return (status in STATUS_PALETTE ? status : 'pending') as StatusVariant
}

function RecentOrdersCard({
  orders,
  loading,
}: {
  orders: OverviewOrder[]
  loading: boolean
}) {
  return (
    <section className="bg-white rounded-2xl border border-[#E5EAE3] p-5 shadow-sm">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#2D352C]">Recent orders</h2>
        <span className="text-xs text-[#8B9B83]">Last 5</span>
      </header>
      {loading ? (
        <ul className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <li
              key={i}
              className="h-10 rounded-lg bg-[#F5F8F3] animate-pulse"
            />
          ))}
        </ul>
      ) : orders.length === 0 ? (
        <p className="text-sm text-[#6B7567] py-6 text-center">
          No orders yet.
        </p>
      ) : (
        <ul className="divide-y divide-[#E5EAE3]">
          {orders.map((o) => {
            const customer =
              o.customer_name?.trim() || o.customer_email || 'Unknown'
            return (
              <li
                key={o.id}
                className="py-2.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#2D352C] truncate">
                    {customer}
                  </p>
                  <p className="text-xs text-[#8B9B83]">
                    {formatRelative(o.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-[#2D352C] tabular-nums">
                    {formatMoney(o.total_cents, o.currency)}
                  </span>
                  <StatusPill variant={pillVariant(o.status)}>
                    {o.status}
                  </StatusPill>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function RecentReportsCard({
  reports,
  loading,
  onReview,
}: {
  reports: OverviewReport[]
  loading: boolean
  onReview: () => void
}) {
  return (
    <section className="bg-white rounded-2xl border border-[#E5EAE3] p-5 shadow-sm">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#2D352C]">Recent reports</h2>
        <button
          type="button"
          onClick={onReview}
          className="text-xs font-medium text-[var(--accent-strong)] hover:text-[#4F6A44]"
        >
          Review all →
        </button>
      </header>
      {loading ? (
        <ul className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <li
              key={i}
              className="h-12 rounded-lg bg-[#F5F8F3] animate-pulse"
            />
          ))}
        </ul>
      ) : reports.length === 0 ? (
        <p className="text-sm text-[#6B7567] py-6 text-center">
          Inbox is clear — no reports.
        </p>
      ) : (
        <ul className="divide-y divide-[#E5EAE3]">
          {reports.map((r) => {
            const reporter =
              r.reporter_name?.trim() || r.reporter_email || 'Unknown reporter'
            return (
              <li key={r.id} className="py-2.5 flex items-start gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#DC2626] flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#2D352C] line-clamp-2">
                    {r.reason || 'No reason provided.'}
                  </p>
                  <p className="text-xs text-[#8B9B83] mt-0.5">
                    {reporter} · {formatRelative(r.created_at)}
                  </p>
                </div>
                <StatusPill variant={pillVariant(r.status)}>
                  {r.status}
                </StatusPill>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top-level tab.
// ---------------------------------------------------------------------------

interface OverviewTabProps {
  onNavigate?: (
    tab: 'organizations' | 'users' | 'orders' | 'reports' | 'messages'
  ) => void
}

export default function OverviewTab({ onNavigate }: OverviewTabProps) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/admin/overview')
        const json = (await res.json()) as OverviewResponse
        if (cancelled) return
        if (!json.success || !json.data) {
          setError(json.error ?? 'Failed to load overview')
          setLoading(false)
          return
        }
        setData(json.data)
        setLoading(false)
      } catch (err: unknown) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Network error')
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const reportsPending = data?.reports.pending ?? 0
  const messagesUnread = data?.messages.unread_total ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#2D352C]">Overview</h1>
        <p className="text-sm text-[#6B7567] mt-1">
          A snapshot of organizations, patients, and pending work across the
          Juvenex platform.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-[#FEE2E2] border border-red-200 text-[#7F1D1D] text-sm rounded-xl px-4 py-3"
        >
          {error}
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total organizations"
          value={data?.orgs.total ?? 0}
          iconPath={ICON_BUILDING}
          loading={loading}
          sub={<TrendUp count={data?.orgs.new_this_week ?? 0} />}
          onClick={() => onNavigate?.('organizations')}
        />
        <KpiCard
          label="Active patients"
          value={data?.patients.total ?? 0}
          iconPath={ICON_USERS}
          loading={loading}
          sub={<TrendUp count={data?.patients.new_this_week ?? 0} />}
          onClick={() => onNavigate?.('users')}
        />
        <KpiCard
          label="Pending reports"
          value={reportsPending}
          iconPath={ICON_FLAG}
          loading={loading}
          dotClass={reportsPending > 0 ? 'bg-[#DC2626]' : undefined}
          sub={
            reportsPending > 0
              ? 'Awaiting moderator review'
              : 'No pending reports'
          }
          onClick={() => onNavigate?.('reports')}
        />
        <KpiCard
          label="Unread messages"
          value={messagesUnread}
          iconPath={ICON_CHAT}
          loading={loading}
          dotClass={messagesUnread > 0 ? 'bg-[var(--accent)]' : undefined}
          sub={messagesUnread > 0 ? 'New conversations' : 'Inbox at zero'}
          onClick={() => onNavigate?.('messages')}
        />
      </div>

      {/* Activity grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentOrdersCard
          orders={data?.recent_orders ?? []}
          loading={loading}
        />
        <RecentReportsCard
          reports={data?.recent_reports ?? []}
          loading={loading}
          onReview={() => onNavigate?.('reports')}
        />
      </div>
    </div>
  )
}
