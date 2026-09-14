'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import BottomNav from '@/components/BottomNav';
import { useAuth } from '@/lib/auth-context';
import { useOrganization } from '@/lib/organization-context';

export default function PaymentMethodsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { organization } = useOrganization();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const brandColor = organization?.primary_color ?? '#8FA888';

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] shadow-sm">
        <div className="px-4 py-4 flex items-center gap-3">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm text-[#6B7F65] font-medium hover:text-[#4A5C44] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 rounded"
            aria-label="Back to settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <h1 className="text-lg font-bold text-[#2D352C]">Payment methods</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <section
          aria-labelledby="payment-empty-heading"
          className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-8 text-center"
        >
          <div
            className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: `${brandColor}22`, color: brandColor }}
            aria-hidden="true"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
            </svg>
          </div>
          <h2
            id="payment-empty-heading"
            className="text-base font-semibold text-[#2D352C]"
          >
            No payment methods on file yet
          </h2>
          <p className="text-sm text-[#6B7567] mt-2 max-w-sm mx-auto">
            Cards are added securely at checkout. When you start a consultation
            or place a shop order, your card details are handled by our PCI-compliant
            payment processor — never stored on our servers.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/telehealth"
              className="px-5 py-2.5 text-sm font-semibold rounded-xl text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ backgroundColor: brandColor }}
            >
              Start a consultation
            </Link>
            <Link
              href="/store"
              className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-white border border-[#E5EAE3] text-[#2D352C] hover:bg-[#FAF9F6] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            >
              Browse shop
            </Link>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-5">
          <h2 className="text-sm font-semibold text-[#2D352C] mb-2">
            How billing works
          </h2>
          <ul className="text-xs text-[#6B7567] space-y-1.5 list-disc list-inside">
            <li>Card details are held by our payment processor, not on our servers.</li>
            <li>Active subscriptions can be viewed in your profile.</li>
            <li>
              To remove a saved card, contact{' '}
              <Link
                href="/messages"
                className="font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded"
                style={{ color: brandColor }}
              >
                your care team
              </Link>
              .
            </li>
          </ul>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
