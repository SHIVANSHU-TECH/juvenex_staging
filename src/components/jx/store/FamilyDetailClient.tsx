'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatUsd } from '@/lib/jx/catalog'
import { getStorefrontProductContent } from '@/lib/jx/storefront-product-content'
import { useJxStore } from '@/components/jx/JxStore'
import { JxVial } from '@/components/jx/JxVial'
import { CheckIcon } from '@/components/jx/icons'
import type {
  StorefrontMedication,
  StorefrontPlan,
  StorefrontProduct,
} from '@/lib/jx/storefront-catalog'
import { FamilyProductContent } from './FamilyProductContent'

export function FamilyDetailClient({ product }: { product: StorefrontProduct }) {
  const { add, has, hydrated } = useJxStore()
  const content = useMemo(() => getStorefrontProductContent(product.slug), [product.slug])

  const initialMed =
    product.pricingType === 'medications' ? product.medications?.[0] ?? null : null
  const [medIndex, setMedIndex] = useState(0)
  const activeMed: StorefrontMedication | null =
    product.pricingType === 'medications'
      ? product.medications?.[medIndex] ?? initialMed
      : null

  const plans: StorefrontPlan[] = useMemo(() => {
    if (product.pricingType === 'single') return product.plans ?? []
    return activeMed?.plans ?? []
  }, [product, activeMed])

  const [planIndex, setPlanIndex] = useState(0)
  const activePlan = plans[Math.min(planIndex, Math.max(0, plans.length - 1))] ?? null

  const onSelectMed = (index: number) => {
    setMedIndex(index)
    setPlanIndex(0)
  }

  if (!activePlan) {
    return (
      <p style={{ color: 'var(--jx-muted)' }}>
        No checkout-mapped options are available for this product.
      </p>
    )
  }

  const inBag = hydrated && has(activePlan.productId)

  return (
    <div
      style={{
        display: 'grid',
        gap: 28,
        gridTemplateColumns: 'minmax(0, 1fr)',
      }}
    >
      <div className="jx-card" style={{ padding: 20, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 160px' }}>
          <JxVial accent="#8FA888" height={168} />
        </div>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <p className="jx-eyebrow" style={{ margin: '0 0 8px' }}>
            {product.tagline}
          </p>
          <h1 className="jx-display" style={{ margin: '0 0 10px', fontSize: 32 }}>
            {product.name}
          </h1>
          <p style={{ margin: 0, color: 'var(--jx-body)', lineHeight: 1.55, fontSize: 15 }}>
            Choose a supply length
            {product.pricingType === 'medications' ? ' and formulation' : ''}. Each option maps to
            a specific Juvenex SKU for checkout.
          </p>
        </div>
      </div>

      {product.pricingType === 'medications' && product.medications?.length ? (
        <section aria-labelledby="jx-med-h">
          <h2 id="jx-med-h" className="jx-eyebrow" style={{ marginBottom: 12 }}>
            Formulation
          </h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {product.medications.map((med, index) => {
              const selected = index === medIndex
              return (
                <button
                  key={`${med.name}-${index}`}
                  type="button"
                  onClick={() => onSelectMed(index)}
                  aria-pressed={selected}
                  className="jx-card"
                  style={{
                    textAlign: 'left',
                    padding: '14px 16px',
                    border: selected
                      ? '2px solid var(--jx-brand)'
                      : '1px solid var(--jx-line, #E5EAE3)',
                    background: selected ? 'var(--jx-bg-soft, #F5F8F3)' : undefined,
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ display: 'block', color: 'var(--jx-ink)' }}>{med.name}</strong>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="jx-plan-h">
        <h2 id="jx-plan-h" className="jx-eyebrow" style={{ marginBottom: 12 }}>
          Supply
        </h2>
        <div
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          }}
        >
          {plans.map((plan, index) => {
            const selected = index === planIndex
            return (
              <button
                key={plan.productId}
                type="button"
                onClick={() => setPlanIndex(index)}
                aria-pressed={selected}
                className="jx-card"
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  border: selected
                    ? '2px solid var(--jx-brand)'
                    : '1px solid var(--jx-line, #E5EAE3)',
                  background: selected ? 'var(--jx-bg-soft, #F5F8F3)' : undefined,
                  cursor: 'pointer',
                }}
              >
                <strong style={{ display: 'block', color: 'var(--jx-ink)' }}>{plan.label}</strong>
                {plan.dosage ? (
                  <span style={{ fontSize: 12.5, color: 'var(--jx-muted)' }}>{plan.dosage}</span>
                ) : null}
                <span
                  style={{
                    display: 'block',
                    marginTop: 8,
                    fontWeight: 600,
                    color: 'var(--jx-ink)',
                  }}
                >
                  {formatUsd(plan.price)}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="jx-card" style={{ padding: 18 }}>
        <dl
          style={{
            display: 'grid',
            gap: 8,
            margin: '0 0 16px',
            fontSize: 13.5,
            color: 'var(--jx-body)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <dt style={{ color: 'var(--jx-muted)' }}>SKU</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{activePlan.sku}</dd>
          </div>
          {activePlan.dosage ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <dt style={{ color: 'var(--jx-muted)' }}>Dosage</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>{activePlan.dosage}</dd>
            </div>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <dt style={{ color: 'var(--jx-muted)' }}>Total</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{formatUsd(activePlan.price)}</dd>
          </div>
        </dl>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            className={`jx-btn ${inBag ? 'jx-btn-ghost' : 'jx-btn-primary'}`}
            disabled={!hydrated}
            onClick={() => {
              if (inBag) return
              add({
                id: activePlan.productId,
                title: product.name,
                subtitle: [activeMed?.name, activePlan.label, activePlan.dosage]
                  .filter(Boolean)
                  .join(' · '),
                price: activePlan.price,
                rawName: `${product.name} (${activePlan.sku})`,
              })
            }}
          >
            {inBag ? (
              <>
                <CheckIcon /> In bag
              </>
            ) : (
              'Add to bag'
            )}
          </button>
          {inBag ? (
            <>
              <Link href="/store/cart" className="jx-btn jx-btn-ghost">
                View bag
              </Link>
              <Link href="/store/checkout" className="jx-btn jx-btn-primary">
                Checkout
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {content ? <FamilyProductContent content={content} /> : null}
    </div>
  )
}
