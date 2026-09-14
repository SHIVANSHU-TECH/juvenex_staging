'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import WebhookEventPicker, { type EventTypesByCategory } from './WebhookEventPicker'
import WebhookSecretReveal from './WebhookSecretReveal'

// Super-admin form to register a PrescribeRx webhook subscription.
// A11y pattern mirrors EditPrescribeRxIntegrationModal: focus trap, ESC,
// backdrop close, role=dialog, aria-modal. PrescribeRx returns the signing
// `secret` exactly once on POST /webhooks; on success we switch the modal
// into a one-shot "captured secret" view the user MUST copy before closing.

interface CreateWebhookModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (sub: CreatedSubscription) => void
}

interface CreatedSubscription {
  id: string
  name?: string | null
  url: string
  events: string[]
  is_active: boolean
  failure_count?: number | null
  subscriber_type?: string
  subscriber_id?: string
  secret?: string
}

const SUBSCRIBER_TYPES = [
  { value: 'sales_organization', label: 'Sales organization' },
  { value: 'client', label: 'Client' },
  { value: 'telehealth_company', label: 'Telehealth company' },
] as const
type SubscriberType = typeof SUBSCRIBER_TYPES[number]['value']

const TITLE_ID = 'create-webhook-title'
const SECRET_TITLE_ID = 'create-webhook-secret-title'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INPUT_CLS = 'w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60'
const PRIMARY_BTN = 'px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60'

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const t = window.localStorage.getItem('auth_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

function normalizeEventTypes(payload: unknown): EventTypesByCategory {
  if (typeof payload !== 'object' || payload === null) return {}
  const root = payload as Record<string, unknown>
  const data = (root.data ?? root) as Record<string, unknown>
  const out: EventTypesByCategory = {}
  for (const [cat, items] of Object.entries(data)) {
    if (!Array.isArray(items)) continue
    const slugs: string[] = []
    for (const item of items) {
      if (typeof item === 'string') slugs.push(item)
      else if (item && typeof item === 'object' && typeof (item as { event?: unknown }).event === 'string') {
        slugs.push((item as { event: string }).event)
      }
    }
    if (slugs.length > 0) out[cat] = slugs
  }
  return out
}

export default function CreateWebhookModal({
  isOpen,
  onClose,
  onCreated,
}: CreateWebhookModalProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [subType, setSubType] = useState<SubscriberType>('sales_organization')
  const [subId, setSubId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [eventTypes, setEventTypes] = useState<EventTypesByCategory>({})
  const [evLoading, setEvLoading] = useState(true)
  const [evError, setEvError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const dialogRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setName('')
    setUrl('')
    setSubType('sales_organization')
    setSubId('')
    setSelected(new Set())
    setError(null)
    setSecret(null)
    setCopied(false)
    const t = setTimeout(() => firstFieldRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    ;(async () => {
      setEvLoading(true)
      setEvError(null)
      try {
        const res = await fetch('/api/admin/settings/webhooks/event-types', { headers: authHeaders() })
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok || !body.success) {
          setEvError(body.error ?? 'Failed to load event types')
          setEventTypes({})
        } else {
          setEventTypes(normalizeEventTypes(body.data))
        }
      } catch {
        if (!cancelled) setEvError('Network error loading event types')
      } finally {
        if (!cancelled) setEvLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const fs = dialogRef.current.querySelectorAll<HTMLElement>(
        'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      )
      if (fs.length === 0) return
      const first = fs[0]
      const last = fs[fs.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const totalEvents = useMemo(
    () => Object.values(eventTypes).reduce((s, arr) => s + arr.length, 0),
    [eventTypes]
  )

  if (!isOpen) return null

  const toggleEvent = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug); else next.add(slug)
      return next
    })
  }

  const validate = (): string | null => {
    if (name.trim().length === 0) return 'Name is required'
    if (!/^https:\/\//i.test(url.trim())) return 'URL must use https://'
    if (!UUID_REGEX.test(subId.trim())) return 'Subscriber ID must be a UUID'
    if (selected.size === 0) return 'Select at least one event'
    return null
  }

  const submit = async () => {
    const v = validate()
    if (v) { setError(v); return }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/settings/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          subscriber_type: subType,
          subscriber_id: subId.trim(),
          events: Array.from(selected),
          is_active: true,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.success) { setError(body.error ?? 'Failed to create subscription'); return }
      const upstream = body.data ?? {}
      const sub = (upstream.data ?? upstream) as CreatedSubscription
      onCreated(sub)
      const s = typeof sub.secret === 'string' && sub.secret.length > 0 ? sub.secret : null
      if (s) setSecret(s); else onClose()
    } catch {
      setError('Network error creating subscription')
    } finally {
      setSubmitting(false)
    }
  }

  const copySecret = async () => {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const showSecret = secret !== null
  const headingId = showSecret ? SECRET_TITLE_ID : TITLE_ID

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !showSecret) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {showSecret ? (
          <WebhookSecretReveal
            secret={secret!}
            copied={copied}
            onCopy={() => void copySecret()}
            onClose={onClose}
            headingId={SECRET_TITLE_ID}
          />
        ) : (
          <>
            <header className="flex items-center justify-between px-6 py-5 border-b border-[#E5EAE3]">
              <div>
                <h2 id={TITLE_ID} className="text-lg font-bold text-[#2D352C]">Create webhook subscription</h2>
                <p className="text-xs text-[#2D352C]/60 mt-0.5">PrescribeRx will POST events to your URL. Signing secret is shown once.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close"
                className="p-2 rounded-lg text-[#2D352C]/60 hover:bg-[#FAF9F6] hover:text-[#2D352C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60">
                ✕
              </button>
            </header>
            <form
              onSubmit={(e) => { e.preventDefault(); void submit() }}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
            >
              <Field label="Name" required>
                <input ref={firstFieldRef} type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Production EHR sync" className={INPUT_CLS} autoComplete="off" />
              </Field>
              <Field label="URL (must be HTTPS)" required>
                <input type="text" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-app.example.com/webhook" className={INPUT_CLS} autoComplete="off" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Subscriber type">
                  <select value={subType} onChange={(e) => setSubType(e.target.value as SubscriberType)} className={INPUT_CLS}>
                    {SUBSCRIBER_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Subscriber ID (UUID)" required>
                  <input type="text" value={subId} onChange={(e) => setSubId(e.target.value)}
                    placeholder="019xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className={`${INPUT_CLS} font-mono`} autoComplete="off" spellCheck={false} />
                </Field>
              </div>
              <WebhookEventPicker
                eventTypes={eventTypes}
                selected={selected}
                total={totalEvents}
                loading={evLoading}
                error={evError}
                onToggle={toggleEvent}
              />
              {error && (
                <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">{error}</div>
              )}
            </form>
            <footer className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#E5EAE3] bg-[#FAF9F6]/40">
              <button type="button" onClick={onClose} disabled={submitting}
                className="px-4 py-2 rounded-xl text-sm text-[#2D352C]/70 hover:bg-white hover:text-[#2D352C] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60">
                Cancel
              </button>
              <button type="button" onClick={() => void submit()} disabled={submitting} className={PRIMARY_BTN}>
                {submitting ? 'Creating…' : 'Create'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[#2D352C]/70 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}

