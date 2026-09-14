import { cache } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatUsd, type JxProduct } from '@/lib/jx/catalog'
import { getCatalog, getProductDetail } from '@/lib/jx/server'
import { ProductCard } from '@/components/jx/ProductCard'
import { RxIcon, TruckIcon } from '@/components/jx/icons'
import { AddToBag } from '@/components/jx/store/AddToBag'
import { DoseLadder } from '@/components/jx/store/DoseLadder'
import { SupplySwitcher } from '@/components/jx/store/SupplySwitcher'
import { storeHref } from '@/components/jx/store/query'
import {
  doseLadder,
  relatedProducts,
  savingVsMonthly,
  supplySiblings,
} from '@/components/jx/store/siblings'
import s from '@/components/jx/store/store.module.css'

/**
 * /store/[id] — product detail.
 *
 * Deliberately dynamic: prices come from the partner API and are cached for
 * five minutes, so pre-rendering these at build time would ship stale money.
 */

interface ProductPageProps {
  params: Promise<{ id: string }>
}

// generateMetadata and the page both need the product; `cache` collapses that
// into one upstream call per request.
const loadProduct = cache(getProductDetail)

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params
  const { product } = await loadProduct(id)
  if (!product) {
    // `notFound()` below cannot set a 404 status: the app-wide
    // `src/app/loading.tsx` opens a Suspense boundary above every route, so the
    // HTML shell (and its 200) is already flushed by the time this page's data
    // resolves. Until that root boundary is scoped down, noindex is what keeps
    // a soft 404 out of the search index.
    return { title: 'Product not found', robots: { index: false, follow: false } }
  }

  const perMonth =
    product.supplyMonths > 1
      ? ` (${formatUsd(Math.round(product.pricePerMonth))} per month)`
      : ''

  return {
    title: `${product.title} — ${product.subtitle}`,
    description: `${product.title}, ${product.subtitle}. ${formatUsd(product.price)}${perMonth}. Compounded ${product.molecule ?? 'GLP-1'} from a licensed pharmacy, prescription only after a telehealth consultation.`,
    alternates: { canonical: `/store/${product.id}` },
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params
  const [{ product, related }, catalog] = await Promise.all([loadProduct(id), getCatalog()])

  if (!product) {
    // Only claim "no such product" when the catalogue itself loaded. If the
    // partner API is down, everything is missing and a 404 would be a lie.
    if (catalog.error) return <DetailError message={catalog.error} id={id} />
    notFound()
  }

  const supplyOptions = supplySiblings(product, catalog.unique)
  const doseOptions = doseLadder(product, catalog.unique)
  const monthly = supplyOptions.find((option) => option.supplyMonths === 1)
  const saving = savingVsMonthly(product, monthly)

  const shown = new Set([...supplyOptions, ...doseOptions].map((option) => option.id))
  // The partner's own related list wins when it sends one; today it never does,
  // so the fallback is derived from the catalogue rather than left empty.
  const upstreamRelated = related.filter((p) => p.id !== product.id && !shown.has(p.id))
  const relatedList = upstreamRelated.length
    ? upstreamRelated
    : relatedProducts(product, catalog.unique, shown)

  const productImage = product.images[0]

  return (
    <div className="jx-shell" style={{ paddingBlock: '22px 64px' }}>
      <nav aria-label="Breadcrumb" style={{ marginBottom: 18 }}>
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
          <li>
            <Link href="/store" style={{ color: 'var(--jx-muted)' }}>
              Shop
            </Link>
          </li>
          {product.molecule ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={storeHref({
                    q: '',
                    molecule: product.molecule,
                    supply: null,
                    kind: null,
                    sort: 'featured',
                  })}
                  style={{ color: 'var(--jx-muted)' }}
                >
                  {product.molecule}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden="true">/</li>
          <li aria-current="page" style={{ color: 'var(--jx-ink)' }}>
            {product.title}
          </li>
        </ol>
      </nav>

      <div className={s.detail}>
        <div className={`jx-card ${s.artwork}`}>
          {productImage ? (
            <Image
              src={productImage}
              alt={`${product.title} product vial`}
              width={420}
              height={420}
              priority
              sizes="(min-width: 900px) 420px, 82vw"
              style={{ width: '100%', height: 'auto', maxHeight: 420, objectFit: 'contain' }}
            />
          ) : null}
        </div>

        <div>
          <p className="jx-eyebrow" style={{ margin: '0 0 10px' }}>
            {product.category} · Prescription only
          </p>
          <h1
            className="jx-display"
            style={{ fontSize: 'clamp(30px, 4.4vw, 46px)', lineHeight: 1.04, margin: 0 }}
          >
            {product.title}
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 15, color: 'var(--jx-body)' }}>
            {product.subtitle}
          </p>

          <p
            style={{
              display: 'flex',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              gap: 12,
              margin: '20px 0 0',
            }}
          >
            <span className="jx-display" style={{ fontSize: 34, lineHeight: 1 }}>
              {formatUsd(product.price)}
            </span>
            {product.supplyMonths > 1 ? (
              <span style={{ fontSize: 14, color: 'var(--jx-body)' }}>
                {formatUsd(Math.round(product.pricePerMonth))} / month · paid once for{' '}
                {product.supplyMonths} months
              </span>
            ) : (
              <span style={{ fontSize: 14, color: 'var(--jx-body)' }}>one month supply</span>
            )}
          </p>
          {saving ? (
            <p className={s.save} style={{ margin: '6px 0 0', fontSize: 13 }}>
              {formatUsd(saving.amount)} less than {product.supplyMonths} monthly packs (
              {saving.percent}% saving).
            </p>
          ) : null}

          <AddToBag product={product} />
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--jx-muted)', lineHeight: 1.5 }}>
            Each product is ordered on its own, and the supply length is part of the product — so
            there is no quantity to choose.
          </p>

          <div
            className="jx-card"
            style={{ marginTop: 22, padding: '16px 18px', background: 'var(--jx-bg-soft)' }}
          >
            <p style={{ display: 'flex', gap: 10, margin: 0, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--jx-brand)', flex: 'none', marginTop: 1 }}>
                <RxIcon size={20} />
              </span>
              <span style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--jx-body)' }}>
                <strong style={{ color: 'var(--jx-ink)', fontWeight: 600 }}>
                  Prescription only, and only after a consultation.
                </strong>{' '}
                A licensed clinician reviews your history and decides whether this protocol is
                appropriate. Nothing is dispensed or charged before that.{' '}
                <Link href="/telehealth" style={{ color: 'var(--jx-brand)', fontWeight: 600 }}>
                  Start your telehealth visit
                </Link>
                .
              </span>
            </p>
          </div>

          <PharmacyDetails product={product} />
        </div>
      </div>

      <SupplySwitcher current={product} options={supplyOptions} />
      <DoseLadder current={product} options={doseOptions} />

      {relatedList.length ? (
        <section aria-labelledby="jx-related" style={{ marginTop: 40 }}>
          <h2 id="jx-related" className="jx-display" style={{ fontSize: 24, margin: '0 0 14px' }}>
            Related products
          </h2>
          {/* Scrollable regions need to be keyboard reachable and named. */}
          <div className="jx-scroller" tabIndex={0} role="group" aria-label="Related products">
            {relatedList.slice(0, 8).map((item) => (
              <ProductCard key={item.id} product={item} width={252} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

/**
 * What the pharmacy actually listed.
 *
 * `product_description` is free text from the partner and is rendered as TEXT —
 * JSX escapes it, and there is no sanitiser in this project to make
 * `dangerouslySetInnerHTML` safe. For programme products this string is the
 * real dosing schedule, so it earns its place.
 */
function PharmacyDetails({ product }: { product: JxProduct }) {
  const listing = (product.description || product.rawName)
    // Every description ends with an internal billing-model token ("BM:4")
    // that means nothing outside the partner's admin.
    .replace(/\s*BM:\s*\d+\s*$/i, '')
    .trim()

  return (
    <section aria-labelledby="jx-pharmacy" style={{ marginTop: 26 }}>
      <h2 id="jx-pharmacy" className="jx-display" style={{ fontSize: 20, margin: '0 0 10px' }}>
        Pharmacy details
      </h2>
      {listing ? (
        <p
          style={{
            margin: '0 0 14px',
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--jx-body)',
            whiteSpace: 'pre-line',
          }}
        >
          {listing}
        </p>
      ) : null}
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '6px 18px',
          margin: 0,
          fontSize: 13,
        }}
      >
        {product.sku ? (
          <>
            <dt style={{ color: 'var(--jx-muted)' }}>SKU</dt>
            <dd style={{ margin: 0 }}>{product.sku}</dd>
          </>
        ) : null}
        <dt style={{ color: 'var(--jx-muted)' }}>Category</dt>
        <dd style={{ margin: 0 }}>{product.category}</dd>
        <dt style={{ color: 'var(--jx-muted)' }}>Delivery</dt>
        <dd style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
          <TruckIcon size={16} />
          {product.shippable ? 'Shipped to your address' : 'Collected in clinic'}
        </dd>
      </dl>
    </section>
  )
}

function DetailError({ message, id }: { message: string; id: string }) {
  return (
    <div className="jx-shell" style={{ paddingBlock: '40px 80px' }}>
      <div className="jx-card" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <h1 className="jx-display" style={{ fontSize: 26, margin: '0 0 8px' }}>
          This product is not loading
        </h1>
        <p style={{ margin: '0 0 18px', color: 'var(--jx-body)', fontSize: 14.5, lineHeight: 1.55 }}>
          {message}. We cannot confirm the price or availability right now, so nothing is shown
          rather than something wrong.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={`/store/${encodeURIComponent(id)}`} className="jx-btn jx-btn-primary">
            Try again
          </a>
          <Link href="/store" className="jx-btn jx-btn-ghost">
            Back to the shop
          </Link>
        </div>
      </div>
    </div>
  )
}
