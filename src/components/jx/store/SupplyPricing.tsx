import Link from 'next/link'
import { formatUsd, type JxProduct, type Molecule, type SupplyMonths } from '@/lib/jx/catalog'
import { MOLECULES, SUPPLIES, storeHref, type StoreQuery } from './query'
import s from './store.module.css'

/**
 * The comparison the grid cannot make.
 *
 * Every product in this catalogue is the same category with no photography, so
 * the only real decision is commitment: $239 for a month of Tirzepatide or
 * $1,788 for a year of it. Cards show one price each; this panel puts the
 * cost-per-month of every supply length side by side, and doubles as a facet
 * shortcut.
 *
 * Everything shown is arithmetic on the API's own prices — no list prices, no
 * "was", no invented discounts.
 */

interface Cell {
  supply: SupplyMonths
  low: number
  high: number
  perMonth: number
  saving: { amount: number; percent: number } | null
}

function buildRow(molecule: Molecule, visible: JxProduct[], catalog: JxProduct[]): Cell[] {
  // Programme products bundle several doses into one price, so they are not
  // comparable per month against a single-dose pack. Leave them out.
  const pool = visible.filter((p) => p.molecule === molecule && p.kind === 'standard')
  if (!pool.length) return []

  // Baseline comes from the whole catalogue, not the filtered view — otherwise
  // filtering to "12 months" would silently delete the thing being compared to.
  const monthly = catalog
    .filter((p) => p.molecule === molecule && p.kind === 'standard' && p.supplyMonths === 1)
    .reduce<number | null>((min, p) => (min == null || p.price < min ? p.price : min), null)

  const cells: Cell[] = []
  for (const supply of SUPPLIES) {
    const prices = pool.filter((p) => p.supplyMonths === supply).map((p) => p.price)
    if (!prices.length) continue
    const low = Math.min(...prices)
    const high = Math.max(...prices)
    const baseline = monthly != null ? monthly * supply : null
    const amount = baseline != null ? baseline - low : 0
    cells.push({
      supply,
      low,
      high,
      perMonth: low / supply,
      saving:
        baseline != null && baseline > 0 && amount > 0
          ? { amount, percent: Math.round((amount / baseline) * 100) }
          : null,
    })
  }
  return cells
}

export function SupplyPricing({
  query,
  visible,
  catalog,
}: {
  query: StoreQuery
  /** The products currently on screen. */
  visible: JxProduct[]
  catalog: JxProduct[]
}) {
  const rows = MOLECULES.map((molecule) => ({ molecule, cells: buildRow(molecule, visible, catalog) })).filter(
    (row) => row.cells.length > 0
  )

  const total = rows.reduce((sum, row) => sum + row.cells.length, 0)
  if (total < 2) return null // nothing to compare against

  const uniform = rows.every((row) => row.cells.every((cell) => cell.low === cell.high))

  return (
    <section aria-labelledby="jx-supply-pricing" style={{ marginBottom: 26 }}>
      <h2
        id="jx-supply-pricing"
        className="jx-display"
        style={{ fontSize: 22, margin: '0 0 4px' }}
      >
        What each supply length costs per month
      </h2>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--jx-muted)', lineHeight: 1.5 }}>
        {uniform
          ? 'Every dose is the same price at a given supply length, so the choice is how far ahead you buy.'
          : 'Prices vary by dose within a supply length; the lowest is shown.'}
      </p>

      {rows.map((row) => (
        <div key={row.molecule} style={{ marginBottom: 14 }}>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              margin: '0 0 8px',
              color: 'var(--jx-ink)',
            }}
          >
            {row.molecule}
          </h3>
          <div className={s.priceCols}>
            {row.cells.map((cell) => {
              const current = query.supply === cell.supply && query.molecule === row.molecule
              return (
                <Link
                  key={cell.supply}
                  href={storeHref(query, { molecule: row.molecule, supply: cell.supply })}
                  className={s.priceCell}
                  aria-current={current ? 'true' : undefined}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '.14em',
                      textTransform: 'uppercase',
                      color: 'var(--jx-muted)',
                    }}
                  >
                    {cell.supply === 1 ? '1 month' : `${cell.supply} months`}
                  </span>
                  <span
                    className="jx-display"
                    style={{ display: 'block', fontSize: 25, marginTop: 4, lineHeight: 1.1 }}
                  >
                    {formatUsd(Math.round(cell.perMonth))}
                    <span style={{ fontSize: 12.5, color: 'var(--jx-muted)' }}> / month</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--jx-body)', marginTop: 3 }}>
                    {cell.low === cell.high
                      ? `${formatUsd(cell.low)} total`
                      : `from ${formatUsd(cell.low)} total`}
                  </span>
                  {cell.saving ? (
                    <span className={s.save} style={{ display: 'block', marginTop: 4 }}>
                      Save {formatUsd(cell.saving.amount)} ({cell.saving.percent}%) vs. monthly
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
