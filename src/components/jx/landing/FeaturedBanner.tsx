import Image from 'next/image'
import Link from 'next/link'
import { formatUsd, type JxProduct } from '@/lib/jx/catalog'
import { AddToCartButton } from './AddToCartButton'
import { Reveal } from './Reveal'

/**
 * The banner as the design draws it: "Tirzepatide 10 mg", $199.
 *
 * The client asked to keep the design's pricing, and $199 is not what the
 * catalogue charges for this product ($239). So the figure below is what
 * renders, and the direct add-to-bag is withheld whenever it disagrees with the
 * live price — advertising $199 on a button that charges $239 is not something
 * a price label can paper over. The consult link carries the visitor instead,
 * and /store shows real, transactable prices.
 */
const DESIGN_TITLE = 'Tirzepatide 10 mg'
const DESIGN_PRICE = 199

/**
 * Picks the banner product the design names: Tirzepatide 10 mg at the
 * one-month supply. Falls back down the catalogue rather than ever hard-coding
 * an id or a price — the partner renumbers rows.
 */
export function pickFeatured(products: JxProduct[]): JxProduct | null {
  const oneMonth = products
    .filter(
      (p) =>
        p.molecule === 'Tirzepatide' &&
        p.kind === 'standard' &&
        p.supplyMonths === 1 &&
        p.doseMg != null
    )
    .sort((a, b) => (b.doseMg ?? 0) - (a.doseMg ?? 0))

  return (
    oneMonth.find((p) => p.doseMg === 10) ??
    oneMonth[0] ??
    products.find((p) => p.molecule === 'Tirzepatide') ??
    products[0] ??
    null
  )
}

/** Design lines 259–274. */
export function FeaturedBanner({ product }: { product: JxProduct | null }) {
  if (!product) return null

  return (
    <section className="jxl-sec" aria-labelledby="jxl-feat-h">
      <Reveal>
        <div className="jxl-featured" data-reveal>
          {/*
            The design's assets/jx-strip-tirz.png was lost with the source
            project. n4n5h.jpg is the same subject — branded vials on marble —
            and takes the design's left-to-right cream scrim unchanged.
          */}
          <Image
            src="/jx/uploads/n4n5h.jpg"
            alt=""
            fill
            sizes="(min-width: 1280px) 1236px, 100vw"
            style={{ objectPosition: 'right center' }}
          />
          <div className="jxl-featured-scrim" />
          <div className="jxl-featured-body">
            <p className="jx-eyebrow" style={{ margin: 0 }}>
              Featured · Rx only
            </p>
            <h2 id="jxl-feat-h" className="jx-display jxl-featured-title">
              {DESIGN_TITLE}
            </h2>
            <p className="jxl-featured-copy">
              Pharmacy-grade GLP-1/GIP from licensed 503A &amp; 503B partners, shipped cold with
              every certificate on file.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span className="jx-display jxl-featured-price">{formatUsd(DESIGN_PRICE)}</span>
              {product.price === DESIGN_PRICE ? (
                <AddToCartButton
                  line={{
                    id: product.id,
                    title: product.title,
                    subtitle: product.subtitle,
                    price: product.price,
                    rawName: product.rawName,
                  }}
                />
              ) : (
                <Link href="/telehealth" className="jx-btn jx-btn-primary">
                  Start your consult
                </Link>
              )}
              <Link href={`/store/${product.id}`} className="jxl-more">
                See live pricing →
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
