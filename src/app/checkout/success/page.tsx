'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clearCart } from '../_components/cart';

interface OrderSummary {
  orderId: string;
  status?: string;
  totalCents?: number;
}

interface SuccessPageProps {
  searchParams: Promise<{
    orderId?: string | string[];
    kind?: string | string[];
    via?: string | string[];
  }>;
}

function pickOrderId(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

// /api/orders/[id] envelope shape:
//   { success: true, data: { order: { id, status, total_cents, ... } } }
// We only care about the three list-level fields here for the receipt.
interface OrderApiSuccess {
  success: true;
  data: {
    order?: { id?: string; status?: string; total_cents?: number };
  };
}

interface OrderApiFailure {
  success: false;
  error?: string;
}

type OrderApiResponse = OrderApiSuccess | OrderApiFailure;

async function fetchOrderSummary(orderId: string): Promise<OrderSummary> {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
    if (!res.ok) return { orderId };
    const json = (await res.json()) as OrderApiResponse;
    if (json.success && json.data && json.data.order) {
      const order = json.data.order;
      return {
        orderId: order.id ?? orderId,
        status: order.status,
        totalCents: order.total_cents,
      };
    }
    return { orderId };
  } catch {
    return { orderId };
  }
}

export default function CheckoutSuccessPage({ searchParams }: SuccessPageProps) {
  const params = use(searchParams);
  const orderId = pickOrderId(params.orderId);
  // Membership purchases redirect here with `?kind=membership` (set by
  // /api/payments/membership/checkout). That's the only flow we fire a
  // Tapfiliate affiliate conversion for.
  const isMembership = pickOrderId(params.kind) === 'membership';
  // App Store IAP success: no order row exists (membership activates via the
  // RevenueCat webhook), so the web verify/conversion paths don't apply.
  const viaIap = pickOrderId(params.via) === 'iap';

  const [summary, setSummary] = useState<OrderSummary | null>(null);
  // Fire the Tapfiliate conversion at most once.
  const conversionFired = useRef(false);

  // Clear the cart once on this page so the user starts fresh next time.
  useEffect(() => {
    clearCart();
  }, []);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    // Safety net: ask the server to authoritatively re-check the payment with
    // the provider and flip the order to paid if confirmed — covers the case
    // where the provider webhook hasn't arrived yet. Best-effort; we then load
    // the (possibly now-updated) order summary either way.
    const token =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('auth_token')
        : null;
    fetch('/api/payments/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ orderId }),
    })
      .catch(() => undefined)
      .then(() => fetchOrderSummary(orderId))
      .then((s) => {
        if (!cancelled) setSummary(s);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Affiliate attribution: fire a Tapfiliate conversion for a genuinely paid
  // membership. `window.tap` is a safe queue (installed by TapfiliateScript),
  // so these calls never throw even if tapfiliate.js is blocked/unavailable.
  useEffect(() => {
    if (!isMembership) return; // only memberships convert
    if (conversionFired.current) return; // fire once
    const tap = typeof window !== 'undefined' ? window.tap : undefined;
    if (typeof tap !== 'function') return; // wait until the snippet has run

    if (orderId) {
      // Need the server-confirmed order to know it's actually paid (this page
      // is also reached before the payment is verified, and never on cancel —
      // /checkout/cancel is a separate route).
      if (!summary) return; // wait for the order summary to load
      if (summary.status !== 'paid') return; // not genuinely paid yet
      conversionFired.current = true;
      const amount =
        typeof summary.totalCents === 'number'
          ? summary.totalCents / 100
          : undefined;
      if (amount !== undefined) {
        tap('conversion', summary.orderId, amount);
      } else {
        tap('conversion', summary.orderId);
      }
    } else if (!viaIap) {
      // No order id to key on — still attribute the conversion so the referral
      // isn't lost (Tapfiliate generates an id server-side). NOT for IAP: those
      // have no confirmed paid order here, so firing would book an unkeyed,
      // un-dedupable conversion on every success-page visit/reload. Affiliate
      // attribution for IAP, if wanted, must be server-side from the RC webhook.
      conversionFired.current = true;
      tap('conversion');
    }
  }, [isMembership, orderId, summary, viaIap]);

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4 py-10">
      <main id="main-content" className="max-w-md w-full text-center">
        <div
          aria-hidden="true"
          className="w-20 h-20 rounded-full bg-[#EEF1ED] flex items-center justify-center mx-auto mb-6"
        >
          <svg className="w-10 h-10 text-[var(--accent-strong)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Only claim confirmation once the server recognizes the order —
            a bogus/unknown orderId must not render a false "confirmed". */}
        <h1 className="text-2xl font-bold text-[#2D352C] mb-2">
          {!orderId
            ? 'Thank you'
            : summary === null
              ? 'Confirming your order…'
              : summary.status
                ? isMembership
                  ? 'Membership active'
                  : 'Order confirmed'
                : 'Order not found'}
        </h1>
        {orderId ? (
          summary !== null && !summary.status ? (
            <p className="text-sm text-[var(--text-muted)] mb-6">
              We couldn&apos;t verify an order with that reference. If you just
              paid, check My Orders in a moment or contact support.
            </p>
          ) : (
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Order #<span className="font-semibold text-[#2D352C]">{summary?.orderId ?? orderId}</span>
            </p>
          )
        ) : (
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Thank you for your order.
          </p>
        )}

        <div
          className="bg-white border border-[#E5EAE3] rounded-2xl p-5 mb-6 text-left"
          hidden={Boolean(orderId && summary !== null && !summary.status)}
        >
          <h2 className="text-base font-semibold text-[#2D352C] mb-2">What happens next</h2>
          <p className="text-sm text-[var(--text-muted)]">
            {isMembership
              ? 'Your membership is now active. You have full access to your selected protocols, the marketplace, and telehealth — manage everything from your dashboard.'
              : 'Our team will review your medical intake and forward your order to PrescribeRx within 24 hours. You can track status in My Orders at any time.'}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href={isMembership ? '/dashboard' : '/profile/orders'}
            className="w-full py-3.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] text-white font-semibold shadow-md shadow-[var(--accent-strong)]/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-all inline-flex items-center justify-center"
          >
            {isMembership ? 'Go to dashboard' : 'View My Orders'}
          </Link>
          <Link
            href="/shop"
            className="w-full py-3 min-h-[44px] rounded-xl text-[#6B7567] font-medium hover:bg-[#EEF1ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors inline-flex items-center justify-center"
          >
            {isMembership ? 'Browse the marketplace' : 'Back to shop'}
          </Link>
        </div>
      </main>
    </div>
  );
}
