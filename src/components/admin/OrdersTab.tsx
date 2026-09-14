'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AdminOrder,
  AdminOrdersData,
  ApiEnvelope,
} from '@/lib/api-types'
import { formatMoney, formatRelative } from '@/lib/format'
import { statusVariant } from '@/lib/order-status'
import StatusPill from './StatusPill'
import DataTable, { type Column } from './DataTable'

type OrdersResponse = ApiEnvelope<AdminOrdersData>

// Filterable subset of order statuses. `fulfilled` is intentionally omitted
// here — the dedicated Fulfillment tab handles that bucket.
type StatusFilterValue =
  | ''
  | 'pending'
  | 'paid'
  | 'shipped'
  | 'refunded'
  | 'cancelled'

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilterValue; label: string }> = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'cancelled', label: 'Cancelled' },
]

type DateRange = 'all' | 'month' | 'last30' | 'last7'

const DATE_RANGES: ReadonlyArray<{ value: DateRange; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'month', label: 'This month' },
  { value: 'last30', label: 'Last 30d' },
  { value: 'last7', label: 'Last 7d' },
]

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function rangeStartIso(range: DateRange): string | null {
  const now = new Date()
  if (range === 'all') return null
  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  }
  const days = range === 'last30' ? 30 : 7
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function CustomerCell({ order }: { order: AdminOrder }) {
  const display =
    order.customer_name?.trim() || order.customer_email || 'Unknown customer'
  const email = order.customer_email
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-full bg-[#E6EFE2] text-[var(--accent-strong)] flex items-center justify-center text-xs font-semibold">
        {initialsOf(display)}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#2D352C] truncate">{display}</p>
        {email && (
          <p className="text-xs text-[#6B7568] truncate">{email}</p>
        )}
      </div>
    </div>
  )
}

interface OrderDetailPanelProps {
  order: AdminOrder
}

