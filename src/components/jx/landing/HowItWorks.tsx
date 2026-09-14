import Link from 'next/link'
import { STEPS } from './copy'
import { Reveal } from './Reveal'

/** Design lines 405–432, verbatim. */
export function HowItWorks() {
  return (
    <section className="jxl-sec jxl-sec--major" id="how" aria-labelledby="jxl-how-h">
      <div className="jxl-head">
        <h2 id="jxl-how-h" className="jx-display jxl-h2">
          A personalized, community-driven experience.
        </h2>
        <Link href="/register" className="jxl-more">
          Join free →
        </Link>
      </div>
      <Reveal>
        <ol className="jxl-steps" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {STEPS.map((step, i) => (
            <li key={step.title} className="jxl-step" data-reveal={i * 70}>
              <p className="jx-display jxl-step-n">{step.n.toUpperCase()}</p>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  )
}
