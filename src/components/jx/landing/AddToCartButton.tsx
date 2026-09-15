'use client'

import type { CSSProperties } from 'react'
import type { BagLine } from '../JxStore'
import { useJxStore } from '../JxStore'
import { CheckIcon } from '../icons'
import { useAuthGatedAdd } from '../store/useAuthGatedAdd'

/**
 * The design's "Add to Cart" pill, as used by the recommendation rail and the
 * featured banner. Guests must sign in first (same as PDP Add to bag).
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
  const { has, hydrated } = useJxStore()
  const { addOrSignIn, authLoading } = useAuthGatedAdd()
  const inBag = hydrated && has(line.id)

  return (
    <button
      type="button"
      className={`jx-btn ${inBag ? 'jx-btn-ghost' : 'jx-btn-primary'}`}
      onClick={() => addOrSignIn(line)}
      disabled={inBag || !hydrated || authLoading}
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
      <span className="jx-sr"> — {line.title}</span>
    </button>
  )
}
