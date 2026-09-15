'use client'

import { formatUsd, type JxProduct } from '@/lib/jx/catalog'
import { CheckIcon } from '../icons'
import { useJxStore } from '../JxStore'
import { useAuthGatedAdd } from './useAuthGatedAdd'
import Link from 'next/link'

/**
 * Detail-page add-to-bag (partner API PDP).
 *
 * Guests must sign in first; after auth, pending add completes and routes to
 * /store/cart. No quantity control — Create_Order has no qty field.
 */
export function AddToBag({ product }: { product: JxProduct }) {
  const { has, hydrated } = useJxStore()
  const { addOrSignIn, authLoading } = useAuthGatedAdd()
  const inBag = hydrated && has(product.id)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
      <button
        type="button"
        className={`jx-btn ${inBag ? 'jx-btn-ghost' : 'jx-btn-primary'}`}
        style={{ minWidth: 220, flex: '1 1 220px' }}
        disabled={inBag || !hydrated || authLoading}
        onClick={() =>
          addOrSignIn({
            id: product.id,
            title: product.title,
            subtitle: product.subtitle,
            price: product.price,
            rawName: product.rawName,
          })
        }
      >
        {inBag ? (
          <>
            <CheckIcon size={16} /> In your bag
          </>
        ) : (
          `Add to bag — ${formatUsd(product.price)}`
        )}
      </button>

      {inBag ? (
        <Link href="/store/cart" className="jx-btn jx-btn-primary" style={{ flex: '0 1 auto' }}>
          Go to bag
        </Link>
      ) : null}
    </div>
  )
}
