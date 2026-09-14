'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import BottomNav from '@/components/BottomNav'
import BrandLogo from '@/components/BrandLogo'
import { useAuth } from '@/lib/auth-context'

import { peptideName } from '@/lib/shop-quiz'
import { tierForPlan } from '@/lib/marketplace-access'

import IntakeSummary from '../_components/IntakeSummary'
import OrderTimeline from '../_components/OrderTimeline'
import {
  MembershipAccessBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  PrescribeRxStatusBadge,
} from '../_components/StatusBadge'
import {
  formatAbsoluteDate,
  formatMoneyCents,
  membershipItemOf,
  normalizeOrderItems,
  orderMoneySummary,
  shortOrderId,
  type OrderDetail,
  type OrderDetailResponse,
  type OrderItem,
  type ShippingAddress,
} from '../_components/types'

interface FetchState {
  loading: boolean
  notFound: boolean
  error: string | null
  order: OrderDetail | null
}

const INITIAL_STATE: FetchState = {
  loading: true,
  notFound: false,
  error: null,
  order: null,
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default function ProfileOrderDetailPage({ params }: PageProps) {
  // Next 15 passes params as a promise; unwrap with React.use().
  const { id } = use(params)
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [state, setState] = useState<FetchState>(INITIAL_STATE)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Pure I/O — no setState — so it's safe to call from inside an effect.
  // setState happens after the await in the caller.
  const fetchOrder = useCallback(
    async (
      signal: AbortSignal
    ): Promise<
      | { kind: 'ok'; order: OrderDetail }
      | { kind: 'not-found' }
      | { kind: 'error'; message: string }
      | { kind: 'aborted' }
    > => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
          signal,
        })
        if (res.status === 404 || res.status === 403) {
          return { kind: 'not-found' }
        }
        if (!res.ok) {
          return {
            kind: 'error',
            message:
              res.status === 401
                ? 'Please sign in again to view this order.'
                : 'Could not load this order. Please try again.',
          }
        }
        const json = (await res.json()) as OrderDetailResponse
        if (!json.success || !json.data?.order) {
          return {
            kind: 'error',
            message: json.error ?? 'Could not load this order.',
          }
        }
        return { kind: 'ok', order: json.data.order }
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'AbortError') {
          return { kind: 'aborted' }
        }
        console.error('order detail fetch failed', err)
        return {
          kind: 'error',
          message: 'Could not load this order. Please try again.',
        }
      }
    },
    [id]
  )

  useEffect(() => {
    if (!isAuthenticated) return
    const controller = new AbortController()
    const run = async () => {
      const result = await fetchOrder(controller.signal)
      if (controller.signal.aborted || result.kind === 'aborted') return
      if (result.kind === 'ok') {
        setState({
          loading: false,
          notFound: false,
          error: null,
          order: result.order,
        })
      } else if (result.kind === 'not-found') {
        setState({
          loading: false,
          notFound: true,
          error: null,
          order: null,
        })
      } else {
        setState({
          loading: false,
          notFound: false,
          error: result.message,
          order: null,
        })
      }
    }
    void run()
    return () => controller.abort()
  }, [isAuthenticated, fetchOrder])

  // Event handler — runs outside the effect tree, so the synchronous
  // setState here is fine.
  const handleRetry = async () => {
    setState(INITIAL_STATE)
    const controller = new AbortController()
    const result = await fetchOrder(controller.signal)
    if (result.kind === 'ok') {
      setState({
        loading: false,
        notFound: false,
        error: null,
        order: result.order,
      })
    } else if (result.kind === 'not-found') {
      setState({
        loading: false,
        notFound: true,
        error: null,
        order: null,
      })
    } else if (result.kind === 'error') {
      setState({
        loading: false,
        notFound: false,
        error: result.message,
        order: null,
      })
    }
  }

  if (authLoading || (state.loading && !state.error)) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading order</span>
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

  if (state.notFound) {
    return <NotFoundView />
  }

  if (state.error || !state.order) {
    return (
      <ErrorView
        message={state.error ?? 'Could not load this order.'}
        onRetry={() => {
          void handleRetry()
        }}
      />
    )
  }

  return <OrderDetailView order={state.order} />
}

// ---------------------------------------------------------------------------
// View: success
// ---------------------------------------------------------------------------

