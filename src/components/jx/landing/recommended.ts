/**
 * Resolves the design's six "Recommended For You" cards against the live
 * catalogue.
 *
 * The design merchandises six products; the partner API sells two molecules.
 * Rather than re-cut the section (the client asked for it as drawn) every card
 * ships exactly as designed and only the call to action changes:
 *
 *   - a card whose molecule exists gets the REAL product id and the REAL price,
 *     and its button adds that product to the bag;
 *   - a card whose molecule does not exist keeps the design's price and its
 *     button becomes "Check eligibility", pointing at /telehealth.
 *
 * Nothing that cannot be ordered is ever wired to the bag. And when the
 * catalogue has no vial at the strength the design drew (there is no 5 mg
 * Semaglutide) the card shows the strength and price of the product it will
 * actually add — a dose label that disagrees with the vial in the box is not a
 * fidelity question.
 */

import type { JxProduct } from '@/lib/jx/catalog'
import { formatUsd } from '@/lib/jx/catalog'
import type { BagLine } from '../JxStore'
import { REC_CARDS } from './copy'

export interface RecItem {
  key: string
  name: string
  /** "10 mg · vial" — the design's second line. */
  strength: string
  /** Short label printed on the vial artwork. */
  vialLabel: string
  priceLabel: string
  rating: number
  reviews: number
  accent: string
  /** Set when a live product backs this card; null routes to a consult. */
  line: BagLine | null
}

function formatDose(mg: number): string {
  return `${Number(mg.toFixed(2))} mg`
}

/**
 * Best live match for a designed card: the exact weekly dose at the shortest
 * supply, else the strongest single-dose vial of that molecule.
 */
function matchProduct(products: JxProduct[], molecule: string, doseMg: number): JxProduct | null {
  const singles = products
    .filter((p) => p.molecule === molecule && p.kind === 'standard' && p.doseMg != null)
    .sort((a, b) => a.supplyMonths - b.supplyMonths)

  return (
    singles.find((p) => p.doseMg === doseMg) ??
    [...singles].sort((a, b) => (b.doseMg ?? 0) - (a.doseMg ?? 0))[0] ??
    null
  )
}

export function resolveRecommended(products: JxProduct[]): RecItem[] {
  return REC_CARDS.map((card) => {
    const product = card.molecule ? matchProduct(products, card.molecule, card.doseMg) : null

    // The client wants the design's own dose and price on every card, so those
    // are what render — never the catalogue's.
    //
    // A card may therefore advertise something the catalogue does not sell at
    // that dose or that price (Tirzepatide 10 mg is $239 upstream, not $199;
    // there is no 5 mg Semaglutide vial at all). Wiring "Add to Cart" under a
    // figure we would not honour would mean charging a different price than
    // the one displayed, or shipping a different dose than the one named — so
    // a card only reaches the bag when the live product matches the design on
    // BOTH. Otherwise it becomes a "Check eligibility" consult link, exactly
    // like the four molecules the catalogue does not carry.
    //
    // /store remains the transactional surface and always shows real prices.
    const matchesDesign =
      product != null && product.doseMg === card.doseMg && product.price === card.designPrice

    return {
      key: card.name,
      name: card.name,
      strength: `${formatDose(card.doseMg)} · vial`,
      vialLabel: formatDose(card.doseMg),
      priceLabel: formatUsd(card.designPrice),
      rating: card.rating,
      reviews: card.reviews,
      accent: card.accent,
      line:
        matchesDesign && product
          ? {
              id: product.id,
              title: product.title,
              subtitle: product.subtitle,
              price: product.price,
              rawName: product.rawName,
            }
          : null,
    }
  })
}
