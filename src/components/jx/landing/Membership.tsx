import Link from 'next/link'
import { CheckIcon } from '../icons'
import { TIERS } from './copy'
import { Reveal } from './Reveal'

/**
 * The four membership tiers — design lines 352–403, verbatim, and price-matched
 * to src/components/LandingPage.tsx so the two marketing surfaces cannot drift.
 * Every CTA goes to /telehealth, as designed — membership is sold behind a
 * consult, not added to the bag.
 */
export function Membership() {
  return (
    <section className="jxl-sec jxl-sec--major" id="membership" aria-labelledby="jxl-tier-h">
      <div className="jxl-head">
        <h2 id="jxl-tier-h" className="jx-display jxl-h2">
          Choose the protocol tier that fits your goals.
        </h2>
      </div>
      <Reveal className="jxl-grid jxl-grid--tier">
        {TIERS.map((tier, i) => (
          <div
            key={tier.kicker}
            className={`jxl-tier${tier.featured ? ' jxl-tier--featured' : ''}`}
            data-reveal={i * 70}
          >
            {tier.featured ? <span className="jxl-tier-flag">MOST POPULAR</span> : null}
            <p className="jxl-tier-kicker" style={{ margin: 0 }}>
              {tier.kicker.toUpperCase()}
            </p>
            <h3 className="jxl-tier-name">{tier.name}</h3>
            <p className="jx-display jxl-tier-price" style={{ margin: 0 }}>
              {tier.price}
              <small> / month</small>
            </p>
            <ul>
              {tier.features.map((feature) => (
                <li key={feature}>
                  <CheckIcon size={15} />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href="/telehealth"
              className={`jx-btn ${tier.featured ? 'jx-btn-onDark' : 'jx-btn-ghost'}`}
              style={tier.featured ? undefined : { borderColor: 'var(--jx-brand)', color: 'var(--jx-brand)' }}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </Reveal>
    </section>
  )
}
