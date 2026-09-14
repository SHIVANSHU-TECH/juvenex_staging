'use client'

import Link from 'next/link'
import Image from 'next/image'
import { accentFor, formatUsd, type JxProduct } from '@/lib/jx/catalog'
import { useJxStore } from './JxStore'
import { JxVial } from './JxVial'
import { CheckIcon } from './icons'

/**
 * The catalogue card, shared by the landing rail and the store grid.
 *
 * The whole card is a link to the detail page; the add button is a sibling
 * control rather than a nested one (nesting interactive elements inside an
 * anchor is invalid and breaks keyboard and screen-reader traversal). The
 * stretched-link pattern below keeps the large click target without nesting.
 */
export function ProductCard({
  product,
  width,
  priority = false,
}: {
  product: JxProduct
  /** Fixed px width for the horizontal rail; omit inside a grid. */
  width?: number
  priority?: boolean
}) {
  const { add, has, hydrated } = useJxStore()
  const inBag = hydrated && has(product.id)
  const accent = accentFor(product)
  const image = product.images[0]

  return (
    <article
      className="jx-card"
      style={{
        position: 'relative',
        flex: width ? 'none' : undefined,
        width: width ?? undefined,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Panel height and artwork size come from .jx-card-art so the two-up
          phone grid can shrink them; inline styles could not carry the query. */}
      <div className="jx-card-art">
        {image ? (
          <Image src={image} alt="" width={160} height={175} priority={priority} sizes="180px" />
        ) : (
          <JxVial accent={accent} label={product.doseMg ? `${product.doseMg} mg` : undefined} height={168} />
        )}
      </div>

      <div
        style={{
          padding: '15px 15px 17px',
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          flex: 1,
        }}
      >
        <h3 className="jx-display" style={{ fontSize: 19, margin: 0, lineHeight: 1.15 }}>
          {/*
            Stretched link: covers the card for pointer users while remaining a
            single focusable element. The add button sits above it via z-index.
          */}
          <Link
            href={`/store/${product.id}`}
            style={{ color: 'var(--jx-ink)', textDecoration: 'none' }}
          >
            <span
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, zIndex: 1 }}
            />
            {product.title}
          </Link>
        </h3>

        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--jx-muted)', lineHeight: 1.4 }}>
          {product.subtitle}
        </p>

        <p style={{ margin: '2px 0 0', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--jx-ink)' }}>
            {formatUsd(product.price)}
          </span>
          {product.supplyMonths > 1 ? (
            <span style={{ fontSize: 12, color: 'var(--jx-muted)' }}>
              {formatUsd(Math.round(product.pricePerMonth))}/mo
            </span>
          ) : null}
        </p>

        <button
          type="button"
          className={`jx-btn ${inBag ? 'jx-btn-ghost' : 'jx-btn-primary'}`}
          style={{
            marginTop: 'auto',
            position: 'relative',
            zIndex: 2,
            width: '100%',
            fontSize: 13,
            minHeight: 42,
            padding: 0,
          }}
          onClick={() =>
            add({
              id: product.id,
              title: product.title,
              subtitle: product.subtitle,
              price: product.price,
              rawName: product.rawName,
            })
          }
          disabled={inBag}
        >
          {inBag ? (
            <>
              <CheckIcon size={15} /> In bag
            </>
          ) : (
            'Add to bag'
          )}
        </button>
      </div>
    </article>
  )
}
