'use client'

// TODO: extract a shared admin-shared/ReportsList with a `scope` prop
// ('global' | { orgSlug: string }) that picks the underlying endpoint, so
// super_admin and org_admin can reuse the same UI.

import { useCallback, useEffect, useState } from 'react'
import type { ApiEnvelope, AdminReport, AdminReportsData } from '@/lib/api-types'

type Report = AdminReport

const STATUS_TABS = ['pending', 'reviewed', 'dismissed'] as const

type Action = 'dismiss' | 'hide' | 'ban'

interface PostsTabProps {
  slug: string
  accentColor: string
}

export default function PostsTab({ slug, accentColor }: PostsTabProps) {
  const [status, setStatus] =
    useState<(typeof STATUS_TABS)[number]>('pending')
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('status', status)
      params.set('limit', '25')
      const res = await fetch(
        `/api/org/${encodeURIComponent(slug)}/admin/reports?${params}`
      )
      const json = (await res.json()) as ApiEnvelope<AdminReportsData>
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'Failed to load reports')
        setReports([])
        return
      }
      setReports(json.data.reports)
    } catch (err) {
      console.error('PostsTab load failed', err)
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [slug, status])

  useEffect(() => {
    load()
  }, [load])

  const runAction = async (report: Report, action: Action) => {
    const authorLabel =
      report.post?.author?.name ?? report.post?.author?.email ?? 'the author'
    const confirmText =
      action === 'ban'
        ? `Ban ${authorLabel} from this organization? Their account will remain active globally but they will be removed from this org's moderation surface and their post will be hidden.`
        : action === 'hide'
          ? 'Hide this post from the public feed?'
          : 'Dismiss this report without action?'
    if (!confirm(confirmText)) return

    setBusyId(report.id)
    setActionError(null)
    try {
      const res = await fetch(
        `/api/org/${encodeURIComponent(slug)}/admin/reports/${encodeURIComponent(report.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      )
      const json = (await res.json()) as ApiEnvelope<unknown>
      if (!res.ok || !json.success) {
        setActionError(json.error ?? 'Action failed')
        return
      }
      await load()
    } catch (err) {
      console.error('PostsTab action failed', err)
      setActionError('Network error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border ${
              status === s
                ? 'text-white'
                : 'border-[#E5EAE3] text-[#2D352C]/70 hover:bg-white'
            }`}
            style={
              status === s
                ? { backgroundColor: accentColor, borderColor: accentColor }
                : undefined
            }
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {actionError && (
        <p className="text-sm text-red-600" role="alert">
          {actionError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-[#2D352C]/60">Loading reports…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-[#2D352C]/60">
          No {status} reports for this organization.
        </p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li
              key={r.id}
              className="bg-[#FAF9F6]/80 border border-[#E5EAE3] rounded-3xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#2D352C]">
                    {r.post?.author?.name ?? r.post?.author?.email ?? 'Unknown author'}
                  </p>
                  <p className="text-xs text-[#2D352C]/50">
                    Reported{' '}
                    {new Date(r.created_at).toLocaleString()} by{' '}
                    {r.reporter?.name ?? r.reporter?.email ?? 'anonymous'}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-[#E5EAE3] text-[#2D352C]/70">
                  {r.status}
                </span>
              </div>

              {r.post && (
                <blockquote className="border-l-2 pl-3 text-sm text-[#2D352C] whitespace-pre-wrap"
                  style={{ borderColor: accentColor }}
                >
                  {r.post.body}
                </blockquote>
              )}

              <p className="text-sm text-[#2D352C]/70">
                <span className="font-medium">Reason:</span> {r.reason}
              </p>

              {r.status === 'pending' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => runAction(r, 'dismiss')}
                    disabled={busyId === r.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#E5EAE3] text-[#2D352C] hover:bg-white disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => runAction(r, 'hide')}
                    disabled={busyId === r.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                  >
                    Hide post
                  </button>
                  <button
                    type="button"
                    onClick={() => runAction(r, 'ban')}
                    disabled={busyId === r.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Ban from org
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
