import Image from 'next/image'
import Link from 'next/link'
import { Reveal } from './Reveal'

/**
 * Full-width CTA band — get started / shop / VIP (honest destinations).
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
              Create your account, shop treatments, or start a VIP consult — then complete clinical
              intake after checkout when required.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
              <Link href="/register" className="jx-btn jx-btn-onDark" style={{ fontSize: 15 }}>
                Get started →
              </Link>
              <Link href="/store" className="jx-btn jx-btn-ghost" style={{ fontSize: 15, color: '#fff', borderColor: 'rgba(255,255,255,.45)' }}>
                Shop treatments
              </Link>
              <Link href="/telehealth" className="jx-btn jx-btn-ghost" style={{ fontSize: 15, color: '#fff', borderColor: 'rgba(255,255,255,.45)' }}>
                Start VIP consult
              </Link>
            </div>
            <p
              style={{
                margin: '18px 0 0',
                fontSize: 11.5,
                fontWeight: 600,
                letterSpacing: '.16em',
                color: 'rgba(242,241,234,.65)',
              }}
            >
              ACCOUNT TO ORDER · PERSONALIZED PLAN · 100% CONFIDENTIAL
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
