/**
 * The /store URL contract.
 *
 * Every filter is a search param so a filtered view is shareable, bookmarkable
 * and correct under the back button — none of it lives in React state. The
 * canonical form omits defaults, so `/store` and `/store?sort=featured` render
 * the same thing but only the former is ever linked to.
 *
 *   q=<free text>                      matched against name, dose, sku
 *   molecule=Semaglutide|Tirzepatide
 *   supply=1|3|6|12                    months
 *   kind=single|starter|titration|maintenance|program
 *   sort=featured|price-asc|price-desc|monthly-asc|dose-asc
 *
 * `kind=program` is the union of the three programme kinds — the site chrome
 * already links to it (JxChrome "Programs"), and it is the distinction a
 * customer actually makes: one dose, or a multi-vial protocol.
 */

import type {
  CatalogFilters,
  Molecule,
  ProductKind,
  SortKey,
  SupplyMonths,
} from '@/lib/jx/catalog'

export type KindFilter = 'single' | 'starter' | 'titration' | 'maintenance' | 'program'

export interface StoreQuery {
  q: string
  molecule: Molecule | null
  supply: SupplyMonths | null
  kind: KindFilter | null
  sort: SortKey
}

/** Shape of the resolved `searchParams` promise Next hands a page. */
export type RawSearchParams = Record<string, string | string[] | undefined>

export const EMPTY_QUERY: StoreQuery = {
  q: '',
  molecule: null,
  supply: null,
  kind: null,
  sort: 'featured',
}

export const MOLECULES: readonly Molecule[] = ['Semaglutide', 'Tirzepatide']
export const SUPPLIES: readonly SupplyMonths[] = [1, 3, 6, 12]

export const KIND_LABELS: Record<KindFilter, string> = {
  single: 'Single dose',
  program: 'Any program',
  starter: 'Starter program',
  titration: 'Titration program',
  maintenance: 'Maintenance pack',
}
export const KINDS: readonly KindFilter[] = [
  'single',
  'program',
  'starter',
  'titration',
  'maintenance',
]

export const SORT_LABELS: Record<SortKey, string> = {
  featured: 'Featured',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  'monthly-asc': 'Cost per month',
  'dose-asc': 'Dose: low to high',
}
export const SORTS: readonly SortKey[] = [
  'featured',
  'monthly-asc',
  'price-asc',
  'price-desc',
  'dose-asc',
]

/** Repeated params (`?supply=1&supply=3`) collapse to the first value. */
function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export function parseStoreQuery(params: RawSearchParams): StoreQuery {
  const molecule = first(params.molecule).toLowerCase()
  const supply = Number(first(params.supply))
  const kind = first(params.kind).toLowerCase()
  const sort = first(params.sort)

  return {
    // Long queries are truncated rather than rejected: the search box is the
    // main way into a 51-product list and a stray paste should still return
    // something rather than an error.
    q: first(params.q).slice(0, 120),
    molecule: MOLECULES.find((m) => m.toLowerCase() === molecule) ?? null,
    supply: SUPPLIES.find((s) => s === supply) ?? null,
    kind: KINDS.find((k) => k === kind) ?? null,
    sort: (SORTS.find((s) => s === sort) as SortKey | undefined) ?? 'featured',
  }
}

/** The product kinds a `kind` filter selects, or null for "no restriction". */
export function kindsFor(kind: KindFilter | null): ProductKind[] | null {
  switch (kind) {
    case 'single':
      return ['standard']
    case 'program':
      return ['starter', 'titration', 'maintenance']
    case 'starter':
    case 'titration':
    case 'maintenance':
      return [kind]
    default:
      return null
  }
}

/** Translates the URL contract into the shape `filterProducts` expects. */
export function catalogFilters(query: StoreQuery): CatalogFilters {
  return {
    query: query.q,
    molecule: query.molecule,
    supplyMonths: query.supply,
    kinds: kindsFor(query.kind),
  }
}

/**
 * `/store` href for `query` with `patch` applied. Defaults are dropped so the
 * URL only ever carries what the customer actually chose.
 */
export function storeHref(query: StoreQuery, patch: Partial<StoreQuery> = {}): string {
  const next: StoreQuery = { ...query, ...patch }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.molecule) params.set('molecule', next.molecule)
  if (next.supply) params.set('supply', String(next.supply))
  if (next.kind) params.set('kind', next.kind)
  if (next.sort !== 'featured') params.set('sort', next.sort)
  const qs = params.toString()
  return qs ? `/store?${qs}` : '/store'
}

export interface ActiveFilter {
  key: 'q' | 'molecule' | 'supply' | 'kind'
  label: string
  /** Href with just this filter removed. */
  removeHref: string
}

/** The removable chips shown above the grid. Sort is deliberately not a chip. */
export function activeFilters(query: StoreQuery): ActiveFilter[] {
  const out: ActiveFilter[] = []
  if (query.q) {
    out.push({ key: 'q', label: `“${query.q}”`, removeHref: storeHref(query, { q: '' }) })
  }
  if (query.molecule) {
    out.push({
      key: 'molecule',
      label: query.molecule,
      removeHref: storeHref(query, { molecule: null }),
    })
  }
  if (query.supply) {
    out.push({
      key: 'supply',
      label: `${query.supply} month supply`,
      removeHref: storeHref(query, { supply: null }),
    })
  }
  if (query.kind) {
    out.push({
      key: 'kind',
      label: KIND_LABELS[query.kind],
      removeHref: storeHref(query, { kind: null }),
    })
  }
  return out
}
