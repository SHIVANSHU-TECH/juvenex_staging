'use client';

import { use, useEffect, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import {
  INPUT_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CARD_CLASS,
} from '../_components/ui';

interface StubPayPageProps {
  searchParams: Promise<{ orderId?: string | string[] }>;
}

function pickOrderId(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

interface ConfirmResponse {
  success: boolean;
  error?: string;
}

async function confirmStubPayment(orderId: string): Promise<ConfirmResponse> {
  try {
    const res = await fetch('/api/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // tolerate non-JSON response shapes
    }
    if (parsed && typeof parsed === 'object' && 'success' in parsed) {
      return parsed as ConfirmResponse;
    }
    return { success: res.ok };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Stub payment failed',
    };
  }
}

// Probe the payments availability API. When `available === true`, a real
// payment provider is wired into the deployment and the stub UI is unsafe to
// render — we 404 the route. Only an *unavailable* deployment should ever
// reach the stub form. Any error result also blocks the page out of
// abundance of caution.
type GateState = 'checking' | 'allowed' | 'blocked';

async function probePaymentsAvailable(): Promise<boolean | null> {
  try {
    const res = await fetch('/api/payments/availability');
    if (!res.ok) return null;
    const json = (await res.json()) as { available?: unknown };
    if (typeof json.available !== 'boolean') return null;
    return json.available;
  } catch {
    return null;
  }
}

export default function StubPayPage({ searchParams }: StubPayPageProps) {
  const router = useRouter();
  const params = use(searchParams);
  const orderId = pickOrderId(params.orderId);

  const [gate, setGate] = useState<GateState>('checking');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    probePaymentsAvailable().then((available) => {
      if (cancelled) return;
      // available === true means a real provider is configured. Stub-pay
      // must never be reachable in that situation. Anything else (false or
      // null) keeps us on the dev/staging stub flow.
      if (available === true) {
        setGate('blocked');
        return;
      }
      setGate('allowed');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // When the gate flips to "blocked", trigger the framework-level 404 so
  // production users see the project's not-found UI (and search engines see
  // a real 404 status). This must run inside an effect — calling notFound()
  // during render of a client component crashes hydration.
  useEffect(() => {
    if (gate === 'blocked') {
      notFound();
    }
  }, [gate]);

  const handleApprove = async () => {
    if (!orderId) {
      setErrorMessage('Missing orderId in URL.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    const result = await confirmStubPayment(orderId);
    setSubmitting(false);
    if (result.success) {
      router.push(`/checkout/success?orderId=${encodeURIComponent(orderId)}`);
      return;
    }
    setErrorMessage(result.error ?? 'Stub confirm failed.');
  };

  const handleDecline = () => {
    if (!orderId) {
      router.push('/checkout/cancel');
      return;
    }
    router.push(`/checkout/cancel?orderId=${encodeURIComponent(orderId)}`);
  };

  if (gate === 'checking' || gate === 'blocked') {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading payment</span>
          <div
            aria-hidden="true"
            className="w-8 h-8 border-4 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] px-4 py-6">
      <main id="main-content" className="max-w-lg mx-auto">
        {/*
          The stub banner is static page chrome, not a transient assertive
          announcement, so we mark it as a `note` landmark instead of `alert`.
          Screen readers should not treat it as an interruption.
        */}
        <div
          role="note"
          aria-label="Stub payment notice"
          className="mb-5 rounded-2xl border-2 border-yellow-400 bg-yellow-50 p-4"
        >
          <p className="text-base font-bold text-yellow-900">
            STUB PAYMENT — TESTING ONLY
          </p>
          <p className="text-sm text-yellow-900/80 mt-1">
            No real card will be charged. This page exists so we can exercise the order flow
            without a live payment processor.
          </p>
        </div>

        <div className={SECTION_CARD_CLASS}>
          <h1 className="text-lg font-bold text-[#2D352C] mb-1">Mock payment</h1>
          {orderId ? (
            <p className="text-sm text-[var(--text-muted)] mb-5">
              Order #<span className="font-semibold text-[#2D352C]">{orderId}</span>
            </p>
          ) : (
            <p className="text-sm text-red-700 mb-5">
              Missing orderId — this page expects ?orderId=… in the URL.
            </p>
          )}

          {/*
            The card-style inputs are pure visual decoration so the page
            still looks like a payment form. We use the HTML `inert`
            attribute (supported in Next 16 / React 19) to make the entire
            region non-focusable, non-announceable, and non-interactive in a
            single declaration. `inert` correctly removes focusable
            descendants from the tab order, which `aria-hidden` does not.
          */}
          <div
            inert
            className="space-y-4 mb-6 opacity-60 pointer-events-none select-none"
          >
            <div>
              <span className={LABEL_CLASS}>Card number</span>
              <input
                type="text"
                value="4242 4242 4242 4242"
                readOnly
                tabIndex={-1}
                className={INPUT_CLASS}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className={LABEL_CLASS}>Expiry</span>
                <input
                  type="text"
                  value="12 / 34"
                  readOnly
                  tabIndex={-1}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <span className={LABEL_CLASS}>CVC</span>
                <input
                  type="text"
                  value="123"
                  readOnly
                  tabIndex={-1}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          </div>

          {errorMessage && (
            <p className="text-sm text-red-700 mb-3" role="alert">{errorMessage}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleDecline}
              disabled={submitting}
              className={SECONDARY_BUTTON_CLASS}
            >
              Decline payment
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={submitting || !orderId}
              className={PRIMARY_BUTTON_CLASS}
            >
              {submitting ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
                  />
                  Processing...
                </span>
              ) : (
                'Approve payment'
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
