'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FamilyProductCard } from '@/components/jx/store/FamilyProductCard'
import type {
  StorefrontCategory,
  StorefrontCategoryKey,
  StorefrontProduct,
} from '@/lib/jx/storefront-catalog'
import s from '@/components/jx/store/store.module.css'

/**
 * Client-side store browser so category chips filter instantly without an RSC
 * round-trip. Product cards avoid aggressive prefetch in development (that
 * stampede compiles every /store/p/* route and stalls navigation 15–30s).
 */

interface StoreBrowserProps {
  products: StorefrontProduct[]
  categories: StorefrontCategory[]
  initialCategory: StorefrontCategoryKey | null
}

export function StoreBrowser({ products, categories, initialCategory }: StoreBrowserProps) {
  const [category, setCategory] = useState<StorefrontCategoryKey | null>(initialCategory)

  // Hydrate from ?category= before paint + keep back/forward in sync.
  useLayoutEffect(() => {
    const value = new URLSearchParams(window.location.search).get('category')
    if (value && categories.some((c) => c.key === value)) {
      setCategory(value as StorefrontCategoryKey)
    }
  }, [categories])

  useEffect(() => {
    const sync = () => {
      const value = new URLSearchParams(window.location.search).get('category')
      if (value && categories.some((c) => c.key === value)) {
        setCategory(value as StorefrontCategoryKey)
      } else {
        setCategory(null)
      }
    }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [categories])

  const selectCategory = useCallback(
    (key: StorefrontCategoryKey | null) => {
      setCategory(key)
      const next = key ? `/store?category=${encodeURIComponent(key)}` : '/store'
      window.history.replaceState(window.history.state, '', next)
    },
    []
  )

  const visible = useMemo(
    () => (category ? products.filter((p) => p.category === category) : products),
    [products, category]
  )

  const activeLabel =
    categories.find((c) => c.key === category)?.label ?? 'All treatments'

  return (
    <div className="jx-shell" style={{ paddingBlock: '26px 64px' }}>
      <nav aria-label="Breadcrumb" style={{ marginBottom: 14 }}>
        <ol
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            listStyle: 'none',
            margin: 0,
            padding: 0,
            fontSize: 12.5,
            color: 'var(--jx-muted)',
          }}
        >
          <li>
            <Link href="/" style={{ color: 'var(--jx-muted)' }}>
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" style={{ color: 'var(--jx-ink)' }}>
            Shop
          </li>
        </ol>
      </nav>

      <header style={{ maxWidth: 720, marginBottom: 24 }}>
        <p className="jx-eyebrow" style={{ margin: '0 0 10px' }}>
          Prescription treatments
        </p>
        <h1
          className="jx-display"
          style={{ fontSize: 'clamp(32px, 5vw, 52px)', lineHeight: 1.03, margin: 0 }}
        >
          {activeLabel}
        </h1>
        <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--jx-body)' }}>
          Browse by category, choose a supply option, and add to your bag. Checkout uses the
          existing Juvenex payment flow.
        </p>
      </header>

      <nav aria-label="Product categories" className={s.chips} style={{ marginBottom: 22 }}>
        <CategoryChip
          label="All"
          active={category === null}
          onClick={() => selectCategory(null)}
        />
        {categories.map((c) => (
          <CategoryChip
            key={c.key}
            label={c.navLabel}
            active={category === c.key}
            onClick={() => selectCategory(c.key)}
          />
        ))}
      </nav>

      <section className={s.results} aria-labelledby="jx-results-heading">
        <p
          id="jx-results-heading"
          style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--jx-muted)' }}
        >
          <strong style={{ color: 'var(--jx-ink)', fontWeight: 600 }}>
            {visible.length} {visible.length === 1 ? 'treatment' : 'treatments'}
          </strong>
        </p>
        {visible.length ? (
          <div className={s.grid}>
            {visible.map((product) => (
              <FamilyProductCard key={product.slug} product={product} />
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--jx-muted)' }}>No treatments in this category yet.</p>
        )}
      </section>
    </div>
  )
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={s.chip}
      aria-pressed={active}
      onClick={onClick}
      style={
        active
          ? {
              background: 'var(--jx-brand)',
              color: '#fff',
              borderColor: 'var(--jx-brand)',
              cursor: 'pointer',
            }
          : { cursor: 'pointer' }
      }
    >
      {label}
    </button>
  )
}
