import Link from 'next/link'
import { activeFilters, storeHref, type StoreQuery } from './query'
import s from './store.module.css'

/**
 * Active filters as removable chips. Each chip is a link to the same view with
 * that one filter dropped — which is also the only way a phone user can undo a
 * filter without re-opening the sheet.
 */
export function ActiveChips({ query }: { query: StoreQuery }) {
  const filters = activeFilters(query)
  if (!filters.length) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
      <h2 className="jx-sr">Active filters</h2>
      <ul className={s.chips}>
        {filters.map((filter) => (
          <li key={filter.key}>
            <Link href={filter.removeHref} className={s.chip}>
              {filter.label}
              <span className={s.chipX} aria-hidden="true">
                ×
              </span>
              <span className="jx-sr">— remove filter</span>
            </Link>
          </li>
        ))}
      </ul>
      {filters.length > 1 ? (
        <Link href={storeHref({ ...query, q: '', molecule: null, supply: null, kind: null })} className={s.clearAll}>
          Clear all
        </Link>
      ) : null}
    </div>
  )
}
