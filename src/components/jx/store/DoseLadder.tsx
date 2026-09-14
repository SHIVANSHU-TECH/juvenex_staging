import Link from 'next/link'
import { formatUsd, type JxProduct } from '@/lib/jx/catalog'
import s from './store.module.css'

/**
 * The dose ladder for one molecule at one supply length.
 *
 * GLP-1 dosing escalates over months, so the dose a customer is on now is not
 * the one they will reorder. Every rung is a separate product id upstream;
 * this puts them in order so stepping up is one click, not a search.
 */
export function DoseLadder({
  current,
  options,
}: {
  current: JxProduct
  /** Same molecule, kind and supply length, ascending by dose. */
  options: JxProduct[]
}) {
  if (options.length < 2) return null

  const supply = `${current.supplyMonths}-month`
  const programme = current.kind !== 'standard'

  return (
    <section aria-labelledby="jx-dose-ladder" style={{ marginTop: 34 }}>
      <h2 id="jx-dose-ladder" className="jx-display" style={{ fontSize: 24, margin: '0 0 4px' }}>
        {programme ? 'Choose your dose ladder' : 'Choose your dose'}
      </h2>
      <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--jx-muted)', lineHeight: 1.5 }}>
        {programme
          ? `Every ${supply} programme this molecule is stocked in.`
          : `Weekly doses stocked in the ${supply} supply. Your clinician sets the dose.`}
      </p>

      <ul className={s.optionGrid}>
        {options.map((option) => {
          const isCurrent = option.variantKey === current.variantKey
          // Titration and maintenance packs are told apart by their ladder, not
          // by a single number — `subtitle` already spells it out.
          const label = option.doseMg != null ? `${option.doseMg} mg` : option.subtitle.split(' · ')[0]
          const body = (
            <>
              <span className="jx-display" style={{ fontSize: 19, lineHeight: 1.15 }}>
                {label}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--jx-body)' }}>
                {formatUsd(option.price)}
                {option.supplyMonths > 1
                  ? ` · ${formatUsd(Math.round(option.pricePerMonth))}/mo`
                  : ''}
              </span>
            </>
          )

          return (
            <li key={option.id}>
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
