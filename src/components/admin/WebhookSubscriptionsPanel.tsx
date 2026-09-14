'use client'

import { useCallback, useEffect, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import CreateWebhookModal from './CreateWebhookModal'

// WebhookSubscriptionsPanel — list + delete + create entry point for
// PrescribeRx webhook subscriptions. Embedded inside <SettingsTab />.
//
// Keep this presentation-focused: the modal owns the create form, this panel
// just renders rows and delegates the dialog open. Delete uses ConfirmDialog
// instead of window.confirm so destructive actions get proper focus mgmt.

interface WebhookSubscription {
  id: string
  name?: string | null
  url: string
  events: string[]
  is_active: boolean
  failure_count?: number | null
  subscriber_type?: string
  subscriber_id?: string
  subscriber_name?: string | null
}

interface ListEnvelope {
  success: boolean
  error?: string
  data?: {
    success?: boolean
    data?: WebhookSubscription[]
  }
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem('auth_token')
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function WebhookSubscriptionsPanel() {
  const [subs, setSubs] = useState<WebhookSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/settings/webhooks', {
        headers: authHeaders(),
      })
      const body = (await res.json().catch(() => ({}))) as ListEnvelope
      if (!res.ok || !body.success) {
        setError(body.error ?? 'Failed to load webhook subscriptions')
        setSubs([])
        return
      }
      // Upstream PrescribeRx envelope: { success, data: [...] }
      const upstream = body.data ?? {}
      const list = Array.isArray(upstream.data) ? upstream.data : []
      setSubs(list)
    } catch {
      setError('Network error loading subscriptions')
      setSubs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onCreated = (created: WebhookSubscription) => {
    setSubs((prev) => [created, ...prev])
  }

  const confirmDelete = async () => {
    const id = pendingDeleteId
    if (!id) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/settings/webhooks/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.success) {
        setError(body.error ?? 'Failed to delete subscription')
        return
      }
      setSubs((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setError('Network error deleting subscription')
    } finally {
      setDeleting(false)
      setPendingDeleteId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#2D352C]">
          Webhook subscriptions
        </h3>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
        >
          Create subscription
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs"
        >
          {error}
        </div>
      )}

      {loading ? (
        <ul className="space-y-2" aria-busy="true">
          <li className="h-14 rounded-lg bg-[#F5F8F3] animate-pulse" />
          <li className="h-14 rounded-lg bg-[#F5F8F3] animate-pulse" />
        </ul>
      ) : subs.length === 0 ? (
        <div className="text-center py-6 text-sm text-[#6B7567] bg-[#FAF9F6] border border-dashed border-[#E5EAE3] rounded-lg">
          No webhook subscriptions yet.
        </div>
      ) : (
        <ul role="list" className="space-y-2">
          {subs.map((sub) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              onDelete={() => setPendingDeleteId(sub.id)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete webhook subscription?"
        message={
          <span>
            This will stop deliveries to that endpoint. The signing secret
            cannot be recovered after deletion.
          </span>
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        confirmVariant="destructive"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />

      {createOpen && (
        <CreateWebhookModal
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={onCreated}
        />
      )}
    </div>
  )
}

function SubscriptionRow({
  sub,
  onDelete,
}: {
  sub: WebhookSubscription
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const evCount = sub.events.length
  return (
    <li className="border border-[#E5EAE3] rounded-lg p-3 bg-white">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-[#2D352C] truncate">
              {sub.name ?? 'Unnamed subscription'}
            </p>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                sub.is_active
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-zinc-50 text-zinc-600 border-zinc-200'
              }`}
            >
              {sub.is_active ? 'Active' : 'Paused'}
            </span>
            {(sub.failure_count ?? 0) > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                {sub.failure_count} failures
              </span>
            )}
          </div>
          <p className="text-[11px] font-mono text-[#6B7567] mt-1 break-all">
            {sub.url}
          </p>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-1 text-[11px] text-[var(--accent-strong)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 rounded"
          >
            {open ? 'Hide' : 'Show'} {evCount} event{evCount === 1 ? '' : 's'}
          </button>
          {open && (
            <ul className="mt-2 flex flex-wrap gap-1">
              {sub.events.map((ev) => (
                <li
                  key={ev}
                  className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#FAF9F6] text-[#2D352C] border border-[#E5EAE3]"
                >
                  {ev}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="px-2.5 py-1 rounded-lg text-xs text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          Delete
        </button>
      </div>
    </li>
  )
}
