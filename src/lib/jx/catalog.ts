/**
 * Normalises the upstream Juvenex catalogue into something a storefront can
 * merchandise.
 *
 * The partner API (`Get_Products`) returns flat rows whose only real structure
 * lives inside `product_name` — every product is category "Weight Loss", none
 * carry images, and names encode molecule, weekly dose and supply length in
 * free text, e.g.:
 *
 *   "Compounded Tirzepatide (7.5 mg/week) - 6 month supply"
 *   "3-mo, MAINT, Semaglutide injection 2.5mg/ml, 1mg, (2x2ml, 1.25ml vial)"
 *   "Compounded Tirzepatide Starter Program (up to 15mg weekly dose)"
 *
 * Everything here is pure so it can run on the server (RSC fetch) or be reused
 * in tests. Parsing is deliberately forgiving: an unrecognised name still
 * yields a usable product, it just falls back to the raw title.
 */

import type { JuvenexProduct } from '@/lib/juvenex/client'
import { isPreferredCheckoutProductId } from '@/lib/jx/checkout-map'

export type Molecule = 'Semaglutide' | 'Tirzepatide'

/** Supply length in months. The catalogue only ever uses these four. */
export type SupplyMonths = 1 | 3 | 6 | 12

export type ProductKind =
  /** Plain "N mg/week" dose. */
  | 'standard'
  /** Maintenance multi-vial packs ("MAINT"). */
  | 'maintenance'
  /** Escalating-dose programmes ("Current GLP", explicit titration text). */
  | 'titration'
  /** Starter programmes that span a dose range. */
  | 'starter'

export interface JxProduct {
  id: string
  /** Raw upstream name, kept verbatim for order payloads and search. */
  rawName: string
  /** Cleaned display title, e.g. "Tirzepatide 7.5 mg". */
  title: string
  /** One-line qualifier under the title, e.g. "Weekly · 6 month supply". */
  subtitle: string
  description: string
  sku: string
  molecule: Molecule | null
  /** Weekly dose in mg. Null for titration/starter products that span doses. */
  doseMg: number | null
  /**
   * Ordered weekly doses for programme products, e.g. [0.5, 1, 1.5]. Empty for
   * standard single-dose products. This is what distinguishes the four
   * otherwise-identical maintenance packs from each other.
   */
  doseSchedule: number[]
  supplyMonths: SupplyMonths
  kind: ProductKind
  price: number
  /** price ÷ supplyMonths, for honest cross-supply comparison. */
  pricePerMonth: number
  category: string
  shippable: boolean
  /** Stable key for de-duplicating the browse grid. */
  variantKey: string
  images: string[]
}

const MOLECULES: Molecule[] = ['Semaglutide', 'Tirzepatide']

function detectMolecule(name: string): Molecule | null {
  const lower = name.toLowerCase()
  return MOLECULES.find((m) => lower.includes(m.toLowerCase())) ?? null
}

