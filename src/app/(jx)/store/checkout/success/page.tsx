'use client'

/**
 * Order confirmation. CheckoutForm only ever routes here once every line in
 * the bag succeeded (see the "MULTI-LINE ORDERS" note in CheckoutForm.tsx),
 * so every order listed below was actually charged. The data comes from
 * sessionStorage rather than the URL — order titles/prices/ids aren't
 * sensitive, but keeping them out of the query string means a bookmarked or
 * shared link can't be replayed to fabricate a fake confirmation, and avoids
 * URL-length limits for a large bag.
 *
 * A direct visit with nothing in sessionStorage (new tab, cleared storage,
 * this page opened without checking out) shows a fallback instead of an empty
 * or broken confirmation.
 *
 * Post-order clinical intake uses WLMD pending-forms (order_id + session email).
 * Fulfillment / clinical timeline lives at /store/account/orders via get-order
 * and get-order-history — not a mock pharmacy adapter.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircleIcon } from '@/components/jx/icons'
import { CommerceProgress } from '@/components/jx/checkout/CommerceProgress'
import { formatUsd } from '@/lib/jx/catalog'
import { CHECKOUT_SUCCESS_KEY, type StoredCheckoutSuccess } from '@/components/jx/checkout/types'
import { fetchPendingForms, hasIntakeCta, intakeFormUrl, INTAKE_ENABLED } from '@/lib/jx/intake'
import { saveIntakeReturnTo } from '@/lib/jx/pending-add'
import type { PendingForm } from '@/lib/juvenex/schemas'

function readStoredResult(): StoredCheckoutSuccess | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_SUCCESS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredCheckoutSuccess
    if (!parsed || !Array.isArray(parsed.lines) || parsed.lines.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

/** Keep actionable CTAs and "pending" states; hide completed / empty. */
function isVisibleIntakeForm(form: PendingForm): boolean {
  return hasIntakeCta(form) || form.action === 'pending'
}

/**
 * Stage 2 intake CTA. Rendered BELOW the confirmation, never in place of it:
 * the order is already paid for, so nothing here may obscure the receipt.
 *
 * Silent in every failure and no-work state — flag off, vendor not deployed,
 * no actionable forms — because an empty or errored intake lookup is not
 * something the customer can act on at this moment.
 */
