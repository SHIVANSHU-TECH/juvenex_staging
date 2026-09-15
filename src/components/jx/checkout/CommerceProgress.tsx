'use client'

/**
 * Shared Bag → Checkout → Confirm strip for cart / checkout / success.
 */
const STEPS = [
  { id: 'bag', label: 'Bag' },
  { id: 'checkout', label: 'Checkout' },
  { id: 'confirm', label: 'Confirm' },
] as const

export type CommerceStep = (typeof STEPS)[number]['id']

export function CommerceProgress({ current }: { current: CommerceStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current)

  return (
    <nav aria-label="Checkout progress" style={{ marginBottom: 28 }}>
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {STEPS.map((step, index) => {
          const done = index < currentIndex
          const active = index === currentIndex
          return (
            <li
              key={step.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              aria-current={active ? 'step' : undefined}
            >
              {index > 0 ? (
                <span aria-hidden="true" style={{ color: 'var(--jx-muted)', fontSize: 12 }}>
                  →
                </span>
              ) : null}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  color: active || done ? 'var(--jx-ink)' : 'var(--jx-muted)',
                  letterSpacing: '.02em',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    background: active
                      ? 'var(--jx-brand)'
                      : done
                        ? 'var(--jx-bg-soft, #E8EFE6)'
                        : 'transparent',
                    color: active ? '#fff' : 'var(--jx-ink)',
                    border: active || done ? 'none' : '1px solid var(--jx-line, #D5DDD2)',
                  }}
                >
                  {index + 1}
                </span>
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
