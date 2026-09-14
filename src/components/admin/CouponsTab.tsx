'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { ApiEnvelope } from '@/lib/api-types'
import type { AdminUserListItem } from '@/lib/messaging'
import UserPicker from './UserPicker'

// Mirrors the server Coupon shape (src/lib/coupons.ts) — declared locally so
// this client component doesn't pull server-only modules into the bundle.
interface Coupon {
  id: string
  code: string
  description: string | null
  discount_type: 'percent' | 'fixed'
  discount_value: number
  applies_to: 'membership' | 'all'
  max_redemptions: number | null
  per_user_limit: number
  redeemed_count: number
  expires_at: string | null
  active: boolean
  organization_id: string | null
  created_at: string
  updated_at: string
}

type ListResponse = ApiEnvelope<{ coupons: Coupon[] }>
type MutateResponse = ApiEnvelope<{ coupon: Coupon }>
type SendResponse = ApiEnvelope<{ sent: number }>

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  }
}

function formatDiscount(c: Pick<Coupon, 'discount_type' | 'discount_value'>): string {
  if (c.discount_type === 'percent') return `${c.discount_value}% off`
  return `$${(c.discount_value / 100).toFixed(2).replace(/\.00$/, '')} off`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface FormState {
  code: string
  description: string
  discountType: 'percent' | 'fixed'
  discountValue: string // percent (int) or dollars (2dp) depending on type
  maxRedemptions: string
  perUserLimit: string
  expiresAt: string // yyyy-mm-dd
  active: boolean
}

const EMPTY_FORM: FormState = {
  code: '',
  description: '',
  discountType: 'percent',
  discountValue: '100',
  maxRedemptions: '',
  perUserLimit: '1',
  expiresAt: '',
  active: true,
}

export default function CouponsTab() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)

  const [sendFor, setSendFor] = useState<Coupon | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/coupons', { headers: authHeaders() })
      const json = (await res.json().catch(() => null)) as ListResponse | null
      if (!res.ok || !json?.success || !json.data) {
        setError(json?.error ?? 'Failed to load coupons')
        return
      }
      setCoupons(json.data.coupons)
    } catch {
      setError('Network error loading coupons')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (creating) return
    setCreating(true)
    setError(null)

    const value = Number(form.discountValue)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a valid discount amount')
      setCreating(false)
      return
    }
    const discount_value =
      form.discountType === 'fixed' ? Math.round(value * 100) : Math.round(value)

    const payload: Record<string, unknown> = {
      discount_type: form.discountType,
      discount_value,
      applies_to: 'membership',
      per_user_limit: Math.max(0, Math.round(Number(form.perUserLimit) || 0)),
      active: form.active,
    }
    if (form.code.trim()) payload.code = form.code.trim()
    if (form.description.trim()) payload.description = form.description.trim()
    if (form.maxRedemptions.trim()) {
      payload.max_redemptions = Math.max(1, Math.round(Number(form.maxRedemptions)))
    }
    if (form.expiresAt) {
      // End of the chosen day, in the browser's local zone.
      payload.expires_at = new Date(`${form.expiresAt}T23:59:59`).toISOString()
    }

    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      const json = (await res.json().catch(() => null)) as MutateResponse | null
      if (!res.ok || !json?.success || !json.data) {
        setError(json?.error ?? 'Failed to create coupon')
        return
      }
      setCoupons((prev) => [json.data!.coupon, ...prev])
      setForm(EMPTY_FORM)
      setShowForm(false)
      showToast(`Coupon ${json.data.coupon.code} created`)
    } catch {
      setError('Network error creating coupon')
    } finally {
      setCreating(false)
    }
  }

  const toggleActive = async (c: Coupon) => {
    setBusyId(c.id)
    try {
      const res = await fetch(`/api/admin/coupons/${c.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ active: !c.active }),
      })
      const json = (await res.json().catch(() => null)) as MutateResponse | null
      if (res.ok && json?.success && json.data) {
        setCoupons((prev) => prev.map((x) => (x.id === c.id ? json.data!.coupon : x)))
      } else {
        showToast(json?.error ?? 'Update failed')
      }
    } catch {
      showToast('Network error')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (c: Coupon) => {
    if (!window.confirm(`Delete coupon ${c.code}? This cannot be undone.`)) return
    setBusyId(c.id)
    try {
      const res = await fetch(`/api/admin/coupons/${c.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      const json = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null
      if (res.ok && json?.success) {
        setCoupons((prev) => prev.filter((x) => x.id !== c.id))
        showToast(`Deleted ${c.code}`)
      } else {
        showToast(json?.error ?? 'Delete failed')
      }
    } catch {
      showToast('Network error')
    } finally {
      setBusyId(null)
    }
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      showToast(`Copied ${code}`)
    } catch {
      showToast('Copy failed — select the code manually')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#2D352C]">Coupons</h1>
          <p className="text-sm text-[#6B7567] mt-1">
            Create discount codes for membership checkout — any percent (incl.
            100% off), with optional limits and expiry. Copy a code or send it
            straight to members.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v)
            setError(null)
          }}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition"
        >
          {showForm ? 'Close' : '+ New coupon'}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-[#FEE2E2] border border-red-200 text-[#7F1D1D] text-sm rounded-xl px-4 py-3"
        >
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-[#E5EAE3] rounded-2xl p-6 shadow-sm space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Labeled label="Code" hint="Leave blank to auto-generate">
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. WELCOME50"
                className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg font-mono uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              />
            </Labeled>

            <Labeled label="Description" hint="Internal note (optional)">
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Launch promo"
                className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              />
            </Labeled>

            <Labeled label="Discount type">
              <select
                value={form.discountType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    discountType: e.target.value as 'percent' | 'fixed',
                    discountValue: e.target.value === 'percent' ? '100' : '25',
                  })
                }
                className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              >
                <option value="percent">Percent off (%)</option>
                <option value="fixed">Fixed amount off ($)</option>
              </select>
            </Labeled>

            <Labeled
              label={form.discountType === 'percent' ? 'Percent off' : 'Amount off (USD)'}
              hint={form.discountType === 'percent' ? '1–100 (100 = free)' : 'e.g. 25.00'}
            >
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#8B9B83]">
                  {form.discountType === 'fixed' ? '$' : ''}
                </span>
                <input
                  type="number"
                  min={form.discountType === 'percent' ? 1 : 0.01}
                  max={form.discountType === 'percent' ? 100 : undefined}
                  step={form.discountType === 'percent' ? 1 : 0.01}
                  value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                  className={`w-full py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 ${
                    form.discountType === 'fixed' ? 'pl-7 pr-3' : 'px-3'
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#8B9B83]">
                  {form.discountType === 'percent' ? '%' : ''}
                </span>
              </div>
            </Labeled>

            <Labeled label="Max total redemptions" hint="Blank = unlimited">
              <input
                type="number"
                min={1}
                value={form.maxRedemptions}
                onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                placeholder="Unlimited"
                className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              />
            </Labeled>

            <Labeled label="Per-user limit" hint="0 = unlimited per user">
              <input
                type="number"
                min={0}
                value={form.perUserLimit}
                onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              />
            </Labeled>

            <Labeled label="Expires" hint="Optional">
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              />
            </Labeled>

            <label className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="w-4 h-4 rounded border-[#E5EAE3] text-[var(--accent)] focus:ring-[var(--accent)]/40"
              />
              <span className="text-sm text-[#2D352C]">Active (usable immediately)</span>
            </label>
          </div>

          <p className="text-xs text-[#8B9B83]">
            Codes apply to the Juvenex membership checkout. A 100%-off (or
            amount-covers-price) code activates the membership free for one
            period; partial discounts are charged once at the reduced price.
          </p>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create coupon'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setForm(EMPTY_FORM)
                setError(null)
              }}
              className="px-4 py-2 rounded-lg border border-[#E5EAE3] text-sm text-[#2D352C] hover:bg-[#F5F8F3]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-[#E5EAE3] rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-sm text-[#6B7567] p-6">Loading…</p>
        ) : coupons.length === 0 ? (
          <p className="text-sm text-[#6B7567] p-6">
            No coupons yet. Create one to get started.
          </p>
        ) : (
          <div className="divide-y divide-[#E5EAE3]">
            {coupons.map((c) => (
              <CouponRow
                key={c.id}
                coupon={c}
                busy={busyId === c.id}
                onCopy={() => copyCode(c.code)}
                onSend={() => setSendFor(c)}
                onToggle={() => toggleActive(c)}
                onDelete={() => remove(c)}
              />
            ))}
          </div>
        )}
      </div>

      {sendFor && (
        <SendCouponModal
          coupon={sendFor}
          onClose={() => setSendFor(null)}
          onSent={(n) => {
            setSendFor(null)
            showToast(`Sent ${sendFor.code} to ${n} ${n === 1 ? 'member' : 'members'}`)
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-[#2D352C] text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

function CouponRow({
  coupon,
  busy,
  onCopy,
  onSend,
  onToggle,
  onDelete,
}: {
  coupon: Coupon
  busy: boolean
  onCopy: () => void
  onSend: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const uses =
    coupon.max_redemptions === null
      ? `${coupon.redeemed_count} used`
      : `${coupon.redeemed_count} / ${coupon.max_redemptions} used`
  const expired =
    coupon.expires_at !== null && new Date(coupon.expires_at).getTime() <= Date.now()

  return (
    <div className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onCopy}
            title="Copy code"
            className="font-mono text-sm font-semibold text-[#2D352C] bg-[#F5F8F3] border border-[#E5EAE3] rounded-lg px-2.5 py-1 hover:bg-[#E2E7E0] transition"
          >
            {coupon.code}
          </button>
          <span className="text-sm font-medium text-[var(--accent-strong)]">
            {formatDiscount(coupon)}
          </span>
          {!coupon.active && <Badge tone="muted">Inactive</Badge>}
          {expired && <Badge tone="warn">Expired</Badge>}
        </div>
        <p className="text-xs text-[#8B9B83] mt-1 truncate">
          {coupon.description ? `${coupon.description} · ` : ''}
          {uses}
          {coupon.per_user_limit > 0
            ? ` · ${coupon.per_user_limit}/user`
            : ' · unlimited/user'}
          {coupon.expires_at ? ` · expires ${formatDate(coupon.expires_at)}` : ''}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <RowButton onClick={onCopy} disabled={busy}>
          Copy
        </RowButton>
        <RowButton onClick={onSend} disabled={busy}>
          Send
        </RowButton>
        <RowButton onClick={onToggle} disabled={busy}>
          {coupon.active ? 'Disable' : 'Enable'}
        </RowButton>
        <RowButton onClick={onDelete} disabled={busy} tone="danger">
          Delete
        </RowButton>
      </div>
    </div>
  )
}

function RowButton({
  children,
  onClick,
  disabled,
  tone = 'default',
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'danger'
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-[#B91C1C] border-[#F3D4D4] hover:bg-[#FCEBEA]'
      : 'text-[#2D352C] border-[#E5EAE3] hover:bg-[#F5F8F3]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  )
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode
  tone: 'muted' | 'warn'
}) {
  const cls =
    tone === 'warn'
      ? 'bg-[#FEF3C7] text-[#92400E]'
      : 'bg-[#EEF1ED] text-[#6B7567]'
  return (
    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${cls}`}>
      {children}
    </span>
  )
}

