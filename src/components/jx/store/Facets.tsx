import Link from 'next/link'
import { filterProducts, type JxProduct } from '@/lib/jx/catalog'
import {
  KIND_LABELS,
  KINDS,
  MOLECULES,
  SORT_LABELS,
  SORTS,
  SUPPLIES,
  catalogFilters,
  storeHref,
  type StoreQuery,
} from './query'
import s from './store.module.css'

/**
 * The filter rail: every option is a link, so filtering is a real navigation.
 * That keeps the state in the URL (shareable, back-button correct), needs no
 * client JavaScript, and lets each option carry an honest result count.
 */

interface FacetsProps {
  query: StoreQuery
  /** The whole de-duplicated catalogue — counts are computed against it. */
  catalog: JxProduct[]
}

export function Facets({ query, catalog }: FacetsProps) {
  // Count what each option would return with the *other* filters still applied,
  // so a zero means "nothing here", not "nothing anywhere".
  const countFor = (patch: Partial<StoreQuery>) =>
    filterProducts(catalog, catalogFilters({ ...query, ...patch })).length

  return (
    <div>
      <Group title="Molecule">
        <Option
          label="All"
          href={storeHref(query, { molecule: null })}
          count={countFor({ molecule: null })}
          active={query.molecule === null}
        />
        {MOLECULES.map((molecule) => (
          <Option
            key={molecule}
            label={molecule}
            href={storeHref(query, { molecule })}
            count={countFor({ molecule })}
            active={query.molecule === molecule}
          />
        ))}
      </Group>

      <Group title="Supply length">
        <Option
          label="Any"
          href={storeHref(query, { supply: null })}
          count={countFor({ supply: null })}
          active={query.supply === null}
        />
        {SUPPLIES.map((supply) => (
          <Option
            key={supply}
            label={supply === 1 ? '1 month' : `${supply} months`}
            href={storeHref(query, { supply })}
            count={countFor({ supply })}
            active={query.supply === supply}
          />
        ))}
      </Group>

      <Group title="Product type">
        <Option
          label="Any"
          href={storeHref(query, { kind: null })}
          count={countFor({ kind: null })}
          active={query.kind === null}
        />
        {KINDS.map((kind) => (
          <Option
            key={kind}
            label={KIND_LABELS[kind]}
            href={storeHref(query, { kind })}
            count={countFor({ kind })}
            active={query.kind === kind}
          />
        ))}
      </Group>

      <Group title="Sort by">
        {SORTS.map((sort) => (
          <Option
            key={sort}
            label={SORT_LABELS[sort]}
            href={storeHref(query, { sort })}
            active={query.sort === sort}
          />
        ))}
      </Group>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={s.group}>
      <h3 className={s.groupTitle}>{title}</h3>
      <ul className={s.options}>{children}</ul>
    </div>
  )
}

function Option({
  label,
  href,
  count,
  active,
}: {
  label: string
  href: string
  /** Omitted for sort options, where every choice returns the same set. */
  count?: number
  active: boolean
}) {
  // A dead end is shown, not hidden: seeing "6 months (0)" under Tirzepatide
  // 15 mg explains the gap in the catalogue instead of silently rewriting it.
  if (count === 0 && !active) {
    return (
      <li>
        <span className={s.optionOff}>
          {label}{' '}
          <span className={s.count}>
            0<span className="jx-sr"> products</span>
          </span>
        </span>
      </li>
    )
  }

  return (
    <li>
      <Link
        href={href}
        className={s.option}
        // aria-current, not aria-pressed: these are links, not toggle buttons.
        aria-current={active ? 'true' : undefined}
      >
        {label}
        {count != null ? (
          <span className={s.count}>
            {count}
            <span className="jx-sr">{count === 1 ? ' product' : ' products'}</span>
          </span>
        ) : null}
      </Link>
    </li>
  )
}
