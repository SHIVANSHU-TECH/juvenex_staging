import Link from 'next/link'
import { formatUsd, type JxProduct } from '@/lib/jx/catalog'
import { SUPPLIES } from './query'
import { savingVsMonthly } from './siblings'
import s from './store.module.css'

/**
 * "Choose your supply" — the highest-value control on the page.
 *
 * The same medicine at 1, 3, 6 and 12 months is four unrelated product ids
 * upstream, so without this a customer comparing $239/month against $1,788/year
 * has to find both pages and do the division. Each option is a link to that
 * product, with the per-month cost and the saving against buying monthly.
 *
 * Supply lengths the pharmacy does not stock for this dose are shown as unavailable
 * rather than omitted — the gaps are real (Semaglutide 0.5 mg has no 3-month
 * pack) and a silent omission looks like a bug.
 */
export function SupplySwitcher({
  current,
  options,
}: {
  current: JxProduct
  /** Same molecule, same dose, every supply length stocked. Ascending. */
  options: JxProduct[]
}) {
  if (options.length < 2) return null

  const monthly = options.find((option) => option.supplyMonths === 1)

  return (
    <section aria-labelledby="jx-supply-switcher" style={{ marginTop: 34 }}>
      <h2 id="jx-supply-switcher" className="jx-display" style={{ fontSize: 24, margin: '0 0 4px' }}>
        Choose your supply
      </h2>
      <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--jx-muted)', lineHeight: 1.5 }}>
        Same medicine and dose. Buying further ahead lowers the monthly cost.
      </p>

      <ul className={s.optionGrid}>
        {SUPPLIES.map((supply) => {
          const option = options.find((candidate) => candidate.supplyMonths === supply)
          const label = supply === 1 ? '1 month' : `${supply} months`

          if (!option) {
            return (
              <li key={supply}>
                <span className={s.optionCard} style={{ opacity: 0.45 }}>
                  <span style={eyebrow}>{label}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--jx-muted)', marginTop: 4 }}>
                    Not stocked at this dose
                  </span>
                </span>
              </li>
            )
          }

          const isCurrent = option.variantKey === current.variantKey
          const saving = savingVsMonthly(option, monthly)
          const body = (
            <>
              <span style={eyebrow}>{label}</span>
              <span className="jx-display" style={{ fontSize: 21, marginTop: 3, lineHeight: 1.1 }}>
                {formatUsd(option.price)}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--jx-body)' }}>
                {formatUsd(Math.round(option.pricePerMonth))} / month
              </span>
              {saving ? (
                <span className={s.save}>
                  Save {formatUsd(saving.amount)} ({saving.percent}%)
                </span>
              ) : null}
            </>
          )

          return (
            <li key={supply}>
              {isCurrent ? (
                <span className={s.optionCard} aria-current="page">
                  {body}
                  <span className="jx-sr">Currently viewing</span>
                </span>
              ) : (
                <Link href={`/store/${option.id}`} className={s.optionCard}>
                  {body}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: 'var(--jx-muted)',
}
