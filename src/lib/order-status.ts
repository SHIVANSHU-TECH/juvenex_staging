/**
 * Canonical order / fulfillment status taxonomies.
 *
 * Three independent state machines live on every `orders` row:
 *
 *   1. `status` — high-level lifecycle (pending → paid → shipped → fulfilled,
 *      with refunded / cancelled as terminal off-ramps). This is the column
 *      the admin LIST endpoint and OrdersTab filter on.
 *   2. `prescriberx_status` — fulfillment-side state for the PrescribeRx
 *      vendor handoff. Independent of `status` because an order can be
 *      `paid` while still `not_sent` to PrescribeRx.
 *   3. `payment_status` — payment-provider truth. Mostly mirrors `status`
 *      but kept separate so partial refunds / disputes don't muddle the
 *      lifecycle column.
 *
 * Every UI surface (admin list, fulfillment tab, order drawer) used to
 * declare its own copy of these tuples + variant maps. They drifted: e.g.
 * OrdersTab forgot `fulfilled`, and the drawer mapped `fulfilled` to the
 * `public` palette while OrderFulfillmentTab agreed but called it from a
 * separately maintained map. Centralising here removes that drift.
 *
 * Variant tokens come from `@/lib/admin-theme`'s `StatusVariant`, which is
 * the keyset of `STATUS_PALETTE` (the Tailwind class triples used by
 * StatusPill / StatusBadge). Do not invent new variant names here without
 * adding the corresponding palette entry in admin-theme.
 */
import type { StatusVariant } from '@/lib/admin-theme'

// ---------------------------------------------------------------------------
// Order lifecycle
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = [
  'pending',
  'paid',
  'shipped',
  'fulfilled',
  'refunded',
  'cancelled',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === 'string' &&
    (ORDER_STATUSES as ReadonlyArray<string>).includes(value)
  )
}

// ---------------------------------------------------------------------------
// PrescribeRx fulfillment lifecycle
// ---------------------------------------------------------------------------

export const PRESCRIBERX_STATUSES = [
  'not_sent',
  'sent',
  'confirmed',
  'failed',
] as const

export type PrescriberxStatus = (typeof PRESCRIBERX_STATUSES)[number]

export function isPrescriberxStatus(value: unknown): value is PrescriberxStatus {
  return (
    typeof value === 'string' &&
    (PRESCRIBERX_STATUSES as ReadonlyArray<string>).includes(value)
  )
}

// ---------------------------------------------------------------------------
// Payment provider state
// ---------------------------------------------------------------------------

export const PAYMENT_STATUSES = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
] as const

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    typeof value === 'string' &&
    (PAYMENT_STATUSES as ReadonlyArray<string>).includes(value)
  )
}

// ---------------------------------------------------------------------------
// UI variant maps
//
// `StatusVariant` is the keyset of STATUS_PALETTE in admin-theme. We map
// each domain-level status onto the palette token that best matches its
// semantic meaning, keeping the mappings frozen via `as const`.
// ---------------------------------------------------------------------------

export const ORDER_STATUS_VARIANT: Readonly<Record<OrderStatus, StatusVariant>> =
  {
    pending: 'pending',
    paid: 'paid',
    shipped: 'shipped',
    // `fulfilled` is the terminal happy-path; reuse the green `public` palette
    // so it reads as "complete" without inventing a new token.
    fulfilled: 'public',
    refunded: 'refunded',
    cancelled: 'cancelled',
  } as const

export const PRESCRIBERX_STATUS_VARIANT: Readonly<
  Record<PrescriberxStatus, StatusVariant>
> = {
  not_sent: 'pending',
  // `sent` reuses the blue `reviewed` palette — same visual semantic
  // ("submitted, waiting on counterparty") that reports use.
  sent: 'reviewed',
  confirmed: 'public',
  failed: 'cancelled',
} as const

/**
 * Resolve the StatusPill variant for a high-level order status. Falls back
 * to `pending` when the input is not a known status — this keeps legacy or
 * unexpected DB rows rendering instead of throwing in the table.
 */
export function statusVariant(status: string | null | undefined): StatusVariant {
  if (status && isOrderStatus(status)) return ORDER_STATUS_VARIANT[status]
  return 'pending'
}

/**
 * Resolve the StatusPill variant for the PrescribeRx fulfillment column.
 * Defaults to `pending` (i.e. `not_sent`) when the row is missing or the
 * value is unrecognised.
 */
export function prescriberXVariant(
  status: string | null | undefined
): StatusVariant {
  if (status && isPrescriberxStatus(status)) {
    return PRESCRIBERX_STATUS_VARIANT[status]
  }
  return 'pending'
}