function IntakeCta({ orderIds }: { orderIds: string[] }) {
  const [forms, setForms] = useState<PendingForm[]>([])

  useEffect(() => {
    if (!INTAKE_ENABLED) return
    if (!orderIds.length) return

    let active = true
    const uniqueOrderIds = Array.from(new Set(orderIds.filter(Boolean)))

    // fetchPendingForms never rejects; it resolves [] on any failure.
    void Promise.all(uniqueOrderIds.map((id) => fetchPendingForms(id))).then(
      (results) => {
        if (!active) return
        const merged = results.flat().filter(isVisibleIntakeForm)
        // Current UI uses `form.order_id` as the list `key`, so dedupe per order_id.
        const byOrderId = new Map<string, PendingForm>()
        for (const form of merged) {
          if (!form.order_id) continue
          if (!byOrderId.has(form.order_id)) byOrderId.set(form.order_id, form)
        }
        setForms(Array.from(byOrderId.values()))
      }
    )

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally key off stable string.
  }, [INTAKE_ENABLED, orderIds.join('|')])

  if (forms.length === 0) return null

  const needsAction = forms.some(hasIntakeCta)

  return (
    <section className="jx-card" style={{ padding: 20, marginTop: 24 }}>
      <h2 className="jx-display" style={{ fontSize: 18, marginBottom: 6 }}>
        {needsAction ? 'Next step: complete your intake' : 'Intake being prepared'}
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--jx-body)' }}>
        {needsAction
          ? 'Your prescribing doctor needs this to review your order. Complete the clinical form hosted by Juvenex, then track progress from your orders.'
          : 'Your clinical intake form isn\u2019t ready yet. Check back shortly from your orders page.'}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {forms.map((form) => {
          const url = intakeFormUrl(form)
          return (
            <li
              key={form.order_id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
            >
              <span style={{ fontSize: 13.5 }}>
                Order {form.order_id} &mdash; {form.product_name}
              </span>
              {hasIntakeCta(form) && url ? (
                <Link
                  className="jx-btn jx-btn-primary"
                  href={`/store/intake?order_id=${encodeURIComponent(form.order_id)}`}
                  onClick={() => saveIntakeReturnTo('/store/checkout/success')}
                >
                  {form.action === 'check_in' ? 'Complete check-in' : 'Complete intake'}
                </Link>
              ) : form.action === 'pending' ? (
                <span style={{ fontSize: 13, color: 'var(--jx-muted)', fontWeight: 600 }}>
                  Being prepared
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function CheckoutSuccessPage() {
  // undefined = "haven't checked sessionStorage yet" (avoids an SSR/client mismatch flash).
  const [data, setData] = useState<StoredCheckoutSuccess | null | undefined>(undefined)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a browser-only store; there's no React state to derive this from.
    setData(readStoredResult())
  }, [])

  if (data === undefined) {
    return (
      <div className="jx-shell" style={{ paddingBlock: 60 }}>
        <div className="jx-skeleton" style={{ height: 200, borderRadius: 'var(--jx-r-md)' }} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="jx-shell" style={{ paddingBlock: 60, maxWidth: 480, marginInline: 'auto', textAlign: 'center' }}>
        <h1 className="jx-display" style={{ fontSize: 28, marginBottom: 12 }}>
          No recent order found
        </h1>
        <p style={{ color: 'var(--jx-muted)', marginBottom: 22 }}>
          We couldn&rsquo;t find a completed order for this browser session. If you just checked
          out, look for a confirmation email, or check your order history.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/store/account/orders" className="jx-btn jx-btn-primary">
            View my orders
          </Link>
          <Link href="/dashboard" className="jx-btn jx-btn-ghost">
            Go to dashboard
          </Link>
        </div>
      </div>
    )
  }

  const total = data.lines.reduce((sum, l) => sum + l.price, 0)
  const orderIds = data.lines.map((l) => l.orderId).filter((id) => Boolean(id))

  return (
    <div className="jx-shell" style={{ paddingBlock: 48, maxWidth: 640, marginInline: 'auto' }}>
      <CommerceProgress current="confirm" />
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <CheckCircleIcon size={40} style={{ color: 'var(--jx-brand)' }} />
        <h1 className="jx-display" style={{ fontSize: 30, margin: '12px 0 6px' }}>
          Order confirmed
        </h1>
        <p style={{ color: 'var(--jx-muted)', margin: 0 }}>
          {data.lines.length} order{data.lines.length === 1 ? '' : 's'} placed &middot;{' '}
          {formatUsd(total)} total
        </p>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.lines.map((line) => (
          <li
            key={line.id}
            className="jx-card"
            style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontWeight: 600 }}>{line.title}</span>
              <span style={{ fontWeight: 600 }}>{formatUsd(line.price)}</span>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--jx-muted)' }}>{line.subtitle}</p>
            {line.orderId ? (
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--jx-muted)' }}>
                Order #{line.orderId}{' '}
                <Link
                  href={`/store/account/orders/${encodeURIComponent(line.orderId)}`}
                  style={{ color: 'var(--jx-brand)', fontWeight: 600 }}
                >
                  View progress
                </Link>
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="jx-tile-dark" style={{ padding: 20, marginTop: 24 }}>
        <h2 className="jx-display" style={{ fontSize: 18, marginBottom: 8 }}>
          What happens next
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, opacity: 0.9 }}>
          Complete clinical intake when prompted, then a licensed provider reviews your order.
          Track intake, approval, and shipping from your orders page — status comes from Juvenex
          (Order Created → Intake → Doctor → Approval → Shipped).
        </p>
      </div>

      <IntakeCta orderIds={orderIds} />

      <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
        <Link href="/store/account/orders" className="jx-btn jx-btn-primary" style={{ flex: '1 1 160px' }}>
          My Orders
        </Link>
        <Link href="/store" className="jx-btn jx-btn-ghost" style={{ flex: '1 1 160px' }}>
          Browse the store
        </Link>
      </div>
    </div>
  )
}
