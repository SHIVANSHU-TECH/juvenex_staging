/**
 * Derives `<JxVial>` artwork inputs from a bag line.
 *
 * `BagLine` (src/components/jx/JxStore.tsx) intentionally carries only what
 * checkout/order payloads need — id, title, subtitle, price, rawName — so it
 * has no `molecule`/`kind` for `accentFor` (src/lib/jx/catalog.ts) to key off.
 * Re-deriving those two from the raw upstream product name (already on the
 * line) is cheap and keeps the cart/checkout screens visually consistent with
 * the product grid without changing the store's line-item shape.
 */
import type { BagLine } from '@/components/jx/JxStore'
import { accentFor } from '@/lib/jx/catalog'

function inferMolecule(rawName: string): 'Semaglutide' | 'Tirzepatide' | null {
  const lower = rawName.toLowerCase()
  if (lower.includes('tirzepatide')) return 'Tirzepatide'
  if (lower.includes('semaglutide')) return 'Semaglutide'
  return null
}

function inferKind(rawName: string): 'standard' | 'maintenance' | 'titration' | 'starter' {
  const lower = rawName.toLowerCase()
  if (lower.includes('starter')) return 'starter'
  if (lower.includes('maint')) return 'maintenance'
  if (lower.includes('current glp')) return 'titration'
  if (/\bthen\b[\s\S]*\binject\b/i.test(rawName)) return 'titration'
  return 'standard'
}

export function accentForBagLine(line: BagLine): string {
  return accentFor({ molecule: inferMolecule(line.rawName), kind: inferKind(line.rawName) })
}

/** Short label for the vial artwork, e.g. "7.5 mg" — read off the cleaned title, not the raw name. */
export function doseLabelForBagLine(line: BagLine): string | undefined {
  const match = line.title.match(/([\d.]+)\s*mg\b/i)
  return match ? `${match[1]} mg` : undefined
}
