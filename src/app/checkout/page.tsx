'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { isNativeApp } from '@/lib/native-iap';
import BrandLogo from '@/components/BrandLogo';

import CartReview from './_components/CartReview';
import IntakeForm from './_components/IntakeForm';
import MembershipSelect from './_components/MembershipSelect';
import ReviewSubmit from './_components/ReviewSubmit';
import ShippingForm, {
  type ShippingFormResult,
} from './_components/ShippingForm';
import StepIndicator from './_components/StepIndicator';
import { loadCart } from './_components/cart';
import {
  isPrescriptionCategory,
  type BillingValues,
  type CartLineItem,
  type CheckoutPostBody,
  type CheckoutPostResponse,
  type IntakeValues,
  type MembershipSelection,
  type ShippingValues,
  type StepIndex,
} from './_components/types';

// Snapshot of /api/payments/availability — reflects whether a real payment
// provider is wired into this deployment. We render a graceful "saved cart"
// surface when this is false instead of letting the user submit into a
// stubbed checkout.
type AvailabilityState = 'loading' | 'available' | 'unavailable' | 'error';

const SUPPORT_EMAIL = 'support@juvenex.app';
const UNAVAILABLE_TITLE = 'Checkout Temporarily Unavailable';
const UNAVAILABLE_BODY =
  "We're finalizing our payment processor. Your cart is saved — check back soon, or contact " +
  SUPPORT_EMAIL +
  '.';

const EMPTY_SHIPPING: ShippingValues = {
  name: '',
  email: '',
  phone: '',
  street: '',
  apt: '',
  city: '',
  state: '',
  zip: '',
  country: 'US',
};

const EMPTY_INTAKE: IntakeValues = {
  dob: '',
  sex: 'female',
  weightLbs: 0,
  heightFeet: 0,
  heightInches: 0,
  pregnant: 'no',
  allergies: '',
  currentMedications: '',
  conditions: [],
  conditionsOther: '',
  priorGlp1: 'no',
  priorGlp1Which: '',
  priorGlp1Duration: '',
  hipaaConsent: false,
  telehealthConsent: false,
};

async function postCheckout(body: CheckoutPostBody): Promise<CheckoutPostResponse> {
  const res = await fetch('/api/payments/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // Server returned non-JSON. Fall through to a synthetic error below.
  }
  // 503 from this route means the payment provider is not configured.
  // We surface a recognizable error string so the page can route the user
  // back to the unavailable state without trusting the parsed body.
  if (res.status === 503) {
    return {
      success: false,
      error: 'PAYMENT_UNAVAILABLE',
    };
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    'success' in parsed
  ) {
    return parsed as CheckoutPostResponse;
  }
  return {
    success: false,
    error: `Checkout request failed (${res.status})`,
  };
}

interface AvailabilityFetchResult {
  available: boolean;
}

