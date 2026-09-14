'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import BottomNav from '@/components/BottomNav'
import BrandLogo from '@/components/BrandLogo'
import { useAuth } from '@/lib/auth-context'

import OrderCard from './_components/OrderCard'
import type {
  OrderListEntry,
  OrdersListResponse,
} from './_components/types'

const PAGE_LIMIT = 20

interface LoadState {
  loading: boolean
  error: string | null
  orders: OrderListEntry[]
  page: number
  hasMore: boolean
  total: number
}

const INITIAL_STATE: LoadState = {
  loading: true,
  error: null,
  orders: [],
  page: 0,
  hasMore: true,
  total: 0,
}

export default function ProfileOrdersPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [state, setState] = useState<LoadState>(INITIAL_STATE)
  const [loadingMore, setLoadingMore] = useState(false)

  // Redirect unauthenticated users.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Fetch a page of orders. Returns the parsed result; caller decides what
  // to do with it. Pure I/O — no setState — so it's safe to call from inside
  // an effect body without tripping the React 19 set-state-in-effect rule.
  const fetchOrdersPage = useCallback(
    async (
      pageToLoad: number,
      signal: AbortSignal
    ): Promise<
      | { ok: true; orders: OrderListEntry[]; total: number; page: number }
      | { ok: false; error: string }
    > => {
      const url = `/api/orders?page=${pageToLoad}&limit=${PAGE_LIMIT}`
      try {
        const res = await fetch(url, { signal })
        if (!res.ok) {
          return {
            ok: false,
            error:
              res.status === 401
                ? 'Please sign in again to view your orders.'
                : 'Could not load your orders. Please try again.',
          }
        }
        const json = (await res.json()) as OrdersListResponse
        if (!json.success || !json.data) {
          return {
            ok: false,
            error: json.error ?? 'Could not load your orders.',
          }
        }
        const fetched = json.data.orders ?? []
        return {
          ok: true,
          orders: fetched,
          total: json.meta?.total ?? fetched.length,
          page: pageToLoad,
        }
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'AbortError') {
          return { ok: false, error: '__aborted__' }
        }
        console.error('orders list fetch failed', err)
        return {
          ok: false,
          error: 'Could not load your orders. Please try again.',
        }
      }
    },
    []
  )

  // Initial load. The effect body itself only schedules an async function;
  // setState happens *after* the first await, which is the React 19 rule.
  useEffect(() => {
    if (!isAuthenticated) return
    const controller = new AbortController()
    const run = async () => {
      const result = await fetchOrdersPage(1, controller.signal)
      if (controller.signal.aborted) return
      if (!result.ok) {
        if (result.error === '__aborted__') return
        setState({
          loading: false,
          error: result.error,
          orders: [],
          page: 0,
          hasMore: false,
          total: 0,
        })
        return
      }
      setState({
        loading: false,
        error: null,
        orders: result.orders,
        page: result.page,
        hasMore: result.orders.length < result.total && result.orders.length > 0,
        total: result.total,
      })
    }
    void run()
    return () => controller.abort()
  }, [isAuthenticated, fetchOrdersPage])

  // Event handlers run outside the effect tree, so they can call setState
  // synchronously without tripping react-hooks/set-state-in-effect.
  const handleLoadMore = async () => {
    if (loadingMore || !state.hasMore) return
    setLoadingMore(true)
    const controller = new AbortController()
    const result = await fetchOrdersPage(state.page + 1, controller.signal)
    if (result.ok) {
      setState((prev) => {
        const combined = [...prev.orders, ...result.orders]
        return {
          loading: false,
          error: null,
          orders: combined,
          page: result.page,
          hasMore: combined.length < result.total && result.orders.length > 0,
          total: result.total,
        }
      })
    } else if (result.error !== '__aborted__') {
      setState((prev) => ({ ...prev, error: result.error, hasMore: false }))
    }
    setLoadingMore(false)
  }

  const handleRetry = async () => {
    setState({
      loading: true,
      error: null,
      orders: [],
      page: 0,
      hasMore: true,
      total: 0,
    })
    const controller = new AbortController()
    const result = await fetchOrdersPage(1, controller.signal)
    if (result.ok) {
      setState({
        loading: false,
        error: null,
        orders: result.orders,
        page: result.page,
        hasMore:
          result.orders.length < result.total && result.orders.length > 0,
        total: result.total,
      })
    } else if (result.error !== '__aborted__') {
      setState({
        loading: false,
        error: result.error,
        orders: [],
        page: 0,
        hasMore: false,
        total: 0,
      })
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading orders</span>
          <div
            aria-hidden="true"
            className="w-8 h-8 border-4 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin"
          />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const showEmptyState =
    !state.loading && !state.error && state.orders.length === 0

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] shadow-xl">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/profile"
              aria-label="Back to profile"
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#EEF1ED] hover:bg-[#E2E7E0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
            >
              <svg
                aria-hidden="true"
                className="w-5 h-5 text-[#6B7567]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <BrandLogo size={36} className="rounded-lg shadow object-contain bg-white p-0.5" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-[#2D352C] truncate">
                  My Orders
                </h1>
                {!state.loading && (
                  <p className="text-xs text-[var(--accent)]">
                    {state.total === 0
                      ? 'No orders yet'
                      : state.total === 1
                        ? '1 order'
                        : `${state.total} orders`}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="px-4 py-4">
        {state.loading && (
          <div className="space-y-3" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-4 animate-pulse h-28"
              />
            ))}
          </div>
        )}

        {state.error && (
          <div
            className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700"
            role="alert"
          >
            <p>{state.error}</p>
            <button
              type="button"
              onClick={() => {
                void handleRetry()
              }}
              className="mt-2 text-red-700 font-semibold underline"
            >
              Try again
            </button>
          </div>
        )}

        {showEmptyState && (
          <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[#EEF1ED] flex items-center justify-center mb-3">
              <svg
                aria-hidden="true"
                className="w-7 h-7 text-[#8B9B83]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <h2 className="text-base font-bold text-[#2D352C]">
              No orders yet
            </h2>
            <p className="mt-1 text-sm text-[#6B7567]">
              When you place an order it will appear here.
            </p>
            <Link
              href="/store"
              className="inline-flex items-center justify-center mt-4 px-5 py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] text-white font-semibold shadow-md shadow-[var(--accent-strong)]/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-shadow"
            >
              Browse Shop
            </Link>
          </div>
        )}

        {!state.loading && !state.error && state.orders.length > 0 && (
          <div className="space-y-3">
            {state.orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
            {state.hasMore && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full py-3 min-h-[44px] rounded-xl bg-white border border-[#E5EAE3] text-[#2D352C] font-semibold shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-shadow"
              >
                {loadingMore ? 'Loading…' : 'Load more orders'}
              </button>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
