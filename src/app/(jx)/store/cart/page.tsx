'use client'

/**
 * The bag. Kept deliberately simple — line art, remove, subtotal — because the
 * real complexity lives on /store/checkout. One unit per product (Create_Order
 * has no quantity field).
 */
import Link from 'next/link'
import { useJxStore } from '@/components/jx/JxStore'
import { BagLineRow } from '@/components/jx/checkout/BagLineRow'
import { CommerceProgress } from '@/components/jx/checkout/CommerceProgress'
import { LockIcon } from '@/components/jx/icons'
import { formatUsd } from '@/lib/jx/catalog'

export default function CartPage() {
  const { lines, subtotal, remove, hydrated } = useJxStore()

  return (
    <div className="jx-shell" style={{ paddingBlock: 40, maxWidth: 760, marginInline: 'auto' }}>
      <CommerceProgress current="bag" />
      <h1 className="jx-display" style={{ fontSize: 32, marginBottom: 24 }}>
        Your Bag
      </h1>

      {!hydrated ? (
        <div className="jx-skeleton" style={{ height: 180, borderRadius: 'var(--jx-r-md)' }} />
      ) : lines.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ color: 'var(--jx-muted)', marginBottom: 18 }}>Your bag is empty.</p>
          <Link href="/store" className="jx-btn jx-btn-primary">
            Browse the store
          </Link>
        </div>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lines.map((line) => (
              <BagLineRow key={line.id} line={line} onRemove={remove} />
            ))}
          </ul>

          <div
            className="jx-card"
            role="note"
            style={{ padding: 16, marginTop: 20, fontSize: 13.5, color: 'var(--jx-body)', display: 'flex', gap: 10 }}
          >
            <LockIcon size={18} />
            <span>
              Your card is charged once for the whole bag. Each item is still placed as its own
              order for prescription review — if any can&rsquo;t be placed, the payment is released
              and you are not charged.
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 24 }}>
            <span className="jx-eyebrow">Subtotal</span>
            <span className="jx-display" style={{ fontSize: 24 }}>
              {formatUsd(subtotal)}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            <Link href="/store" className="jx-btn jx-btn-ghost" style={{ flex: '1 1 160px' }}>
              Keep browsing
            </Link>
            <Link href="/store/checkout" className="jx-btn jx-btn-primary" style={{ flex: '1 1 160px' }}>
              Checkout
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
