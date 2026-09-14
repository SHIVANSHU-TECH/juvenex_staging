/**
 * Sibling maths for the product detail page.
 *
 * The partner catalogue models supply length as separate products, not as a
 * variant axis: "Tirzepatide 7.5 mg" exists four times, once per supply length,
 * under four unrelated ids. Re-deriving those relationships is what lets the
 * page answer the only question a customer really has — is the 12-month pack
 * worth $1,788 when the monthly is $239?
 *
 * The coverage is genuinely ragged (Semaglutide 0.5 mg has 1/6/12-month packs
 * but no 3-month; Tirzepatide 15 mg stops at 3 months), so nothing here assumes
 * a complete ladder — it reports what the catalogue actually contains.
 */

import type { JxProduct } from '@/lib/jx/catalog'

/**
 * Identifies "the same medicine" across supply lengths. Standard products key
 * on their weekly dose; programme products key on their whole dose ladder,
 * which is the only thing distinguishing four otherwise identical packs.
 */
export function doseSignature(product: JxProduct): string {
  return product.doseMg != null ? `d:${product.doseMg}` : `s:${product.doseSchedule.join('-')}`
}

/** Sort value for a dose ladder. Programme products sort by their first step. */
export function ladderDose(product: JxProduct): number {
  return product.doseMg ?? product.doseSchedule[0] ?? Number.POSITIVE_INFINITY
}

function sameLine(a: JxProduct, b: JxProduct): boolean {
  return a.molecule === b.molecule && a.kind === b.kind
}

/**
 * The same molecule and dose at every supply length the catalogue stocks,
 * ascending. Always includes the current product's own supply length (via its
 * canonical twin when the viewed id is a duplicate).
 */
export function supplySiblings(product: JxProduct, catalog: JxProduct[]): JxProduct[] {
  const signature = doseSignature(product)
  return catalog
    .filter((p) => sameLine(p, product) && doseSignature(p) === signature)
    .sort((a, b) => a.supplyMonths - b.supplyMonths)
}

/** The dose ladder for one molecule at one supply length, ascending. */
export function doseLadder(product: JxProduct, catalog: JxProduct[]): JxProduct[] {
  return catalog
    .filter((p) => sameLine(p, product) && p.supplyMonths === product.supplyMonths)
    .sort((a, b) => ladderDose(a) - ladderDose(b))
}

export interface SupplySaving {
  /** Total dollars saved against buying `supplyMonths` monthly packs. */
  amount: number
  percent: number
}

/**
 * Saving against the one-month pack of the same medicine. Returns null when the
 * catalogue has no monthly pack to compare with, or when the maths would be
 * flattering nonsense (a longer supply that costs more per month).
 */
export function savingVsMonthly(product: JxProduct, monthly: JxProduct | undefined): SupplySaving | null {
  if (!monthly || monthly.id === product.id || product.supplyMonths <= 1) return null
  const baseline = monthly.price * product.supplyMonths
  const amount = baseline - product.price
  if (baseline <= 0 || amount <= 0) return null
  return { amount, percent: Math.round((amount / baseline) * 100) }
}

/**
 * Products worth a look that the page has not already shown. Ordered by how
 * different they are from what is on screen: another format of the same
 * molecule first, then the other molecule at the same commitment.
 */
export function relatedProducts(
  product: JxProduct,
  catalog: JxProduct[],
  shownIds: ReadonlySet<string>,
  limit = 8
): JxProduct[] {
  const seen = new Set(shownIds)
  seen.add(product.id)
  const picks: JxProduct[] = []

  const push = (candidates: JxProduct[]) => {
    for (const candidate of candidates) {
      if (picks.length >= limit) return
      if (seen.has(candidate.id)) continue
      seen.add(candidate.id)
      picks.push(candidate)
    }
  }

  // A different format of the same molecule — programmes if you are looking at
  // a single dose, single doses if you are looking at a programme.
  push(
    catalog
      .filter((p) => p.molecule === product.molecule && p.kind !== product.kind)
      .sort((a, b) => a.supplyMonths - b.supplyMonths || ladderDose(a) - ladderDose(b))
  )
  // Then the other molecule at the same level of commitment.
  push(
    catalog
      .filter((p) => p.molecule !== product.molecule && p.supplyMonths === product.supplyMonths)
      .sort((a, b) => ladderDose(a) - ladderDose(b))
  )
  return picks
}
