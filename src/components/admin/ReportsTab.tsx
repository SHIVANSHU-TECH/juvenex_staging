'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AdminReport,
  AdminReportsData,
  ApiEnvelope,
} from '@/lib/api-types'
import { formatRelative } from '@/lib/format'
import type { StatusVariant } from '@/lib/admin-theme'
import StatusPill from './StatusPill'
import ConfirmDialog from './ConfirmDialog'

type ReportStatus = 'pending' | 'reviewed' | 'dismissed'
type ReportAction = 'dismiss' | 'hide' | 'ban'

type ReportsResponse = ApiEnvelope<AdminReportsData>
type ActionResponse = ApiEnvelope<unknown>

const STATUS_TABS: ReadonlyArray<{ value: ReportStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'dismissed', label: 'Dismissed' },
]

const REPORT_STATUS_VARIANTS: ReadonlySet<string> = new Set([
  'pending',
  'reviewed',
  'dismissed',
])

function reportStatusVariant(status: string): StatusVariant {
  return REPORT_STATUS_VARIANTS.has(status)
    ? (status as StatusVariant)
    : 'pending'
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

interface ReportCardProps {
  report: AdminReport
  isBusy: boolean
  actionError: string | null
  onAction: (reportId: string, action: ReportAction) => Promise<void>
  onBanRequest: (report: AdminReport) => void
}

function ReportCard({
  report,
  isBusy,
  actionError,
  onAction,
  onBanRequest,
}: ReportCardProps) {
  const reporterName =
    report.reporter?.name?.trim() || report.reporter?.email || 'Unknown user'
  const authorName =
    report.post?.author?.name?.trim() ||
    report.post?.author?.email ||
    'Unknown author'

  const postVisibility: StatusVariant | null = report.post
    ? report.post.is_public
      ? 'public'
      : 'hidden'
    : null

  return (
    <article className="group bg-white border border-[#E5EAE3] rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Top: reporter + status */}
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={reporterName} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#2D352C] truncate">
              {reporterName}
            </p>
            <p
              className="text-xs text-[#6B7568]"
              title={new Date(report.created_at).toLocaleString()}
            >
              reported {formatRelative(report.created_at)}
            </p>
          </div>
        </div>
        <StatusPill variant={reportStatusVariant(report.status)}>
          <span className="capitalize">{report.status}</span>
        </StatusPill>
      </header>

      {/* Reason */}
      <div className="px-5 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7568] mb-1.5">
          Reason
        </p>
        <blockquote className="border-l-2 border-[var(--accent)] pl-3 italic text-sm text-[#2D352C] whitespace-pre-wrap break-words">
          {report.reason}
        </blockquote>
      </div>

      {/* Nested post panel */}
      <div className="px-5 pt-4 pb-4 flex-1">
        {report.post ? (
          <div className="bg-[#F5F8F3] border border-[#E5EAE3] rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar name={authorName} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#2D352C] truncate">
                    {authorName}
                  </p>
                  <p
                    className="text-[11px] text-[#6B7568]"
                    title={new Date(report.post.created_at).toLocaleString()}
                  >
                    {formatRelative(report.post.created_at)}
                  </p>
                </div>
              </div>
              {postVisibility && (
                <StatusPill variant={postVisibility}>
                  <span className="capitalize">{postVisibility}</span>
                </StatusPill>
              )}
            </div>
            <p className="text-sm text-[#2D352C] whitespace-pre-wrap break-words line-clamp-3">
              {report.post.body}
            </p>
            {report.post.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={report.post.image_url}
                alt="Reported post attachment"
                className="mt-3 max-h-40 w-full rounded-lg border border-[#E5EAE3] object-cover"
                loading="lazy"
              />
            )}
          </div>
        ) : (
          <p className="text-sm italic text-[#6B7568]">
            The reported post is no longer available.
          </p>
        )}
      </div>

      {actionError && (
        <p className="px-5 pb-3 text-xs text-red-600" role="alert">
          {actionError}
        </p>
      )}

      {/* Actions */}
      {report.status === 'pending' && (
        <footer className="flex flex-wrap gap-2 px-5 pb-5 pt-1 border-t border-[#E5EAE3]/80 mt-auto">
          <button
            type="button"
            onClick={() => void onAction(report.id, 'dismiss')}
            disabled={isBusy}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#2D352C] hover:bg-[#F5F8F3] disabled:opacity-50"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => void onAction(report.id, 'hide')}
            disabled={isBusy || !report.post}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-100 disabled:opacity-50"
          >
            Hide post
          </button>
          <button
            type="button"
            onClick={() => onBanRequest(report)}
            disabled={isBusy || !report.post}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100 disabled:opacity-50"
          >
            Ban user
          </button>
        </footer>
      )}
    </article>
  )
}

function ReportsSkeleton() {
  return (
    <div
      className="grid gap-4 md:grid-cols-2"
      aria-busy="true"
      aria-label="Loading reports"
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-64 rounded-2xl bg-[#E5EAE3]/50 animate-pulse"
        />
      ))}
    </div>
  )
}

function EmptyState({ status }: { status: ReportStatus }) {
  const message =
    status === 'pending'
      ? 'No pending reports — all clear.'
      : status === 'reviewed'
        ? 'No reviewed reports yet.'
        : 'No dismissed reports.'
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white border border-[#E5EAE3] px-6 py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-[#E6EFE2] text-[var(--accent-strong)] flex items-center justify-center">
        <svg
          className="h-6 w-6"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 10 4 4 7-8" />
        </svg>
      </div>
      <p className="text-sm text-[#2D352C]">{message}</p>
    </div>
  )
}