async function fetchPaymentAvailability(): Promise<AvailabilityFetchResult | null> {
  try {
    const res = await fetch('/api/payments/availability');
    if (!res.ok) return null;
    const json = (await res.json()) as { available?: unknown };
    if (typeof json.available !== 'boolean') return null;
    return { available: json.available };
  } catch {
    return null;
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [step, setStep] = useState<StepIndex>(0);
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);

  // Members-only store: a non-member must add a membership in this same cart.
  // null = still checking; true = already a member (no tier needed); false =
  // must choose a tier below.
  const [membershipActive, setMembershipActive] = useState<boolean | null>(null);
  const [membership, setMembership] = useState<MembershipSelection | null>(null);

  const [shipping, setShipping] = useState<ShippingValues>(EMPTY_SHIPPING);
  const [billing, setBilling] = useState<BillingValues | undefined>(undefined);
  const [useBillingSameAsShipping, setUseBillingSameAsShipping] = useState(true);
  const [intake, setIntake] = useState<IntakeValues>(EMPTY_INTAKE);
  const [intakeCompleted, setIntakeCompleted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [availability, setAvailability] = useState<AvailabilityState>('loading');

  // Load cart on mount.
  useEffect(() => {
    setItems(loadCart());
    setCartLoaded(true);
  }, []);

  // In the native iOS/Android app, digital membership must be purchased via
  // Apple/Google in-app purchase on /checkout/membership — never through this
  // legacy web (Kurv) checkout wizard (App Store guideline 3.1.1). Redirect the
  // whole route away when running inside the app shell.
  const [nativeBlocked, setNativeBlocked] = useState(false);
  useEffect(() => {
    if (isNativeApp()) {
      setNativeBlocked(true);
      router.replace('/checkout/membership');
    }
  }, [router]);

  // Resolve whether the user already has active membership. Non-members must
  // choose a tier in the cart step before they can continue.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const token =
      typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null;
    fetch('/api/payments/subscription', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        setMembershipActive(Boolean(json?.active));
      })
      .catch(() => {
        if (!cancelled) setMembershipActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Probe whether a real payment provider is wired up. If not, we render an
  // unavailable card instead of the wizard. The cart already lives in
  // localStorage, so the user's selections are preserved automatically.
  useEffect(() => {
    let cancelled = false;
    fetchPaymentAvailability().then((result) => {
      if (cancelled) return;
      if (!result) {
        setAvailability('error');
        return;
      }
      setAvailability(result.available ? 'available' : 'unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Wrap the submit error setter so a server-side 503 (PAYMENT_UNAVAILABLE)
  // demotes the wizard to the unavailable surface. Other errors stay inline.
  const handleSubmitError = useCallback((message: string | null) => {
    if (message === 'PAYMENT_UNAVAILABLE') {
      setAvailability('unavailable');
      setErrorMessage(null);
      return;
    }
    setErrorMessage(message);
  }, []);

  const retryAvailability = useCallback(async () => {
    setAvailability('loading');
    const result = await fetchPaymentAvailability();
    if (!result) {
      setAvailability('error');
      return;
    }
    setAvailability(result.available ? 'available' : 'unavailable');
  }, []);

  // Prefill the shipping email/name from the auth user once it resolves.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    if (!user) return;
    prefilledRef.current = true;
    setShipping((prev) => ({
      ...prev,
      email: prev.email || user.email || '',
      name: prev.name || user.name || '',
      phone: prev.phone || user.phone || '',
    }));
  }, [user]);

  // Redirect unauthenticated users to /login. Guard with a ref so a transient
  // auth re-validation (the JWT rehydrating from localStorage on mount) can't
  // fire router.push repeatedly and bounce the user between /checkout and
  // /login — the source of the "perpetual cycle".
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      redirectedRef.current = false;
      return;
    }
    if (!redirectedRef.current) {
      redirectedRef.current = true;
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  const intakeRequired = useMemo(
    () => items.some((item) => isPrescriptionCategory(item.category)),
    [items]
  );

  // Reset intake state whenever the cart's prescription requirement flips.
  // Without this, a user who completed intake, removed the Rx item, and then
  // re-added a different Rx item could skip the medical intake step entirely
  // because intakeCompleted would still read true from the prior pass.
  useEffect(() => {
    setIntakeCompleted(false);
    setIntake(EMPTY_INTAKE);
  }, [intakeRequired]);

  const needsMembership = membershipActive === false;

  const handleCartContinue = () => {
    if (needsMembership && !membership) {
      setErrorMessage('Please choose a membership to continue.');
      return;
    }
    setErrorMessage(null);
    setStep(1);
  };

  const handleShippingContinue = (result: ShippingFormResult) => {
    setShipping(result.shipping);
    setBilling(result.billing);
    setUseBillingSameAsShipping(result.useBillingSameAsShipping);
    setErrorMessage(null);
    setStep(intakeRequired ? 2 : 3);
  };

  const handleIntakeContinue = (values: IntakeValues) => {
    setIntake(values);
    setIntakeCompleted(true);
    setErrorMessage(null);
    setStep(3);
  };

  const handleReviewBack = () => {
    setErrorMessage(null);
    setStep(intakeRequired ? 2 : 1);
  };

  const handleSuccess = (sessionUrl: string) => {
    if (typeof window !== 'undefined') {
      window.location.href = sessionUrl;
    }
  };

  if (
    nativeBlocked ||
    authLoading ||
    !cartLoaded ||
    availability === 'loading' ||
    (isAuthenticated && membershipActive === null)
  ) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading checkout</span>
          <div
            aria-hidden="true"
            className="w-8 h-8 border-4 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin"
          />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C]">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link
            href="/shop"
            aria-label="Back to shop"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#EEF1ED] hover:bg-[#E2E7E0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
          >
            <svg aria-hidden="true" className="w-5 h-5 text-[#6B7567]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-3">
            <BrandLogo size={32} className="rounded-lg shadow object-contain bg-white p-0.5" />
            <h1 className="text-lg font-bold text-[#2D352C]">Checkout</h1>
          </div>
        </div>
      </header>

      <main id="main-content" className="px-4 py-6 max-w-2xl mx-auto">
        {availability === 'unavailable' ? (
          <UnavailableNotice cartCount={items.length} />
        ) : availability === 'error' ? (
          <AvailabilityErrorNotice onRetry={retryAvailability} />
        ) : (
          <>
            <StepIndicator currentStep={step} intakeStepActive={intakeRequired} />

            {step === 0 && (
              <div className="space-y-4">
                {needsMembership && (
                  <MembershipSelect value={membership} onChange={setMembership} />
                )}
                {errorMessage && needsMembership && (
                  <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-sm text-red-700">{errorMessage}</p>
                  </div>
                )}
                <CartReview items={items} onContinue={handleCartContinue} />
              </div>
            )}

            {step === 1 && (
              <ShippingForm
                initialShipping={shipping}
                initialBilling={billing}
                initialUseSame={useBillingSameAsShipping}
                onBack={() => setStep(0)}
                onContinue={handleShippingContinue}
              />
            )}

            {step === 2 && intakeRequired && (
              <IntakeForm
                initial={intake}
                onBack={() => setStep(1)}
                onContinue={handleIntakeContinue}
              />
            )}

            {step === 3 && (
              <ReviewSubmit
                items={items}
                membership={needsMembership ? membership : null}
                shipping={shipping}
                billing={billing}
                useBillingSameAsShipping={useBillingSameAsShipping}
                intake={intakeRequired ? (intakeCompleted ? intake : null) : null}
                intakeRequired={intakeRequired}
                onBack={handleReviewBack}
                submitting={submitting}
                errorMessage={errorMessage}
                onSubmit={postCheckout}
                onSuccess={handleSuccess}
                onError={handleSubmitError}
                setSubmitting={setSubmitting}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notices rendered when payments aren't configured / probe failed
// ---------------------------------------------------------------------------

interface UnavailableNoticeProps {
  cartCount: number;
}

function UnavailableNotice({ cartCount }: UnavailableNoticeProps) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-6 sm:p-8 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-[#EEF1ED] flex items-center justify-center mb-4">
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
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-[#2D352C]">{UNAVAILABLE_TITLE}</h2>
      <p className="mt-2 text-sm text-[#6B7567]">{UNAVAILABLE_BODY}</p>
      {cartCount > 0 && (
        <p className="mt-3 text-xs text-[#8B9B83]">
          Your cart ({cartCount} {cartCount === 1 ? 'item' : 'items'}) has been
          saved on this device.
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href="/shop"
          className="inline-flex items-center justify-center px-5 py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] text-white font-semibold shadow-md shadow-[var(--accent-strong)]/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-shadow"
        >
          Back to Shop
        </Link>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="inline-flex items-center justify-center px-5 py-3 min-h-[44px] rounded-xl bg-[#EEF1ED] text-[#2D352C] font-semibold hover:bg-[#E2E7E0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}

interface AvailabilityErrorNoticeProps {
  onRetry: () => void;
}

function AvailabilityErrorNotice({ onRetry }: AvailabilityErrorNoticeProps) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-6 text-center">
      <h2 className="text-base font-bold text-[#2D352C]">
        Couldn&apos;t reach checkout
      </h2>
      <p className="mt-2 text-sm text-[#6B7567]">
        We couldn&apos;t verify checkout availability. Please check your
        connection and try again.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center px-5 py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] text-white font-semibold shadow-md shadow-[var(--accent-strong)]/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-shadow"
        >
          Retry
        </button>
        <Link
          href="/shop"
          className="inline-flex items-center justify-center px-5 py-3 min-h-[44px] rounded-xl bg-[#EEF1ED] text-[#2D352C] font-semibold hover:bg-[#E2E7E0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
        >
          Back to Shop
        </Link>
      </div>
    </div>
  );
}
