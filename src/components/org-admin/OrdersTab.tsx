'use client'

// TODO: extract a shared admin-shared/OrdersTable that accepts an
// `endpoint` or `orgId?` prop so super_admin and org_admin surfaces render
// the same UI. Until then this file is org-scoped.

import { useCallback, useEffect, useState } from 'react'
import type { ApiEnvelope, AdminOrder, AdminOrdersData } from '@/lib/api-types'
import { formatMoney } from '@/lib/format'

type Order = AdminOrder

const STATUS_OPTIONS = [
  '',
  'pending',
  'paid',
  'shipped',
  'refunded',
  'cancelled',
] as const

interface OrdersTabProps {
  slug: string
  accentColor: string
}

export default function OrdersTab({ slug, accentColor }: OrdersTabProps) {
  const [orders, setOrders] = useState<Order[]>([])
  const [status, setStatus] = useState<string>('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      params.set('page', String(page))
      params.set('limit', '25')
      const res = await fetch(
        `/api/org/${encodeURIComponent(slug)}/admin/orders?${params}`
      )
      const json = (await res.json()) as ApiEnvelope<AdminOrdersData>
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'Failed to load orders')
        setOrders([])
        return
      }
      setOrders(json.data.orders)
      setHasMore(Boolean(json.data.hasMore))
      setTotal(Number(json.data.total ?? 0))
    } catch (err) {
      console.error('OrdersTab load failed', err)
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [slug, status, page])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-sm text-[#2D352C]/70">
          Status:
          <select
            value={status}
            onChange={(e) => {
              setPage(1)
              setStatus(e.target.value)
            }}
            className="px-3 py-2 bg-white border border-[#E5EAE3] rounded-xl text-[#2D352C]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s || 'All'}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-[#2D352C]/60">{total} total</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-[#FAF9F6]/80 border border-[#E5EAE3] rounded-3xl overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-[#2D352C]/60">Loading orders…</p>
        ) : orders.length === 0 ? (
          <p className="p-6 text-sm text-[#2D352C]/60">No orders found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/60 text-left text-[#2D352C]/60">
              <tr>
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAE3]">
              {orders.map((o) => (
                <tr key={o.id} className="text-[#2D352C]">
                  <td className="px-4 py-3 font-mono text-xs">
                    {o.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <div>{o.customer_name ?? '—'}</div>
                    <div className="text-xs text-[#2D352C]/50">
                      {o.customer_email ?? '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${accentColor}22`,
                        color: accentColor,
                      }}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatMoney(o.total_cents, o.currency)}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#2D352C]/60">
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
          className="px-4 py-2 rounded-xl border border-[#E5EAE3] text-sm disabled:opacity-50"
        >
          Previous
        </button>
        <p className="text-sm text-[#2D352C]/60">Page {page}</p>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore || loading}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: accentColor }}
        >
          Next
        </button>
      </div>
    </div>
  )
}