function Labeled({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[#6B7567] mb-1">
        {label}
        {hint && <span className="text-[#B4C0AC] font-normal"> · {hint}</span>}
      </span>
      {children}
    </label>
  )
}

// ---------------------------------------------------------------------------
// Send modal — pick one or more members and message them the code.
// ---------------------------------------------------------------------------

function SendCouponModal({
  coupon,
  onClose,
  onSent,
}: {
  coupon: Coupon
  onClose: () => void
  onSent: (count: number) => void
}) {
  const [selected, setSelected] = useState<AdminUserListItem[]>([])
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected])

  const toggle = (u: AdminUserListItem) => {
    setSelected((prev) =>
      prev.some((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]
    )
  }

  const send = async () => {
    if (sending || selected.length === 0) return
    setSending(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}/send`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ userIds: selected.map((u) => u.id) }),
      })
      const json = (await res.json().catch(() => null)) as SendResponse | null
      if (!res.ok || !json?.success || !json.data) {
        setErr(json?.error ?? 'Failed to send')
        return
      }
      onSent(json.data.sent)
    } catch {
      setErr('Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#E5EAE3] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#2D352C]">Send coupon</h2>
            <p className="text-xs text-[#8B9B83]">
              <span className="font-mono">{coupon.code}</span> · {formatDiscount(coupon)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[#F5F8F3] text-[#6B7567]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {selected.length > 0 && (
          <div className="px-5 pt-3 flex flex-wrap gap-1.5">
            {selected.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u)}
                className="text-xs bg-[#EAF0E5] text-[#2D352C] rounded-full px-2.5 py-1 flex items-center gap-1 hover:bg-[#DCE6D4]"
              >
                {u.full_name || u.email}
                <span aria-hidden="true">✕</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden px-5 py-3">
          <div className="h-[320px] border border-[#E5EAE3] rounded-xl overflow-hidden">
            <UserPicker
              selectedUserId={selected[selected.length - 1]?.id ?? null}
              onSelect={toggle}
            />
          </div>
          <p className="text-xs text-[#8B9B83] mt-2">
            Tap members to add or remove them. The code is delivered as an in-app
            message.
          </p>
        </div>

        {err && (
          <p role="alert" className="px-5 text-sm text-[#B91C1C]">
            {err}
          </p>
        )}

        <div className="px-5 py-4 border-t border-[#E5EAE3] flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#E5EAE3] text-sm text-[#2D352C] hover:bg-[#F5F8F3]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || selected.length === 0}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {sending
              ? 'Sending…'
              : `Send to ${selected.length || ''} ${
                  selected.length === 1 ? 'member' : 'members'
                }`.trim()}
          </button>
        </div>
      </div>
    </div>
  )
}
