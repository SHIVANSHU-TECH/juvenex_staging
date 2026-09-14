'use client'

import type { CSSProperties } from 'react'
import { useJxStore, type BagLine } from '../JxStore'
import { CheckIcon } from '../icons'

/**
 * The design's "Add to Cart" pill, as used by the recommendation rail and the
 * featured banner.
 *
 * A client island rather than a client section: both callers are otherwise
 * server-rendered, and the only thing that needs the browser is the bag.
 * The bag holds at most one unit per product (upstream `Create_Order` has no
 * quantity field), so a line already in the bag disables rather than stacks.
 */
export function AddToCartButton({
  line,
  block = false,
  style,
}: {
  line: BagLine
  /** Full-width pill, as the rail cards draw it. */
  block?: boolean
  style?: CSSProperties
}) {
  const { add, has, hydrated } = useJxStore()
  const inBag = hydrated && has(line.id)

  return (
    <button
      type="button"
      className={`jx-btn ${inBag ? 'jx-btn-ghost' : 'jx-btn-primary'}`}
      onClick={() => add(line)}
      disabled={inBag}
      style={{
        fontSize: block ? 13 : 14,
        width: block ? '100%' : undefined,
        padding: block ? 0 : undefined,
        ...style,
      }}
    >
      {inBag ? (
        <>
          <CheckIcon size={15} /> In cart
        </>
      ) : (
        'Add to Cart'
      )}
      {/* Several of these sit on one page; name the product for screen
          readers without changing the design's label. */}
      <span className="jx-sr"> — {line.title}</span>
    </button>
  )
}
