import { Stars } from '../icons'
import { MEMBER_RATING, QUOTES } from './copy'
import { Reveal } from './Reveal'

/** "What members are saying." — design lines 434–473, verbatim. */
export function Testimonials() {
  return (
    <section className="jxl-sec jxl-sec--major" id="members" aria-labelledby="jxl-quote-h">
      <div className="jxl-head">
        <h2 id="jxl-quote-h" className="jx-display jxl-h2">
          What members are saying.
        </h2>
        <p className="jxl-rating">
          <Stars rating={MEMBER_RATING.rating} />
          <span>
            {MEMBER_RATING.rating} average across{' '}
            {MEMBER_RATING.reviews.toLocaleString('en-US')} reviews
          </span>
        </p>
      </div>
      <Reveal className="jxl-grid jxl-grid--quote">
        {QUOTES.map((entry, i) => (
          <figure key={entry.who} className="jxl-quote" style={{ margin: 0 }} data-reveal={i * 70}>
            <Stars rating={5} />
            <blockquote>&ldquo;{entry.quote}&rdquo;</blockquote>
            <figcaption>
              <span className="jxl-avatar" aria-hidden="true">
                {entry.initials}
              </span>
              <span>
                <span className="jxl-quote-who" style={{ display: 'block' }}>
                  {entry.who}
                </span>
                <span className="jxl-quote-topic">{entry.topic}</span>
              </span>
            </figcaption>
          </figure>
        ))}
      </Reveal>
    </section>
  )
}
