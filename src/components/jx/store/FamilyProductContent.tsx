'use client'

/**
 * KoverX-derived informational sections on Juvenex family PDPs.
 * Uses Juvenex tokens/classes only — no KoverX styling.
 */
import { useId, useState } from 'react'
import type { StorefrontProductContent } from '@/lib/jx/storefront-product-content'

export function FamilyProductContent({ content }: { content: StorefrontProductContent }) {
  if (!content.description && !content.bullets?.length && !content.faq?.length) {
    return null
  }

  return (
    <div style={{ display: 'grid', gap: 28 }}>
      {content.description || content.bullets?.length ? (
        <section aria-labelledby="jx-about-h" className="jx-card" style={{ padding: 20 }}>
          <p className="jx-eyebrow" style={{ margin: '0 0 8px' }}>
            About
          </p>
          <h2 id="jx-about-h" className="jx-display" style={{ fontSize: 22, margin: '0 0 12px' }}>
            Overview
          </h2>
          {content.subtitle ? (
            <p style={{ margin: '0 0 10px', fontWeight: 600, color: 'var(--jx-ink)', fontSize: 15 }}>
              {content.subtitle}
            </p>
          ) : null}
          {content.description ? (
            <p style={{ margin: 0, color: 'var(--jx-body)', lineHeight: 1.6, fontSize: 15 }}>
              {content.description}
            </p>
          ) : null}
          {content.bullets?.length ? (
            <ul
              style={{
                margin: '14px 0 0',
                paddingLeft: 18,
                color: 'var(--jx-body)',
                lineHeight: 1.55,
                fontSize: 14.5,
                display: 'grid',
                gap: 6,
              }}
            >
              {content.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {content.includes?.length ? (
        <section aria-labelledby="jx-includes-h" className="jx-card" style={{ padding: 20 }}>
          <p className="jx-eyebrow" style={{ margin: '0 0 8px' }}>
            What&rsquo;s included
          </p>
          <h2 id="jx-includes-h" className="jx-display" style={{ fontSize: 22, margin: '0 0 12px' }}>
            Your kit
          </h2>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: 'var(--jx-body)',
              lineHeight: 1.55,
              fontSize: 14.5,
              display: 'grid',
              gap: 6,
            }}
          >
            {content.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {content.timeline?.length ? (
        <section aria-labelledby="jx-timeline-h" className="jx-card" style={{ padding: 20 }}>
          <p className="jx-eyebrow" style={{ margin: '0 0 8px' }}>
            What to expect
          </p>
          <h2 id="jx-timeline-h" className="jx-display" style={{ fontSize: 22, margin: '0 0 14px' }}>
            Timeline
          </h2>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
            {content.timeline.map((item) => (
              <li
                key={`${item.label}-${item.text}`}
                style={{
                  display: 'grid',
                  gap: 4,
                  paddingBottom: 12,
                  borderBottom: '1px solid var(--jx-line, #E5EAE3)',
                }}
              >
                <strong style={{ fontSize: 13.5, color: 'var(--jx-brand)' }}>{item.label}</strong>
                <span style={{ fontSize: 14.5, color: 'var(--jx-body)', lineHeight: 1.5 }}>
                  {item.text}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {content.sideEffects?.length ? (
        <section aria-labelledby="jx-side-h" className="jx-card" style={{ padding: 20 }}>
          <p className="jx-eyebrow" style={{ margin: '0 0 8px' }}>
            Be informed
          </p>
          <h2 id="jx-side-h" className="jx-display" style={{ fontSize: 22, margin: '0 0 12px' }}>
            Possible side effects
          </h2>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: 'var(--jx-body)',
              lineHeight: 1.55,
              fontSize: 14.5,
              display: 'grid',
              gap: 6,
              columns: 'auto',
            }}
          >
            {content.sideEffects.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {content.storage ? (
            <p style={{ margin: '14px 0 0', fontSize: 13.5, color: 'var(--jx-muted)' }}>
              Storage: {content.storage}
            </p>
          ) : null}
        </section>
      ) : content.storage ? (
        <section aria-labelledby="jx-storage-h" className="jx-card" style={{ padding: 20 }}>
          <h2 id="jx-storage-h" className="jx-eyebrow" style={{ margin: '0 0 8px' }}>
            Storage
          </h2>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--jx-body)' }}>{content.storage}</p>
        </section>
      ) : null}

      {content.faq?.length ? <ProductFaq faqs={content.faq} /> : null}
    </div>
  )
}

function ProductFaq({ faqs }: { faqs: NonNullable<StorefrontProductContent['faq']> }) {
  const baseId = useId()
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section aria-labelledby={`${baseId}-h`} className="jx-card" style={{ padding: 20 }}>
      <p className="jx-eyebrow" style={{ margin: '0 0 8px' }}>
        Questions
      </p>
      <h2 id={`${baseId}-h`} className="jx-display" style={{ fontSize: 22, margin: '0 0 14px' }}>
        FAQ
      </h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {faqs.map((item, index) => {
          const isOpen = open === index
          const panelId = `${baseId}-panel-${index}`
          const btnId = `${baseId}-btn-${index}`
          return (
            <div
              key={item.q}
              style={{
                borderBottom: '1px solid var(--jx-line, #E5EAE3)',
                paddingBottom: 8,
              }}
            >
              <button
                id={btnId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : index)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 0,
                  padding: '10px 0',
                  cursor: 'pointer',
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--jx-ink)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span>{item.q}</span>
                <span aria-hidden="true" style={{ color: 'var(--jx-muted)' }}>
                  {isOpen ? '−' : '+'}
                </span>
              </button>
              {isOpen ? (
                <p
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  style={{ margin: '0 0 10px', fontSize: 14.5, color: 'var(--jx-body)', lineHeight: 1.55 }}
                >
                  {item.a}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
