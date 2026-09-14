import Image from 'next/image'
import Link from 'next/link'
import { Reveal } from './Reveal'

/**
 * Full-width quiz band — design lines 475–487, verbatim. The design's
 * assets/jx-strip-couple.png was lost with the source project; any photograph
 * works behind the 84%-opaque deep-green scrim it was always sitting under.
 */
export function QuizCta() {
  return (
    <section className="jxl-sec jxl-sec--major" id="quiz" aria-labelledby="jxl-quiz-h">
      <Reveal>
        <div className="jxl-quiz" data-reveal>
          <Image
            src="/jx/uploads/RurP8.jpg"
            alt=""
            fill
            sizes="(min-width: 1280px) 1236px, 100vw"
          />
          <div className="jxl-quiz-scrim" />
          <div className="jxl-quiz-body">
            <p className="jx-eyebrow" style={{ margin: 0, color: 'rgba(242,241,234,.7)' }}>
              Personalized plans
            </p>
            <h2 id="jxl-quiz-h" className="jx-display">
              Personalized health. Elevated results.
            </h2>
            <p>
              Take our quick quiz and get a personalized plan built around your goals, data, and
              lifestyle.
            </p>
            <Link href="/register" className="jx-btn jx-btn-onDark" style={{ fontSize: 15 }}>
              Take Your Health Quiz →
            </Link>
            <p
              style={{
                margin: '18px 0 0',
                fontSize: 11.5,
                fontWeight: 600,
                letterSpacing: '.16em',
                color: 'rgba(242,241,234,.65)',
              }}
            >
              3–5 MIN · PERSONALIZED PLAN · 100% CONFIDENTIAL
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
