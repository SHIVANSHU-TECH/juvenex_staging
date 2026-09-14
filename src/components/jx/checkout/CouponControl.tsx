'use client'

/**
 * Per-line promo code control.
 *
 * HIDDEN from live checkout in favor of cart-level `CartCouponControl`
 * (IdunRX-style single field). Keep this file — do not delete — so per-line
 * promo UI can be restored without rewriting.
 *
 * `Check_Coupons` validates a code against ONE `product_id` (see
 * docs/juvenex-api-integration.md). The discount shown is exactly what the
 * API returned — this component never computes a discounted price itself.
 */
import { useId, useState } from 'react'
import type { CouponState } from './types'

export function CouponControl({
  productId,
  state,
  onChange,
  disabled,
}: {
  productId: string
  state: CouponState
  onChange: (next: CouponState) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(state.code)
  const id = useId()
  const statusId = `${id}-status`

  async function apply(event: React.FormEvent) {
    event.preventDefault()
    const promo_code = draft.trim()
    if (!promo_code) return
    onChange({ code: draft, status: 'checking' })
    try {
      const res = await fetch('/api/juvenex/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promo_code, product_id: productId }),
      })
      const json: {
        status?: number
        message?: string
        error?: string
        data?: { code: string; discount_amount: string }
      } = await res.json().catch(() => ({}))

      if (!res.ok) {
        onChange({ code: draft, status: 'error', message: json.error ?? 'Could not check that code' })
        return
      }
      if (json.status === 1 && json.data) {
        onChange({
          code: draft,
          status: 'applied',
          appliedCode: json.data.code,
          discountAmount: json.data.discount_amount,
        })
        return
      }
      onChange({ code: draft, status: 'error', message: json.message || 'That code is not valid for this item' })
    } catch {
      onChange({ code: draft, status: 'error', message: 'Network error — try again' })
    }
  }

  function clear() {
    setDraft('')
    onChange({ code: '', status: 'idle' })
  }

  if (state.status === 'applied') {
    return (
      <div
        id={statusId}
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12.5,
          color: 'var(--jx-brand)',
          marginTop: 2,
        }}
      >
        <span>
          Code <strong>{state.appliedCode}</strong> applied — save {state.discountAmount}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--jx-muted)',
            textDecoration: 'underline',
            font: 'inherit',
            fontSize: 12,
            cursor: 'pointer',
            padding: 0,
            minHeight: 24,
          }}
        >
          Remove
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={apply} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <label htmlFor={id} className="jx-sr">
          Promo code for this item
        </label>
        <input
          id={id}
          className="jx-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Promo code"
          maxLength={100}
          disabled={disabled || state.status === 'checking'}
          aria-describedby={state.status === 'error' ? statusId : undefined}
          style={{ fontSize: 13, maxWidth: 180 }}
        />
        <button
          type="submit"
          className="jx-btn jx-btn-ghost"
          disabled={disabled || state.status === 'checking' || !draft.trim()}
          style={{ padding: '0 16px', fontSize: 12.5 }}
        >
          {state.status === 'checking' ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {state.status === 'error' ? (
        <p id={statusId} role="alert" style={{ margin: 0, fontSize: 12, color: '#b3261e' }}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
