'use client';

import { use } from 'react';
import Link from 'next/link';

interface CancelPageProps {
  searchParams: Promise<{ orderId?: string | string[] }>;
}

function pickOrderId(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export default function CheckoutCancelPage({ searchParams }: CancelPageProps) {
  const params = use(searchParams);
  const orderId = pickOrderId(params.orderId);

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4 py-10">
      <main id="main-content" className="max-w-md w-full text-center">
        <div
          aria-hidden="true"
          className="w-20 h-20 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-6"
        >
          <svg className="w-10 h-10 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-[#2D352C] mb-2">Payment cancelled</h1>
        {orderId ? (
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Order #<span className="font-semibold text-[#2D352C]">{orderId}</span> was not charged.
          </p>
        ) : (
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Your order was not charged.
          </p>
        )}

        <div className="bg-white border border-[#E5EAE3] rounded-2xl p-5 mb-6 text-left">
          <p className="text-sm text-[var(--text-muted)]">
            No payment was processed. You can return to checkout to try again or keep browsing.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/checkout/membership"
            className="w-full py-3.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] text-white font-semibold shadow-md shadow-[var(--accent-strong)]/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-all inline-flex items-center justify-center"
          >
            Return to checkout
          </Link>
          <Link
            href="/shop"
            className="w-full py-3 min-h-[44px] rounded-xl text-[#6B7567] font-medium hover:bg-[#EEF1ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors inline-flex items-center justify-center"
          >
            Back to shop
          </Link>
        </div>
      </main>
    </div>
  );
}