function OrderDetailPanel({ order }: OrderDetailPanelProps) {
  return (
    <div className="bg-[#F5F8F3]/80 border-y border-[#E5EAE3] px-6 py-5">
      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7568] mb-2">
            Items
          </p>
          <pre className="text-xs leading-relaxed text-[#2D352C] bg-white border border-[#E5EAE3] rounded-lg p-3 overflow-x-auto max-h-72">
            {JSON.stringify(order.items, null, 2)}
          </pre>
        </div>
        <dl className="text-xs space-y-2 md:min-w-[18rem]">
          <div>
            <dt className="font-semibold uppercase tracking-wider text-[#6B7568]">
              Order ID
            </dt>
            <dd className="font-mono break-all text-[#2D352C]">{order.id}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-[#6B7568]">
              Customer ID
            </dt>
            <dd className="font-mono break-all text-[#2D352C]">{order.user_id}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-[#6B7568]">
              Created
            </dt>
            <dd className="text-[#2D352C]">
              {new Date(order.created_at).toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadOrdersCsv(orders: AdminOrder[]): void {
  const headers = [
    'order_id',
    'created_at',
    'customer_name',
    'customer_email',
    'status',
    'payment_status',
    'prescriberx_status',
    'prescriberx_reference',
    'total',
    'currency',
    'fulfilled_at',
  ]
  const rows = orders.map((o) => [
    o.id,
    o.created_at,
    o.customer_name ?? '',
    o.customer_email ?? '',
    o.status,
    o.payment_status ?? '',
    o.prescriberx_status ?? '',
    o.prescriberx_reference ?? '',
    (o.total_cents / 100).toFixed(2),
    o.currency,
    o.fulfilled_at ?? '',
  ])
  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function HeaderActions({
  onRefresh,
  isLoading,
  orders,
}: {
  onRefresh: () => void
  isLoading: boolean
  orders: AdminOrder[]
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onRefresh}
        disabled={isLoading}
        aria-label="Refresh orders"
        title="Refresh"
        className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white border border-[#E5EAE3] text-[#2D352C] hover:bg-[#F5F8F3] disabled:opacity-50"
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
      </button>
      <button
        type="button"
        onClick={() => downloadOrdersCsv(orders)}
        disabled={orders.length === 0}
        title={orders.length === 0 ? 'No orders to export' : `Export ${orders.length} orders to CSV`}
        className="h-9 inline-flex items-center gap-2 px-3 rounded-lg bg-white border border-[#E5EAE3] text-[#2D352C] text-sm hover:bg-[#F5F8F3] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 3v10" />
          <path d="m6 9 4 4 4-4" />
          <path d="M4 17h12" />
        </svg>
        Export CSV
      </button>
    </div>
  )
}

export default function OrdersTab() {
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState<PageSize>(25)
  const [page, setPage] = useState(1)
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        page: String(page),
      })
      if (statusFilter) params.set('status', statusFilter)
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
      console.error('OrdersTab loadOrders failed', err)
      setError('Network error')
      setOrders([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, pageSize, page])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1)
  }, [statusFilter, pageSize, dateRange, search])

  const filteredOrders = useMemo(() => {
    const start = rangeStartIso(dateRange)
    const startMs = start ? new Date(start).getTime() : null
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (startMs !== null && new Date(o.created_at).getTime() < startMs) {
        return false
      }
      if (q) {
        const hay = `${o.id} ${o.customer_email ?? ''} ${o.customer_name ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [orders, dateRange, search])

  const hasActiveFilters =
    Boolean(statusFilter) || dateRange !== 'all' || search.trim().length > 0

  const clearFilters = () => {
    setStatusFilter('')
    setDateRange('all')
    setSearch('')
  }

  const columns: Column<AdminOrder>[] = useMemo(
    () => [
      {
        key: 'id',
        header: 'Order',
        width: '8rem',
        render: (o) => (
          <span className="font-mono text-xs text-[#2D352C]">{shortId(o.id)}</span>
        ),
      },
      {
        key: 'customer',
        header: 'Customer',
        render: (o) => <CustomerCell order={o} />,
      },
      {
        key: 'total',
        header: 'Total',
        align: 'right',
        width: '8rem',
        render: (o) => (
          <span className="text-sm font-semibold text-[#2D352C] tabular-nums">
            {formatMoney(o.total_cents, o.currency)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '7rem',
        render: (o) => (
          <StatusPill variant={statusVariant(o.status)}>
            <span className="capitalize">{o.status}</span>
          </StatusPill>
        ),
      },
      {
        key: 'date',
        header: 'Date',
        width: '8rem',
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
        key: 'actions',
        header: '',
        align: 'right',
        width: '3rem',
        render: (o) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setOpenOrderId((prev) => (prev === o.id ? null : o.id))
            }}
            aria-label={openOrderId === o.id ? 'Hide details' : 'View details'}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-[#6B7568] hover:bg-[#E6EFE2] hover:text-[#2D352C]"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="4" cy="10" r="1.5" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="16" cy="10" r="1.5" />
            </svg>
          </button>
        ),
      },
    ],
    [openOrderId]
  )

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 pb-20">
      <header className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-[#2D352C]">Orders</h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#E6EFE2] text-[var(--accent-strong)]">
            {total}
          </span>
        </div>
        <HeaderActions onRefresh={loadOrders} isLoading={isLoading} orders={orders} />
      </header>

      {/* Filter row */}
      <div className="space-y-3 mb-5">
        <div
          role="tablist"
          aria-label="Order status filter"
          className="flex flex-wrap gap-1.5"
        >
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value
            return (
              <button
                key={f.value || 'all'}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-[var(--accent-strong)] text-white border-[var(--accent-strong)]'
                    : 'bg-white text-[#2D352C] border-[#E5EAE3] hover:bg-[#F5F8F3]'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div
            role="tablist"
            aria-label="Date range filter"
            className="inline-flex rounded-full border border-[#E5EAE3] bg-white p-0.5"
          >
            {DATE_RANGES.map((r) => {
              const active = dateRange === r.value
              return (
                <button
                  key={r.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setDateRange(r.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[#E6EFE2] text-[var(--accent-strong)]'
                      : 'text-[#6B7568] hover:text-[#2D352C]'
                  }`}
                >
                  {r.label}
                </button>
              )
            })}
          </div>

          <label className="relative flex-1 min-w-[14rem] max-w-md">
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order ID or customer email"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-white border border-[#E5EAE3] text-sm placeholder:text-[#6B7568]/70 text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent-strong)]/30"
            />
          </label>
        </div>
      </div>

      {/* Table */}
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
            onRowClick={(o) =>
              setOpenOrderId((prev) => (prev === o.id ? null : o.id))
            }
            rowClassName={(o) =>
              openOrderId === o.id ? 'bg-[#F5F8F3]' : ''
            }
            emptyMessage={
              <div className="flex flex-col items-center gap-3">
                <svg
                  className="h-10 w-10 text-[#6B7568]/60"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 7h12l-1.4 11.2a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8L6 7Z" />
                  <path d="M9 7V5a3 3 0 0 1 6 0v2" />
                </svg>
                <p>
                  {hasActiveFilters
                    ? 'No orders match your filters.'
                    : 'No orders yet.'}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            }
          />
        )}

        {/* Inline expanded detail panel rendered below the table for the
            currently open order. Sits inside the same card so visual
            grouping is preserved. */}
        {openOrderId && (() => {
          const open = filteredOrders.find((o) => o.id === openOrderId)
          if (!open) return null
          return <OrderDetailPanel order={open} />
        })()}

        {/* Pagination footer */}
        {!isLoading && !error && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white border-t border-[#E5EAE3] text-xs text-[#6B7568]">
            <div className="flex items-center gap-3">
              <span className="tabular-nums">
                Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of{' '}
                {total.toLocaleString()}
              </span>
              <label className="inline-flex items-center gap-1.5">
                <span>Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) =>
                    setPageSize(Number(e.target.value) as PageSize)
                  }
                  className="h-7 rounded-md border border-[#E5EAE3] bg-white px-1.5 text-xs text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent-strong)]/30"
                >
                  {PAGE_SIZE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
    </div>
  )
}
