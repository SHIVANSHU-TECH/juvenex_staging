'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AdminOrder,
  AdminOrdersData,
  ApiEnvelope,
} from '@/lib/api-types'
import { formatMoney, formatRelative } from '@/lib/format'
import { prescriberXVariant, statusVariant } from '@/lib/order-status'
import StatusPill from './StatusPill'
import DataTable, { type Column } from './DataTable'
import OrderDetailDrawer from './OrderDetailDrawer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrdersResponse = ApiEnvelope<AdminOrdersData>

type FulfillmentFilter =
  | 'awaiting' // status='paid' AND prescriberx_status='not_sent'
  | 'sent'
  | 'fulfilled'
  | 'failed'
  | 'all'

interface FilterOption {
  value: FulfillmentFilter
  label: string
  /** Underlying `status` query param sent to the LIST endpoint. */
  status: '' | 'paid' | 'shipped' | 'fulfilled'
  /** Optional `prescriberx_status` server-side filter. */
  prescriberxStatus?: 'not_sent' | 'sent' | 'confirmed' | 'failed'
}

const FILTER_OPTIONS: ReadonlyArray<FilterOption> = [
  {
    value: 'awaiting',
    label: 'Paid - Awaiting Fulfillment',
    status: 'paid',
    prescriberxStatus: 'not_sent',
  },
  {
    value: 'sent',
    label: 'Sent to PrescribeRx',
    status: 'paid',
    prescriberxStatus: 'sent',
  },
  { value: 'fulfilled', label: 'Fulfilled', status: 'fulfilled' },
  {
    value: 'failed',
    label: 'Failed',
    status: 'paid',
    prescriberxStatus: 'failed',
  },
  { value: 'all', label: 'All recent', status: '' },
]

const PAGE_SIZE = 25

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

function itemsCount(items: unknown): number {
  return Array.isArray(items) ? items.length : 0
}

