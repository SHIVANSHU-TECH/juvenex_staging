import type { Address, OrderItem } from './types'

// ---------------------------------------------------------------------------
// Status variants
//
// `statusVariant` and `prescriberXVariant` now live in `@/lib/order-status`
// alongside the canonical status tuples. They are re-exported here so that
// the drawer's section files can keep importing them from `./helpers`
// without churning every call site.
// ---------------------------------------------------------------------------

export { statusVariant, prescriberXVariant } from '@/lib/order-status'

// ---------------------------------------------------------------------------
// Type narrowing
// ---------------------------------------------------------------------------

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

// ---------------------------------------------------------------------------
// Address — checkout writes { street, apt, zip, name, phone } while older
// rows used { line1, line2, postal_code }. Normalise both shapes.
// ---------------------------------------------------------------------------

export interface NormalisedAddress {
  name: string
  street: string
  apt: string
  city: string
  state: string
  zip: string
  country: string
  phone: string
}

export function normaliseAddress(addr: unknown): NormalisedAddress | null {
  if (!isObject(addr)) return null
  const a = addr as Address
  const name = a.name ?? ''
  const street = a.street ?? a.line1 ?? ''
  const apt = a.apt ?? a.line2 ?? ''
  const city = a.city ?? ''
  const state = a.state ?? ''
  const zip = a.zip ?? a.postal_code ?? ''
  const country = a.country ?? ''
  const phone = a.phone ?? ''

  // If literally everything is empty there is no address to render.
  const hasAny = [name, street, apt, city, state, zip, country, phone].some(
    (v) => v.trim() !== ''
  )
  if (!hasAny) return null

  return { name, street, apt, city, state, zip, country, phone }
}

/** A stable string used to compare two addresses for "differs" detection. */
export function addressFingerprint(a: NormalisedAddress | null): string {
  if (!a) return ''
  return [a.name, a.street, a.apt, a.city, a.state, a.zip, a.country, a.phone]
    .map((p) => p.trim().toLowerCase())
    .join('|')
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export function itemDisplay(raw: unknown): {
  name: string
  qty: number
  priceCents: number
} {
  if (!isObject(raw)) return { name: 'Item', qty: 1, priceCents: 0 }
  const it = raw as OrderItem
  const name = it.name ?? it.title ?? 'Item'
  const qty = Number(it.quantity ?? it.qty ?? 1)
  const priceCents = Number(
    it.price_cents ?? it.unit_price_cents ?? (it.price ?? 0) * 100
  )
  return { name, qty, priceCents }
}
