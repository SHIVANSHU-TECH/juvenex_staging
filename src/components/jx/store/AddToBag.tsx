'use client'

import Link from 'next/link'
import { formatUsd, type JxProduct } from '@/lib/jx/catalog'
import { CheckIcon } from '../icons'
import { useJxStore } from '../JxStore'

/**
 * Detail-page add-to-bag.
 *
 * There is deliberately no quantity control: `Create_Order` upstream takes one
 * product id and has no quantity field, so the bag holds one unit per product
 * and checkout places one order per line. A stepper here would promise
 * something the pharmacy API cannot deliver.
 */
export function AddToBag({ product }: { product: JxProduct }) {
  const { add, has, hydrated } = useJxStore()
  const inBag = hydrated && has(product.id)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
      <button
        type="button"
        className={`jx-btn ${inBag ? 'jx-btn-ghost' : 'jx-btn-primary'}`}
        style={{ minWidth: 220, flex: '1 1 220px' }}
        disabled={inBag}
        onClick={() =>
          add({
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
        <Link href="/store/cart" className="jx-btn jx-btn-ghost" style={{ flex: '0 1 auto' }}>
          Review bag
        </Link>
      ) : null}
    </div>
  )
}