function matchesFilter(
  filter: FulfillmentFilter,
  order: AdminOrder
): boolean {
  // Server-side filter is authoritative for the awaiting / sent / failed
  // buckets — this client-side check exists purely as a defensive narrow in
  // case the API ever returns rows that don't match the requested filter.
  const status = order.prescriberx_status ?? 'not_sent'
  switch (filter) {
    case 'awaiting':
      return order.status === 'paid' && status === 'not_sent'
    case 'sent':
      return (
        order.status === 'paid' && (status === 'sent' || status === 'confirmed')
      )
    case 'fulfilled':
      return order.status === 'fulfilled'
    case 'failed':
      return status === 'failed'
    case 'all':
    default:
      return true
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const isProd =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'production'

function logDev(...args: unknown[]): void {
  // Keep dev signal but stay silent in prod — matches the drawer's policy and
  // satisfies the "no console.* in production code" rule.
  if (isProd) return
  // eslint-disable-next-line no-console
  console.error(...args)
}

export default function OrderFulfillmentTab() {
  const [filter, setFilter] = useState<FulfillmentFilter>('awaiting')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)

  const activeFilter = useMemo(
    () => FILTER_OPTIONS.find((o) => o.value === filter),
    [filter]
  )

  const loadOrders = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        page: String(page),
      })
      if (activeFilter?.status) params.set('status', activeFilter.status)
      if (activeFilter?.prescriberxStatus) {
        params.set('prescriberx_status', activeFilter.prescriberxStatus)
      }
      const res = await fetch(`/api/admin/orders?${params.toString()}`)
      const json = (await res.json()) as OrdersResponse
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'Failed to load orders')
        setOrders([])
        setTotal(0)
        return
      }
      setOrders(json.data.orders)
      setTotal(json.data.total)
    } catch (err) {
      logDev('OrderFulfillmentTab loadOrders failed', err)
      setError('Network error')
      setOrders([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [activeFilter, page])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Reset to page 1 when the filter changes.
  useEffect(() => {
    setPage(1)
  }, [filter])

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (q) {
        const hay =
          `${o.id} ${o.customer_email ?? ''} ${o.customer_name ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return matchesFilter(filter, o)
    })
  }, [orders, search, filter])

  const refreshAfterMutation = useCallback(() => {
    // After a PATCH closes/persists, refetch so server-truth wins.
    loadOrders()
  }, [loadOrders])

  const columns: Column<AdminOrder>[] = useMemo(
    () => [
      {
        key: 'id',
        header: 'Order',
        width: '7rem',
        render: (o) => (
          <span className="font-mono text-xs text-[#2D352C]">
            {shortId(o.id)}
          </span>
        ),
      },
      {
        key: 'date',
        header: 'Date',
        width: '7rem',
        render: (o) => (
          <span
            className="text-xs text-[#6B7568]"
            title={new Date(o.created_at).toLocaleString()}
          >
            {formatRelative(o.created_at)}
          </span>
        ),
      },
      {
        key: 'customer',
        header: 'Customer',
        render: (o) => (
          <span className="text-sm text-[#2D352C] truncate block max-w-[18rem]">
            {o.customer_email ?? o.customer_name ?? 'Unknown'}
          </span>
        ),
      },
      {
        key: 'items',
        header: 'Items',
        align: 'right',
        width: '4rem',
        render: (o) => (
          <span className="text-sm tabular-nums text-[#2D352C]">
            {itemsCount(o.items)}
          </span>
        ),
      },
      {
        key: 'total',
        header: 'Total',
        align: 'right',
        width: '7rem',
        render: (o) => (
          <span className="text-sm font-semibold text-[#2D352C] tabular-nums">
            {formatMoney(o.total_cents, o.currency)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '6.5rem',
        render: (o) => (
          <StatusPill variant={statusVariant(o.status)}>
            <span className="capitalize">{o.status}</span>
          </StatusPill>
        ),
      },
      {
        key: 'prx',
        header: 'PrescribeRx',
        width: '8rem',
        render: (o) => {
          const status = o.prescriberx_status ?? 'not_sent'
          return (
            <StatusPill variant={prescriberXVariant(status)}>
              <span className="capitalize">{status.replace('_', ' ')}</span>
            </StatusPill>
          )
        },
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '3rem',
        render: (o) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setOpenOrderId(o.id)
            }}
            aria-label="Open order details"
            className="h-7 px-2 inline-flex items-center justify-center rounded-md text-xs font-medium text-[var(--accent-strong)] hover:bg-[#E6EFE2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/40"
          >
            Open
          </button>
        ),
      },
    ],
    []
  )

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 pb-20">
      <header className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-[#2D352C]">
            Fulfillment
          </h1>
          <p className="text-sm text-[#6B7567] mt-1">
            Send paid orders to PrescribeRx and track shipment.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOrders}
          disabled={isLoading}
          className="h-9 px-3 inline-flex items-center gap-2 rounded-lg bg-white border border-[#E5EAE3] text-[#2D352C] text-sm hover:bg-[#F5F8F3] disabled:opacity-50"
        >
          <svg
            className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 10a7 7 0 0 1 12-5l2 2" />
            <path d="M17 4v4h-4" />
            <path d="M17 10a7 7 0 0 1-12 5l-2-2" />
            <path d="M3 16v-4h4" />
          </svg>
          Refresh
        </button>
      </header>

      <FilterBar
        filter={filter}
        onChange={setFilter}
        search={search}
        onSearch={setSearch}
      />

      <div className="bg-white border border-[#E5EAE3] rounded-2xl overflow-hidden shadow-sm">
        {error ? (
          <div className="p-6 text-sm text-red-600" role="alert">
            {error}
          </div>
        ) : (
          <DataTable<AdminOrder>
            data={filteredOrders}
            columns={columns}
            rowKey={(o) => o.id}
            loading={isLoading}
            onRowClick={(o) => setOpenOrderId(o.id)}
            emptyMessage={
              <div className="flex flex-col items-center gap-2">
                <p>No orders match this view.</p>
                {(search || filter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('')
                      setFilter('all')
                    }}
                    className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
                  >
                    Show all recent orders
                  </button>
                )}
              </div>
            }
          />
        )}

        {!isLoading && !error && total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-t border-[#E5EAE3] text-xs text-[#6B7568]">
            <span className="tabular-nums">
              Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of{' '}
              {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-7 px-2 rounded-md border border-[#E5EAE3] bg-white text-[#2D352C] hover:bg-[#F5F8F3] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="px-2 tabular-nums">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-7 px-2 rounded-md border border-[#E5EAE3] bg-white text-[#2D352C] hover:bg-[#F5F8F3] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <OrderDetailDrawer
        orderId={openOrderId}
        onClose={() => setOpenOrderId(null)}
        onMutated={() => refreshAfterMutation()}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilterBar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  filter: FulfillmentFilter
  onChange: (f: FulfillmentFilter) => void
  search: string
  onSearch: (v: string) => void
}

function FilterBar({ filter, onChange, search, onSearch }: FilterBarProps) {
  return (
    <div className="space-y-3 mb-5">
      <div
        role="tablist"
        aria-label="Fulfillment filter"
        className="flex flex-wrap gap-1.5"
      >
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-[var(--accent-strong)] text-white border-[var(--accent-strong)]'
                  : 'bg-white text-[#2D352C] border-[#E5EAE3] hover:bg-[#F5F8F3]'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <label className="relative block max-w-md">
        <span className="sr-only">Search orders</span>
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7568]"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="9" r="6" />
          <path d="m17 17-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by order ID or customer email"
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-white border border-[#E5EAE3] text-sm placeholder:text-[#6B7568]/70 text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent-strong)]/30"
        />
      </label>
    </div>
  )
}
