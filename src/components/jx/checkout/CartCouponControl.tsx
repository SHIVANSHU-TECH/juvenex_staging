'use client'

/**
 * Cart-level (single) promo code — IdunRX-style one field for the whole bag.
 * Server flow: groupon/check-coupon (Sema/Tirz gate) → check_coupons_v3.
 */
import { useId, useState } from 'react'
import type { CouponState } from './types'

interface CartCouponControlProps {
  productIds: string[]
  email?: string
  coupons: Record<string, CouponState>
  onChange: (next: Record<string, CouponState>) => void
  disabled?: boolean
}

export function CartCouponControl({
  productIds,
  email,
  coupons,
  onChange,
  disabled,
}: CartCouponControlProps) {
  const applied = Object.values(coupons).find((c) => c.status === 'applied' && c.appliedCode)
  const [draft, setDraft] = useState(applied?.appliedCode ?? '')
  const [status, setStatus] = useState<'idle' | 'checking' | 'error'>('idle')
  const [message, setMessage] = useState<string | undefined>()
  const id = useId()
  const statusId = `${id}-status`

  async function apply(event: React.FormEvent) {
    event.preventDefault()
    const promo_code = draft.trim()
    if (!promo_code || productIds.length === 0) return

    setStatus('checking')
    setMessage(undefined)

    try {
      const res = await fetch('/api/juvenex/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promo_code,
          product_ids: productIds,
          email: email || undefined,
        }),
      })
      const json: {
        status?: number
        message?: string
        error?: string
        product_ids?: string[]
        data?: { code: string; discount_amount: string }
      } = await res.json().catch(() => ({}))

      if (res.ok && json.status === 1 && json.data) {
        const ids = json.product_ids?.length ? json.product_ids : productIds
        const next: Record<string, CouponState> = {}
        for (const productId of ids) {
          next[productId] = {
            code: draft,
            status: 'applied',
            appliedCode: json.data.code,
            discountAmount: json.data.discount_amount,
          }
        }
        setStatus('idle')
        setMessage(undefined)
        onChange(next)
        return
      }

      setStatus('error')
      setMessage(json.message || json.error || 'That code is not valid for these items')
      onChange({})
    } catch {
      setStatus('error')
      setMessage('Network error — try again')
      onChange({})
    }
  }

  function clear() {
    setDraft('')
    setStatus('idle')
    setMessage(undefined)
    onChange({})
  }

  if (applied) {
    return (
      <div
        id={statusId}
        role="status"
        className="jx-card"
        style={{
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 13.5, color: 'var(--jx-brand)' }}>
          Code <strong>{applied.appliedCode}</strong> applied
          {applied.discountAmount ? ` — save ${applied.discountAmount}` : ''}
        </span>
        <button
          type="button"
          className="jx-btn jx-btn-ghost"
          onClick={clear}
          disabled={disabled}
          style={{ padding: '0 14px', fontSize: 12.5 }}
        >
          Remove
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={apply}
      className="jx-card"
      style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <label htmlFor={id} className="jx-eyebrow" style={{ margin: 0 }}>
        Coupon code
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          id={id}
          className="jx-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Enter coupon code"
          maxLength={100}
          disabled={disabled || status === 'checking'}
          aria-describedby={status === 'error' ? statusId : undefined}
          style={{ flex: '1 1 180px', fontSize: 14 }}
        />
        <button
          type="submit"
          className="jx-btn jx-btn-ghost"
          disabled={disabled || status === 'checking' || !draft.trim()}
          style={{ padding: '0 18px', fontSize: 13 }}
        >
          {status === 'checking' ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {status === 'error' ? (
        <p id={statusId} role="alert" style={{ margin: 0, fontSize: 12.5, color: '#b3261e' }}>
          {message}
        </p>
      ) : null}
    </form>
  )
}
