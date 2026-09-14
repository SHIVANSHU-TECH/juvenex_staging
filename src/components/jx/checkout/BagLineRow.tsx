'use client'

/**
 * One bag line, shared by /store/cart and /store/checkout's order summary.
 * Checkout passes `children` (the per-line coupon control); cart doesn't.
 */
import type { ReactNode } from 'react'
import type { BagLine } from '@/components/jx/JxStore'
import { JxVial } from '@/components/jx/JxVial'
import { formatUsd } from '@/lib/jx/catalog'
import { accentForBagLine, doseLabelForBagLine } from './lineArt'

export function BagLineRow({
  line,
  onRemove,
  removeLabel = 'Remove',
  children,
}: {
  line: BagLine
  onRemove?: (id: string) => void
  removeLabel?: string
  children?: ReactNode
}) {
  return (
    <li
      className="jx-card"
      style={{
        display: 'flex',
        gap: 14,
        padding: 14,
        alignItems: 'flex-start',
        listStyle: 'none',
      }}
    >
      <div
        style={{
          flex: 'none',
          width: 72,
          height: 86,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--jx-bg-soft)',
          borderRadius: 'var(--jx-r-sm)',
          border: '1px solid var(--jx-line)',
        }}
      >
        <JxVial accent={accentForBagLine(line)} label={doseLabelForBagLine(line)} height={72} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <h3 className="jx-display" style={{ margin: 0, fontSize: 17, lineHeight: 1.2 }}>
            {line.title}
          </h3>
          <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {formatUsd(line.price)}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--jx-muted)' }}>{line.subtitle}</p>

        {children}

        {onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(line.id)}
            className="jx-btn jx-btn-ghost"
            style={{ alignSelf: 'flex-start', marginTop: 6, padding: '0 16px', fontSize: 12.5 }}
          >
            {removeLabel}
            <span className="jx-sr"> {line.title} from bag</span>
          </button>
        ) : null}
      </div>
    </li>
  )
}