function OrderDetailView({ order }: { order: OrderDetail }) {
  // "Contact support" must open an actual conversation with the care team, not
  // dump the member on their (often empty) inbox — which read as "goes nowhere".
  // Resolve the support thread and deep-link to it, pre-filled with this order,
  // falling back to the inbox only if the resolver fails.
  const [supportHref, setSupportHref] = useState('/messages')
  useEffect(() => {
    let cancelled = false
    fetch('/api/messages/support')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const id = j?.data?.id
        if (!cancelled && j?.success && id) {
          const msg = `Hi, I need help with order #${shortOrderId(order.id)}.`
          setSupportHref(`/messages/${id}?prefill=${encodeURIComponent(msg)}`)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [order.id])

  // A membership order grants access instantly on payment: no shipping, no
  // PrescribeRx fulfillment. Its detail view shows what the plan unlocks
  // instead of a fulfillment timeline that would sit on "Awaiting fulfillment"
  // forever.
  const membership = membershipItemOf(order.items)
  const isPaid =
    order.status === 'paid' ||
    order.status === 'fulfilled' ||
    order.payment_status === 'succeeded'

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      <Header
        title={`Order #${shortOrderId(order.id)}`}
        subtitle={formatAbsoluteDate(order.created_at)}
      />

      <main id="main-content" className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status} />
          {membership ? (
            <MembershipAccessBadge paid={isPaid} />
          ) : (
            <PrescribeRxStatusBadge status={order.prescriberx_status} />
          )}
        </div>

        {membership ? (
          <MembershipSection item={membership} paid={isPaid} />
        ) : (
          <OrderTimeline order={order} />
        )}
        <ItemsSection order={order} />
        <ShippingSection address={order.shipping_address} />
        <PaymentSection order={order} />
        <IntakeSummary intake={order.intake_answers} />

        <div className="pt-2 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/profile/orders"
            className="flex-1 py-3 min-h-[44px] rounded-xl bg-white border border-[#E5EAE3] text-[#2D352C] font-semibold text-center shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-shadow"
          >
            Back to orders
          </Link>
          <Link
            href={supportHref}
            className="flex-1 py-3 min-h-[44px] rounded-xl bg-[#EEF1ED] text-[#2D352C] font-semibold text-center hover:bg-[#E2E7E0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
          >
            Need help? Contact support
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function MembershipSection({ item, paid }: { item: OrderItem; paid: boolean }) {
  const tier = tierForPlan(item.plan)
  const peptides = item.selected_protocols ?? []
  return (
    <section
      className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-5"
      aria-labelledby="order-membership-heading"
    >
      <h2
        id="order-membership-heading"
        className="text-sm font-semibold text-[#2D352C] mb-2"
      >
        Membership
      </h2>
      <p className="text-sm text-[#2D352C]">
        <span className="font-semibold">{tier.label}</span>{' '}
        <span className="text-[#6B7567]">· {tier.price}</span>
      </p>
      <p className="mt-1 text-sm text-[#6B7567]">
        {paid
          ? 'Your membership is active — marketplace access was granted as soon as payment was confirmed. Nothing ships with this order.'
          : 'Access is granted automatically once payment is confirmed.'}
      </p>
      {peptides.length > 0 && (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#8B9B83]">
            Included peptide access
          </p>
          <ul className="mt-2 flex flex-wrap gap-2" role="list">
            {peptides.map((slug) => (
              <li
                key={slug}
                className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#EEF1ED] border border-[#D9DFD3] text-xs font-medium text-[#2D352C]"
              >
                {peptideName(slug)}
              </li>
            ))}
          </ul>
        </>
      )}
      <Link
        href="/store"
        className="inline-flex items-center mt-4 text-sm font-semibold text-[var(--accent-strong)] hover:underline"
      >
        Browse your unlocked products →
      </Link>
    </section>
  )
}

function ItemsSection({ order }: { order: OrderDetail }) {
  // Line items carry LIST prices; order.total_cents is what was actually
  // charged. They diverge when a promo/coupon comps a membership (list $179,
  // charged $0). money bridges the two so Items → discount → Total reconciles
  // exactly and the customer never sees a $179 line against a $0 total with no
  // explanation. See orderMoneySummary's documented invariant.
  const items = normalizeOrderItems(order.items)
  const money = orderMoneySummary(order.items, order.total_cents)
  return (
    <section
      className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-5"
      aria-labelledby="order-items-heading"
    >
      <h2
        id="order-items-heading"
        className="text-sm font-semibold text-[#2D352C] mb-3"
      >
        Items
      </h2>
      <ul className="divide-y divide-[#E5EAE3]" role="list">
        {items.map((item, idx) => (
          <li
            key={`${item.product_id}-${idx}`}
            className="py-3 flex items-start justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#2D352C] truncate">
                {item.name}
              </p>
              <p className="text-xs text-[#6B7567]">
                Qty {item.quantity} ·{' '}
                {formatMoneyCents(item.unit_price_cents, order.currency)}
                {item.kind === 'membership' && item.recurring ? '/mo' : ' each'}
              </p>
            </div>
            <p className="text-sm font-semibold text-[#2D352C] shrink-0">
              {formatMoneyCents(item.line_total_cents, order.currency)}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-3 pt-3 border-t border-[#E5EAE3] space-y-1.5">
        {money.discountCents > 0 && (
          <>
            <div className="flex items-center justify-between text-sm text-[#6B7567]">
              <span>Subtotal</span>
              <span>{formatMoneyCents(money.lineSumCents, order.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-[var(--accent-strong)]">
              <span>{money.comped ? 'Complimentary access' : 'Discount'}</span>
              <span>−{formatMoneyCents(money.discountCents, order.currency)}</span>
            </div>
          </>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[#2D352C]">
            {money.recurring && money.totalCents > 0 ? 'Charged today' : 'Total'}
          </span>
          <span className="text-base font-bold text-[#2D352C]">
            {formatMoneyCents(money.totalCents, order.currency)}
          </span>
        </div>
      </div>

      {money.comped && (
        <p className="mt-2 text-xs text-[#6B7567]">
          This membership was granted at no charge (promotional access). No
          payment was collected for this order.
        </p>
      )}
      {money.recurring && money.totalCents > 0 && (
        <p className="mt-2 text-xs text-[#6B7567]">
          Billed monthly &middot; renews automatically until cancelled. Manage
          your membership in Settings.
        </p>
      )}
    </section>
  )
}

function ShippingSection({ address }: { address: ShippingAddress | null }) {
  if (!address) {
    return null
  }
  return (
    <section
      className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-5"
      aria-labelledby="order-shipping-heading"
    >
      <h2
        id="order-shipping-heading"
        className="text-sm font-semibold text-[#2D352C] mb-3"
      >
        Shipping address
      </h2>
      <address className="not-italic text-sm text-[#2D352C] leading-relaxed">
        {address.name && <div className="font-medium">{address.name}</div>}
        <div>
          {address.street}
          {address.apt ? `, ${address.apt}` : ''}
        </div>
        <div>
          {address.city}, {address.state} {address.zip}
        </div>
        <div>{address.country}</div>
        {address.phone && (
          <div className="text-[#6B7567] mt-1">{address.phone}</div>
        )}
      </address>
    </section>
  )
}

function PaymentSection({ order }: { order: OrderDetail }) {
  return (
    <section
      className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-5"
      aria-labelledby="order-payment-heading"
    >
      <h2
        id="order-payment-heading"
        className="text-sm font-semibold text-[#2D352C] mb-3"
      >
        Payment
      </h2>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8B9B83]">
            Total charged
          </p>
          <p className="mt-0.5 text-base font-bold text-[#2D352C]">
            {formatMoneyCents(order.total_cents, order.currency)}{' '}
            <span className="text-xs text-[#6B7567] font-normal">
              {order.currency.toUpperCase()}
            </span>
          </p>
        </div>
        <PaymentStatusBadge status={order.payment_status} />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Header / shared chrome
// ---------------------------------------------------------------------------

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] shadow-xl">
      <div className="px-4 py-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Link
            href="/profile/orders"
            aria-label="Back to orders"
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
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-[var(--accent)] truncate">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// View: 404 / error
// ---------------------------------------------------------------------------

function NotFoundView() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      <Header title="Order not found" />
      <main className="px-4 py-8 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-8 text-center">
          <h2 className="text-base font-bold text-[#2D352C]">
            We couldn&apos;t find that order
          </h2>
          <p className="mt-2 text-sm text-[#6B7567]">
            The order may have been removed, or it doesn&apos;t belong to your
            account.
          </p>
          <Link
            href="/profile/orders"
            className="inline-flex items-center justify-center mt-4 px-5 py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] text-white font-semibold shadow-md shadow-[var(--accent-strong)]/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-shadow"
          >
            Back to orders
          </Link>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}

function ErrorView({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      <Header title="Order" />
      <main className="px-4 py-8 max-w-2xl mx-auto">
        <div
          className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700"
          role="alert"
        >
          <p>{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-red-700 font-semibold underline"
          >
            Try again
          </button>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
