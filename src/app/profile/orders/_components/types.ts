// Shared types for /profile/orders.
//
// These mirror the shape the patient-facing GET /api/orders endpoint returns.
// We keep them local to the orders surface so the rest of the app does not
// pin against the patient-list schema (admin endpoints have their own,
// richer types in src/app/api/admin/orders).

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'shipped'
  | 'fulfilled'
  | 'refunded'
  | 'cancelled'

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'

export type PrescribeRxStatus = 'not_sent' | 'sent' | 'confirmed' | 'failed'

export interface OrderItem {
  product_id: string
  name: string
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  /** 'membership' marks a membership purchase line (see membership-checkout). */
  kind?: string
  /** Membership line only: purchased tier slug. */
  plan?: string
  /** Membership line only: true when auto-billed monthly by the provider. */
  recurring?: boolean
  /** Membership line only: peptide slugs the membership unlocks. */
  selected_protocols?: string[]
}

/**
 * Reconciled money view of an order, so Items / Total / Payment always tell one
 * story. Line items carry LIST prices (`line_total_cents`); the order
 * `total_cents` is what was actually charged. They differ when a promo/coupon
 * comped the membership (list $179, charged $0) — `discountCents` bridges the
 * gap so the displayed lines sum to the total. Invariant (asserted in tests):
 *   lineSumCents - discountCents === totalCents
 */
export interface OrderMoneySummary {
  lineSumCents: number
  totalCents: number
  /** List total − charged total, clamped ≥ 0 (a comp/discount). */
  discountCents: number
  /** True when a membership line was granted at $0 (promo/coupon comp). */
  comped: boolean
  /** True when the membership auto-renews (recurring subscription). */
  recurring: boolean
  /** Whether the displayed lines reconcile exactly to the charged total. */
  reconciles: boolean
}

export function orderMoneySummary(
  items: unknown,
  totalCents: number
): OrderMoneySummary {
  const list = normalizeOrderItems(items)
  const lineSumCents = list.reduce((sum, i) => sum + i.line_total_cents, 0)
  const total = Number.isFinite(totalCents) ? totalCents : 0
  const discountCents = Math.max(0, lineSumCents - total)
  const membership = list.find((i) => i.kind === 'membership') ?? null
  return {
    lineSumCents,
    totalCents: total,
    discountCents,
    comped: membership !== null && total === 0,
    recurring: membership?.recurring === true,
    reconciles: lineSumCents - discountCents === total,
  }
}

/**
 * Coerce a possibly-malformed `items` value into a clean OrderItem[]. The list
 * endpoint types `items` as `unknown` (it's a jsonb column), and a corrupted or
 * legacy row could carry a non-array, a stringified array, or entries missing
 * fields. Everything downstream (cards, detail, money math) goes through this so
 * a bad row degrades to a well-formed-but-empty card instead of throwing during
 * render and blanking the whole list.
 */
export function normalizeOrderItems(items: unknown): OrderItem[] {
  let arr: unknown = items
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter((raw): raw is Record<string, unknown> => !!raw && typeof raw === 'object')
    .map((raw) => {
      const num = (v: unknown): number =>
        typeof v === 'number' && Number.isFinite(v) ? v : 0
      return {
        product_id: typeof raw.product_id === 'string' ? raw.product_id : '',
        name: typeof raw.name === 'string' && raw.name ? raw.name : 'Item',
        quantity: num(raw.quantity) || 1,
        unit_price_cents: num(raw.unit_price_cents),
        line_total_cents: num(raw.line_total_cents),
        kind: typeof raw.kind === 'string' ? raw.kind : undefined,
        plan: typeof raw.plan === 'string' ? raw.plan : undefined,
        recurring: raw.recurring === true,
        selected_protocols: Array.isArray(raw.selected_protocols)
          ? raw.selected_protocols.filter((p): p is string => typeof p === 'string')
          : undefined,
      }
    })
}

/**
 * The membership line item on an order, or null for product orders. A
 * membership grants app access instantly on payment — nothing ships and it
 * never goes to PrescribeRx, so fulfillment UI must not apply to it.
 * Accepts `unknown` and normalizes, so a corrupt `items` value can't throw.
 */
export function membershipItemOf(items: unknown): OrderItem | null {
  return normalizeOrderItems(items).find((item) => item.kind === 'membership') ?? null
}

export interface OrderListEntry {
  id: string
  status: OrderStatus
  total_cents: number
  currency: string
  items: OrderItem[]
  payment_status: PaymentStatus | null
  prescriberx_status: PrescribeRxStatus | null
  prescriberx_reference: string | null
  created_at: string
  fulfilled_at: string | null
}

export interface ShippingAddress {
  name?: string
  street: string
  apt?: string
  city: string
  state: string
  zip: string
  country: string
  phone?: string
}

export interface OrderDetail extends OrderListEntry {
  shipping_address: ShippingAddress | null
  billing_address: ShippingAddress | null
  intake_answers: Record<string, unknown> | null
  contact_email: string | null
  contact_phone: string | null
  payment_provider: string | null
  prescriberx_sent_at: string | null
}

export function shortOrderId(id: string): string {
  // Last 8 chars of the UUID, uppercased — matches admin convention.
  return id.replace(/-/g, '').slice(-8).toUpperCase()
}

export function formatMoneyCents(cents: number, currency: string): string {
  const safeCents = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
    }).format(safeCents / 100)
  } catch {
    // Bad currency code from a corrupted row — fall back to a plain dollar
    // string rather than throwing in the UI.
    return `$${(safeCents / 100).toFixed(2)}`
  }
}

export function formatRelativeDate(iso: string): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const now = Date.now()
  const diffMs = now - then.getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.round(days / 365)
  return `${years}y ago`
}

export function formatAbsoluteDate(iso: string): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return iso
  return then.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Maps a status to the ordered checkpoint index in the timeline:
// 0 Pending, 1 Paid, 2 Sent to PrescribeRx, 3 Fulfilled.
// Cancelled / refunded are surfaced as their own badge instead of a step.
export function timelineStepIndex(
  status: OrderStatus,
  prescriberx: PrescribeRxStatus | null
): number {
  if (status === 'fulfilled') return 3
  if (status === 'shipped') return 3
  if (prescriberx === 'sent' || prescriberx === 'confirmed') return 2
  if (status === 'paid') return 1
  return 0
}

export interface OrdersListResponse {
  success: boolean
  data?: {
    orders: OrderListEntry[]
  }
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}

export interface OrderDetailResponse {
  success: boolean
  data?: {
    order: OrderDetail
  }
  error?: string
}
