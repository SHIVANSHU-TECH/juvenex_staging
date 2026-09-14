'use client'

/**
 * Per-line outcome report. Every line gets its own row because every line was
 * its own `Create_Order` call and its own card charge (see the "hard
 * constraint" note in JxStore.tsx) — a single pass/fail summary would hide
 * exactly the information a partial failure needs to convey: which charges
 * went through and which didn't.
 */
import { formatUsd } from '@/lib/jx/catalog'
import { CheckCircleIcon } from '@/components/jx/icons'
import type { LineResult } from './types'

const STATUS_COPY: Record<LineResult['status'], { label: string; color: string }> = {
  success: { label: 'Order placed', color: 'var(--jx-brand)' },
  declined: { label: 'Payment declined', color: '#b3261e' },
  invalid: { label: 'Could not be submitted', color: '#b3261e' },
  error: { label: 'Something went wrong', color: '#b3261e' },
  skipped: { label: 'Not attempted', color: 'var(--jx-muted)' },
}

export function OrderResultsPanel({ results }: { results: LineResult[] }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {results.map((result) => {
        const copy = STATUS_COPY[result.status]
        return (
          <li
            key={result.line.id}
            className="jx-card"
            style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{result.line.title}</span>
              <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {formatUsd(result.line.price)}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                color: copy.color,
              }}
            >
              {result.status === 'success' ? <CheckCircleIcon size={15} /> : null}
              {copy.label}
              {result.orderId ? (
                <span style={{ fontWeight: 400, color: 'var(--jx-muted)' }}>
                  &middot; Order #{result.orderId}
                </span>
              ) : null}
            </div>
            {result.message ? (
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--jx-muted)' }}>{result.message}</p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