function detectSupplyMonths(name: string): SupplyMonths {
  // "- 6 month supply" / "- 3 months supply" / leading "3-mo,"
  const supply = name.match(/(\d{1,2})\s*(?:-)?\s*months?\s*supply/i)
  if (supply) return coerceSupply(Number(supply[1]))
  const shorthand = name.match(/(?:^|[\s,(])(\d{1,2})\s*-\s*mo\b/i)
  if (shorthand) return coerceSupply(Number(shorthand[1]))

  // Titration schedules state their length in weeks instead ("…weekly for 4
  // weeks, then …for 4 weeks, then …for 4 weeks" = 12 weeks = 3 months).
  const weeks = [...name.matchAll(/for\s+(\d{1,2})\s*weeks?/gi)].reduce(
    (sum, m) => sum + Number(m[1]),
    0
  )
  if (weeks >= 4) return coerceSupply(Math.round(weeks / 4))

  return 1
}

function coerceSupply(n: number): SupplyMonths {
  if (n >= 12) return 12
  if (n >= 6) return 6
  if (n >= 3) return 3
  return 1
}

function detectKind(name: string): ProductKind {
  const lower = name.toLowerCase()
  if (lower.includes('starter')) return 'starter'
  if (lower.includes('maint')) return 'maintenance'
  if (lower.includes('current glp')) return 'titration'
  // "Inject 0.25mg ... then Inject 0.5mg ..." — an escalating schedule.
  if (/\bthen\b[\s\S]*\binject\b/i.test(name)) return 'titration'
  return 'standard'
}

/**
 * Weekly dose in mg, or null when the product deliberately spans several
 * doses. Only reads the "(N mg/week)" form so a maintenance pack's vial
 * concentration ("2.5mg/ml") is never mistaken for a dose.
 */
function detectDoseMg(name: string, kind: ProductKind): number | null {
  if (kind !== 'standard') return null
  const m = name.match(/\(\s*([\d.]+)\s*mg\s*\/\s*week(?:ly)?\s*\)/i)
  return m ? Number(m[1]) : null
}

function buildTitle(
  raw: string,
  molecule: Molecule | null,
  doseMg: number | null,
  kind: ProductKind
): string {
  // Product #17 is a bare dosing instruction with no molecule named; falling
  // back to the raw string would put a 150-character sentence in an <h2>.
  const subject = molecule ?? 'GLP-1'
  if (kind === 'starter') return `${subject} Starter Program`
  if (kind === 'maintenance') return `${subject} Maintenance Pack`
  if (kind === 'titration') return `${subject} Titration Program`
  if (doseMg != null) return `${subject} ${formatDose(doseMg)}`
  return molecule ?? truncate(raw, 60)
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`
}

/**
 * Short, stable hash of the raw name. Used only to keep genuinely different
 * programme products (which share molecule/kind/supply but differ in their
 * vial breakdown) from collapsing into one another during de-duplication.
 */
function nameHash(value: string): string {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

function formatDose(mg: number): string {
  // 0.25 -> "0.25 mg", 5 -> "5 mg" (no trailing ".0")
  return `${Number(mg.toFixed(2))} mg`
}

/**
 * Weekly doses named in a programme product, in listed order.
 *
 * Reads bare "N mg" tokens while skipping concentrations ("2.5mg/ml") and
 * volumes ("2x2ml"), so "…2.5mg/ml, 0.5mg, 1mg, 1.5mg (5ml vial)" yields
 * [0.5, 1, 1.5].
 */
function detectDoseSchedule(name: string, kind: ProductKind): number[] {
  if (kind === 'standard') return []
  const doses: number[] = []
  const re = /([\d.]+)\s*mg\b(?!\s*\/)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(name)) !== null) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value > 0) doses.push(value)
  }
  return doses
}

function buildSubtitle(
  doseMg: number | null,
  supplyMonths: SupplyMonths,
  kind: ProductKind,
  doseSchedule: number[]
): string {
  const supply = supplyMonths === 1 ? '1 month supply' : `${supplyMonths} month supply`
  if (kind === 'standard') {
    return doseMg != null ? `${formatDose(doseMg)} weekly · ${supply}` : supply
  }
  // Programme products: the dose ladder is the only thing telling them apart.
  const steps = doseSchedule.map((d) => `${Number(d.toFixed(2))}`)
  const ladder = !steps.length
    ? ''
    : kind === 'starter' && steps.length === 1
      ? `up to ${steps[0]} mg` // "Starter Program (up to 15mg weekly dose)"
      : `${steps.join(' → ')} mg`
  const lead =
    kind === 'starter'
      ? 'Dose escalation'
      : kind === 'maintenance'
        ? 'Maintenance vials'
        : 'Stepped dosing'
  return [ladder || lead, supply].join(' · ')
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(n) ? n : fallback
}

/**
 * Pulls image URLs out of `product_img`, which the partner returns as an array
 * of either bare strings or `{ image / product_img / url }` objects depending
 * on the endpoint. Today it is always empty, but the shape is handled so the
 * storefront lights up automatically if the client uploads artwork.
 */
function extractImages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const urls: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      if (entry.trim()) urls.push(entry.trim())
      continue
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>
      for (const key of ['image', 'product_img', 'img', 'url', 'image_url']) {
        const candidate = record[key]
        if (typeof candidate === 'string' && candidate.trim()) {
          urls.push(candidate.trim())
          break
        }
      }
    }
  }
  return urls
}

/**
 * Consistent Juvenex-owned catalogue art for products whose upstream records
 * do not include photography. Dose and supply details stay as accessible UI
 * text instead of being baked into an image, so one clean family visual can
 * safely cover every current and future variant.
 */
function brandedFallbackImages(molecule: Molecule | null): string[] {
  if (molecule === 'Semaglutide') return ['/jx/generated/product-semaglutide.png']
  if (molecule === 'Tirzepatide') return ['/jx/generated/product-tirzepatide.png']
  return []
}

export function normalizeProduct(raw: JuvenexProduct): JxProduct {
  const rawName = String(raw.product_name ?? '').trim()
  const molecule = detectMolecule(rawName)
  const kind = detectKind(rawName)
  const supplyMonths = detectSupplyMonths(rawName)
  const doseMg = detectDoseMg(rawName, kind)
  const doseSchedule = detectDoseSchedule(rawName, kind)
  const price = toNumber(raw.product_price)
  const upstreamImages = extractImages(raw.product_img)

  return {
    id: String(raw.product_id),
    rawName,
    title: buildTitle(rawName, molecule, doseMg, kind),
    subtitle: buildSubtitle(doseMg, supplyMonths, kind, doseSchedule),
    doseSchedule,
    description: String(raw.product_description ?? '').trim(),
    sku: String(raw.product_sku ?? '').trim(),
    molecule,
    doseMg,
    supplyMonths,
    kind,
    price,
    pricePerMonth: supplyMonths > 0 ? price / supplyMonths : price,
    category: String(raw.product_category_name ?? '').trim() || 'Weight Loss',
    shippable: String(raw.product_is_shippable ?? '1') === '1',
    // Standard products de-duplicate on molecule/dose/supply. Programme
    // products (maintenance, titration, starter) share those three but differ
    // in their vial breakdown, so they keep a name hash and stay distinct.
    variantKey: [
      molecule ?? 'glp1',
      kind,
      doseMg ?? 'x',
      supplyMonths,
      kind === 'standard' ? '' : nameHash(rawName),
    ].join('|'),
    images: upstreamImages.length ? upstreamImages : brandedFallbackImages(molecule),
  }
}

export function normalizeProducts(rows: JuvenexProduct[]): JxProduct[] {
  return rows.map(normalizeProduct)
}

/**
 * Collapses the catalogue's exact duplicates (the partner lists the same
 * molecule/dose/supply under several IDs).
 *
 * Preference order:
 *  1. Excel / required checkout-map product id (see checkout-map.ts)
 *  2. Otherwise the lowest numeric ID (historical partner storefront default)
 */
export function dedupeVariants(products: JxProduct[]): JxProduct[] {
  const byKey = new Map<string, JxProduct>()
  for (const product of products) {
    const existing = byKey.get(product.variantKey)
    if (!existing) {
      byKey.set(product.variantKey, product)
      continue
    }
    const productPreferred = isPreferredCheckoutProductId(product.id)
    const existingPreferred = isPreferredCheckoutProductId(existing.id)
    if (productPreferred && !existingPreferred) {
      byKey.set(product.variantKey, product)
      continue
    }
    if (existingPreferred && !productPreferred) {
      continue
    }
    if (Number(product.id) < Number(existing.id)) {
      byKey.set(product.variantKey, product)
    }
  }
  return [...byKey.values()]
}

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'dose-asc' | 'monthly-asc'

const MOLECULE_ORDER: Record<string, number> = { Tirzepatide: 0, Semaglutide: 1 }
const KIND_ORDER: Record<ProductKind, number> = {
  standard: 0,
  starter: 1,
  titration: 2,
  maintenance: 3,
}

export function sortProducts(products: JxProduct[], key: SortKey): JxProduct[] {
  const out = [...products]
  switch (key) {
    case 'price-asc':
      return out.sort((a, b) => a.price - b.price)
    case 'price-desc':
      return out.sort((a, b) => b.price - a.price)
    case 'monthly-asc':
      return out.sort((a, b) => a.pricePerMonth - b.pricePerMonth)
    case 'dose-asc':
      return out.sort((a, b) => (a.doseMg ?? Infinity) - (b.doseMg ?? Infinity))
    case 'featured':
    default:
      // Molecule, then programme kind, then dose, then supply — the order a
      // patient stepping up their dose would expect to read.
      return out.sort(
        (a, b) =>
          (MOLECULE_ORDER[a.molecule ?? ''] ?? 9) - (MOLECULE_ORDER[b.molecule ?? ''] ?? 9) ||
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          (a.doseMg ?? Infinity) - (b.doseMg ?? Infinity) ||
          a.supplyMonths - b.supplyMonths
      )
  }
}

export interface CatalogFilters {
  query?: string
  molecule?: Molecule | null
  supplyMonths?: SupplyMonths | null
  maxPrice?: number | null
  /**
   * Product kinds to keep. A list rather than a single value because the store
   * offers "any programme" (starter + titration + maintenance) as one facet.
   * Undefined or empty keeps every kind.
   */
  kinds?: ProductKind[] | null
}

export function filterProducts(products: JxProduct[], filters: CatalogFilters): JxProduct[] {
  const query = filters.query?.trim().toLowerCase() ?? ''
  const terms = query ? query.split(/\s+/) : []
  return products.filter((p) => {
    if (filters.molecule && p.molecule !== filters.molecule) return false
    if (filters.supplyMonths && p.supplyMonths !== filters.supplyMonths) return false
    if (filters.kinds?.length && !filters.kinds.includes(p.kind)) return false
    if (filters.maxPrice != null && p.price > filters.maxPrice) return false
    if (terms.length) {
      const haystack = `${p.rawName} ${p.title} ${p.subtitle} ${p.sku} ${p.category}`.toLowerCase()
      if (!terms.every((t) => haystack.includes(t))) return false
    }
    return true
  })
}

/**
 * Picks the products the landing page's "Recommended for you" rail shows.
 *
 * One product per molecule + dose, always the shortest supply available, so a
 * first-time visitor sees a ladder of doses at the lowest commitment rather
 * than four supply lengths of the same 2.5 mg starting dose. Molecules
 * alternate so the rail does not open with six Tirzepatide cards.
 */
export function pickRecommended(products: JxProduct[], limit = 6): JxProduct[] {
  const standard = products.filter((p) => p.kind === 'standard' && p.doseMg != null)
  const pool = standard.length ? standard : products

  // Cheapest entry point for each molecule+dose.
  const byDose = new Map<string, JxProduct>()
  for (const p of pool) {
    const key = `${p.molecule}|${p.doseMg}`
    const existing = byDose.get(key)
    if (!existing || p.supplyMonths < existing.supplyMonths) byDose.set(key, p)
  }

  // Split per molecule (dose ascending), then interleave.
  const lanes = new Map<string, JxProduct[]>()
  for (const p of sortProducts([...byDose.values()], 'dose-asc')) {
    const lane = lanes.get(p.molecule ?? 'other') ?? []
    lane.push(p)
    lanes.set(p.molecule ?? 'other', lane)
  }

  const ordered = [...lanes.entries()]
    .sort(([a], [b]) => (MOLECULE_ORDER[a] ?? 9) - (MOLECULE_ORDER[b] ?? 9))
    .map(([, lane]) => lane)

  const picks: JxProduct[] = []
  for (let i = 0; picks.length < limit; i += 1) {
    const before = picks.length
    for (const lane of ordered) {
      if (lane[i]) picks.push(lane[i])
      if (picks.length >= limit) break
    }
    if (picks.length === before) break // every lane exhausted
  }
  return picks
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Deterministic accent per product so the generated vial artwork is stable
 * across renders and matches between the grid and the detail page.
 */
export function accentFor(product: Pick<JxProduct, 'molecule' | 'kind'>): string {
  if (product.kind === 'maintenance') return '#7C8F6E'
  if (product.kind === 'titration') return '#8A7F5C'
  if (product.kind === 'starter') return '#6E8896'
  return product.molecule === 'Tirzepatide' ? '#4A5A48' : '#63705B'
}
