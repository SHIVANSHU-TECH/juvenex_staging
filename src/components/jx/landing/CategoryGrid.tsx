import Image from 'next/image'
import Link from 'next/link'
import { CATEGORIES } from './copy'
import { Reveal } from './Reveal'

/**
 * "Shop by Category" — the design's five image cards (design lines 133–185),
 * with the design's names, descriptions and photography.
 *
 * Only Peptides and Bundles & Protocols have catalogue rows behind them; the
 * other three route to a consult (see copy.ts) rather than to an empty grid.
 */
export function CategoryGrid() {
  return (
    <section className="jxl-sec" id="categories" aria-labelledby="jxl-cat-h">
      <div className="jxl-head">
        <h2 id="jxl-cat-h" className="jx-display jxl-h2">
          Shop by Category
        </h2>
        <Link href="/store" className="jxl-more">
          View all →
        </Link>
      </div>
      <Reveal className="jxl-grid jxl-grid--cat">
        {CATEGORIES.map((card, i) => (
          <Link key={card.title} href={card.href} className="jxl-cat" data-reveal={i * 70}>
            <Image
              src={`/jx/uploads/${card.image}`}
              alt={card.alt}
              fill
              sizes="(min-width: 1280px) 244px, (min-width: 900px) 25vw, (min-width: 620px) 50vw, 100vw"
            />
            <span className="jxl-cat-scrim" />
            <span className="jxl-cat-body">
              <span className="jx-display jxl-cat-title">{card.title}</span>
              <span className="jxl-cat-desc" style={{ display: 'block' }}>
                {card.desc}
              </span>
            </span>
            <span className="jxl-cat-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </Reveal>
    </section>
  )
}
