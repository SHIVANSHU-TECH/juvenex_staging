import { FlaskIcon, PeopleIcon, ShieldIcon, TrendIcon } from '../icons'
import { Reveal } from './Reveal'

/** Closing value props — design lines 489–508, verbatim. */
const ITEMS = [
  {
    icon: FlaskIcon,
    title: 'Science-Backed',
    body: 'Every product is backed by science and research.',
  },
  {
    icon: ShieldIcon,
    title: 'Trusted & Compliant',
    body: 'All pharmacies are licensed, tested, and verified.',
  },
  {
    icon: TrendIcon,
    title: 'Results-Driven',
    body: 'Real protocols, real people, real results.',
  },
  {
    icon: PeopleIcon,
    title: 'Community',
    body: 'Join 100,000+ members on their health journey.',
  },
]

export function ValueProps() {
  return (
    <section className="jxl-sec jxl-sec--last" aria-label="Why members choose Juvenex">
      <Reveal className="jxl-grid jxl-grid--value">
        {ITEMS.map(({ icon: Icon, title, body }, i) => (
          <div key={title} className="jxl-value" data-reveal={i * 70}>
            <Icon size={24} strokeWidth={1.7} style={{ flex: 'none', marginTop: 2 }} />
            <div>
              <b>{title}</b>
              <span>{body}</span>
            </div>
          </div>
        ))}
      </Reveal>
    </section>
  )
}
