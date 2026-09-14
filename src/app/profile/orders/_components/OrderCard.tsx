'use client'

import Link from 'next/link'

import {
  MembershipAccessBadge,
  OrderStatusBadge,
  PrescribeRxStatusBadge,
} from './StatusBadge'
import {
  formatAbsoluteDate,
  formatMoneyCents,
  formatRelativeDate,
  membershipItemOf,
  normalizeOrderItems,
  shortOrderId,
  type OrderListEntry,
} from './types'

interface OrderCardProps {
  order: OrderListEntry
}

export default function OrderCard({ order }: OrderCardProps) {
  // Normalize first: a corrupt/legacy `items` value must degrade to an empty
  // list, never throw and blank the whole orders page.
  const items = normalizeOrderItems(order.items)
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const firstItem = items[0]
  const remainingItems = Math.max(0, items.length - 1)
  const itemSummary = firstItem
    ? remainingItems > 0
      ? `${firstItem.name} +${remainingItems} more`
      : firstItem.name
    : 'No items'

  const relative = formatRelativeDate(order.created_at)
  const absolute = formatAbsoluteDate(order.created_at)
  const membership = membershipItemOf(order.items)
  const isPaid =
    order.status === 'paid' ||
    order.status === 'fulfilled' ||
    order.payment_status === 'succeeded'

  return (
    <Link
      href={`/profile/orders/${order.id}`}
      className="block bg-white rounded-2xl border border-[#E5EAE3] shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-shadow p-4"
      aria-label={`Order ${shortOrderId(order.id)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8B9B83]">
            Order #{shortOrderId(order.id)}
          </p>
          <p className="mt-0.5 text-sm text-[#6B7567]">
            <time
              dateTime={order.created_at}
              title={absolute}
              className="cursor-default"
            >
              {relative}
            </time>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <OrderStatusBadge status={order.status} />
          <p className="text-base font-bold text-[#2D352C]">
            {formatMoneyCents(order.total_cents, order.currency)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {membership ? (
          <MembershipAccessBadge paid={isPaid} />
        ) : (
          <PrescribeRxStatusBadge status={order.prescriberx_status} />
        )}
        <span className="text-xs text-[#6B7567]">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      <p className="mt-2 text-sm text-[#2D352C] truncate" title={itemSummary}>
        {itemSummary}
      </p>
    </Link>
  )
}
