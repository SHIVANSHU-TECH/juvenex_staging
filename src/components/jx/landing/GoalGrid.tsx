import Image from 'next/image'
import Link from 'next/link'
import { GOALS } from './copy'
import { Reveal } from './Reveal'

/**
 * "Shop by Goal" — Weight Loss shops the catalogue; other goals are VIP consult.
 */
export function GoalGrid() {
  return (
    <section className="jxl-sec" id="goals" aria-labelledby="jxl-goal-h">
      <h2 id="jxl-goal-h" className="jx-display jxl-h2" style={{ marginBottom: 20 }}>
        Shop by Goal
      </h2>
      <Reveal className="jxl-grid jxl-grid--goal">
        {GOALS.map((card, i) => {
          const isShop = card.href.startsWith('/store')
          return (
            <Link key={card.title} href={card.href} className="jxl-goal" data-reveal={i * 60}>
              <span className="jxl-goal-img" style={{ display: 'block' }}>
                <Image
                  src={`/jx/uploads/${card.image}`}
                  alt={card.alt}
                  fill
                  sizes="(min-width: 1280px) 244px, (min-width: 900px) 25vw, (min-width: 620px) 50vw, 100vw"
                />
              </span>
              <span className="jxl-goal-body" style={{ display: 'block' }}>
                <span
                  style={{
                    display: 'inline-block',
                    marginBottom: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: 'var(--jx-muted)',
                  }}
                >
                  {isShop ? 'Shop' : 'VIP consult'}
                </span>
                <span className="jxl-goal-row">
                  <span>{card.title}</span>
                  <span aria-hidden="true">→</span>
                </span>
                <span className="jxl-goal-desc">{card.desc}</span>
              </span>
            </Link>
          )
        })}
      </Reveal>
    </section>
  )
}