export default function ReportsTab() {
  const [statusFilter, setStatusFilter] = useState<ReportStatus>('pending')
  const [reports, setReports] = useState<AdminReport[]>([])
  const [total, setTotal] = useState(0)
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [banTarget, setBanTarget] = useState<AdminReport | null>(null)

  const loadReports = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        limit: '25',
        page: '1',
      })
      const res = await fetch(`/api/admin/reports?${params.toString()}`)
      const json = (await res.json()) as ReportsResponse
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'Failed to load reports')
        setReports([])
        setTotal(0)
        return
      }
      setReports(json.data.reports)
      setTotal(json.data.total)
      if (statusFilter === 'pending') {
        setPendingCount(json.data.total)
      }
    } catch (err) {
      console.error('ReportsTab loadReports failed', err)
      setError('Network error')
      setReports([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  // Fetch pending count independently when the user browses a non-pending
  // tab so the badge stays honest.
  useEffect(() => {
    if (statusFilter === 'pending') return
    let cancelled = false
    const params = new URLSearchParams({
      status: 'pending',
      limit: '1',
      page: '1',
    })
    fetch(`/api/admin/reports?${params.toString()}`)
      .then((r) => r.json() as Promise<ReportsResponse>)
      .then((j) => {
        if (cancelled) return
        if (j.success && j.data) setPendingCount(j.data.total)
      })
      .catch(() => {
        /* ignore — badge just stays at previous value */
      })
    return () => {
      cancelled = true
    }
  }, [statusFilter])

  const handleAction = useCallback(
    async (reportId: string, action: ReportAction) => {
      setBusyId(reportId)
      setRowError((prev) => {
        const next = { ...prev }
        delete next[reportId]
        return next
      })

      // Optimistic: remove from current list only when we are on the
      // "pending" tab, since all 3 actions move the report out of pending.
      const snapshot = reports
      if (statusFilter === 'pending') {
        setReports((prev) => prev.filter((r) => r.id !== reportId))
        setTotal((prev) => Math.max(0, prev - 1))
        setPendingCount((prev) =>
          prev === null ? prev : Math.max(0, prev - 1)
        )
      }

      try {
        const res = await fetch(`/api/admin/reports/${reportId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const json = (await res.json()) as ActionResponse
        if (!res.ok || !json.success) {
          if (statusFilter === 'pending') {
            setReports(snapshot)
            setTotal((prev) => prev + 1)
            setPendingCount((prev) => (prev === null ? prev : prev + 1))
          }
          setRowError((prev) => ({
            ...prev,
            [reportId]: json.error ?? 'Action failed',
          }))
        }
      } catch (err) {
        console.error('ReportsTab handleAction failed', err)
        if (statusFilter === 'pending') {
          setReports(snapshot)
          setTotal((prev) => prev + 1)
          setPendingCount((prev) => (prev === null ? prev : prev + 1))
        }
        setRowError((prev) => ({ ...prev, [reportId]: 'Network error' }))
      } finally {
        setBusyId(null)
      }
    },
    [reports, statusFilter]
  )

  const banTargetName = useMemo(() => {
    if (!banTarget?.post?.author) return null
    return (
      banTarget.post.author.name?.trim() ||
      banTarget.post.author.email ||
      'this user'
    )
  }, [banTarget])

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 pb-20">
      <header className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-[#2D352C]">Reports</h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#E6EFE2] text-[var(--accent-strong)]">
            {total}
          </span>
        </div>
        <button
          type="button"
          onClick={loadReports}
          disabled={isLoading}
          aria-label="Refresh reports"
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

      {/* Status filter chips */}
      <div
        role="tablist"
        aria-label="Report status filter"
        className="flex flex-wrap gap-1.5 mb-5"
      >
        {STATUS_TABS.map((t) => {
          const active = statusFilter === t.value
          const isPending = t.value === 'pending'
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatusFilter(t.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-[var(--accent-strong)] text-white border-[var(--accent-strong)]'
                  : 'bg-white text-[#2D352C] border-[#E5EAE3] hover:bg-[#F5F8F3]'
              }`}
            >
              {t.label}
              {isPending && pendingCount !== null && pendingCount > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-semibold ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <ReportsSkeleton />
      ) : error ? (
        <div
          className="p-6 bg-white border border-[#E5EAE3] rounded-2xl text-sm text-red-600"
          role="alert"
        >
          {error}
        </div>
      ) : reports.length === 0 ? (
        <EmptyState status={statusFilter} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              isBusy={busyId === report.id}
              actionError={rowError[report.id] ?? null}
              onAction={handleAction}
              onBanRequest={setBanTarget}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(banTarget)}
        title="Ban user?"
        message={
          <>
            <p>
              Are you sure you want to ban{' '}
              <span className="font-semibold text-[#2D352C]">
                {banTargetName ?? 'this user'}
              </span>
              ?
            </p>
            <p className="mt-2">
              They will be prevented from using the app until an admin unbans
              them.
            </p>
          </>
        }
        confirmLabel="Ban user"
        confirmVariant="destructive"
        onConfirm={() => {
          const target = banTarget
          setBanTarget(null)
          if (target) void handleAction(target.id, 'ban')
        }}
        onCancel={() => setBanTarget(null)}
      />
    </div>
  )
}
