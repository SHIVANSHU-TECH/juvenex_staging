'use client';

import Link from 'next/link';

import { tierForPlan } from '@/lib/marketplace-access';

import { aggregateForCheckout, cartSubtotalCents, formatUsd } from './cart';
import type {
  BillingValues,
  CartLineItem,
  CheckoutPostBody,
  CheckoutPostResponse,
  IntakeValues,
  MembershipSelection,
  ShippingValues,
} from './types';
import {
  ERROR_TEXT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CARD_CLASS,
} from './ui';

interface ReviewSubmitProps {
  items: ReadonlyArray<CartLineItem>;
  membership: MembershipSelection | null;
  shipping: ShippingValues;
  billing?: BillingValues;
  useBillingSameAsShipping: boolean;
  intake: IntakeValues | null;
  intakeRequired: boolean;
  onBack: () => void;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (body: CheckoutPostBody) => Promise<CheckoutPostResponse>;
  onSuccess: (sessionUrl: string) => void;
  onError: (message: string) => void;
  setSubmitting: (value: boolean) => void;
}

function intakeAnswersPayload(intake: IntakeValues): Record<string, unknown> {
  // Normalize for the API contract: combine height feet/inches into total
  // inches and drop unused conditional fields when not selected.
  const heightInches = intake.heightFeet * 12 + intake.heightInches;
  const payload: Record<string, unknown> = {
    dob: intake.dob,
    sex: intake.sex,
    weight_lbs: intake.weightLbs,
    height_inches: heightInches,
    pregnant_or_breastfeeding: intake.pregnant,
    allergies: intake.allergies,
    current_medications: intake.currentMedications,
    conditions: intake.conditions,
    prior_glp1: intake.priorGlp1 === 'yes',
    hipaa_consent: intake.hipaaConsent,
    telehealth_consent: intake.telehealthConsent,
  };
  if (intake.conditions.includes('Other') && intake.conditionsOther) {
    payload.conditions_other = intake.conditionsOther;
  }
  if (intake.priorGlp1 === 'yes') {
    payload.prior_glp1_which = intake.priorGlp1Which ?? '';
    payload.prior_glp1_duration = intake.priorGlp1Duration ?? '';
  }
  return payload;
}

function buildBody(
  items: ReadonlyArray<CartLineItem>,
  membership: MembershipSelection | null,
  shipping: ShippingValues,
  billing: BillingValues | undefined,
  useSame: boolean,
  intake: IntakeValues | null,
  intakeRequired: boolean
): CheckoutPostBody {
  const aggregated = aggregateForCheckout(items);
  return {
    items: aggregated,
    ...(membership ? { membership } : {}),
    shipping_address: {
      name: shipping.name,
      street: shipping.apt
        ? `${shipping.street}, ${shipping.apt}`
        : shipping.street,
      city: shipping.city,
      state: shipping.state,
      zip: shipping.zip,
      country: shipping.country,
      phone: shipping.phone,
    },
    billing_address: useSame || !billing
      ? undefined
      : {
          name: billing.name,
          street: billing.apt
            ? `${billing.street}, ${billing.apt}`
            : billing.street,
          city: billing.city,
          state: billing.state,
          zip: billing.zip,
          country: billing.country,
          phone: billing.phone,
        },
    intake_answers:
      intakeRequired && intake ? intakeAnswersPayload(intake) : {},
    contact_email: shipping.email,
    contact_phone: shipping.phone,
  };
}

export default function ReviewSubmit({
  items,
  membership,
  shipping,
  billing,
  useBillingSameAsShipping,
  intake,
  intakeRequired,
  onBack,
  submitting,
  errorMessage,
  onSubmit,
  onSuccess,
  onError,
  setSubmitting,
}: ReviewSubmitProps) {
  const subtotal = cartSubtotalCents(items);
  const membershipTier = membership ? tierForPlan(membership.plan) : null;
  const membershipFirstMonthCents = membershipTier?.priceCents ?? 0;
  const dueTodayCents = subtotal + membershipFirstMonthCents;
  // A server-side tier rejection ("X requires the Y tier.") should be a
  // recoverable safety net, not a dead end — surface an inline upgrade link.
  // (Primary enforcement is at add-to-cart in /shop; this only fires for a
  // stale cart that slipped through.)
  const isTierError = /requires the .+ tier/i.test(errorMessage ?? '');

  const handlePlaceOrder = async () => {
    setSubmitting(true);
    try {
      const body = buildBody(
        items,
        membership,
        shipping,
        billing,
        useBillingSameAsShipping,
        intake,
        intakeRequired
      );
      const result = await onSubmit(body);
      if (result.success) {
        onSuccess(result.sessionUrl);
        return;
      }
      onError(result.error || 'Checkout failed. Please try again.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Checkout failed. Please try again.';
      onError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={SECTION_CARD_CLASS}>
      <h2 className="text-lg font-bold text-[#2D352C] mb-4">Review and place order</h2>

      <section className="mb-5" aria-labelledby="review-items">
        <h3 id="review-items" className="text-sm font-semibold text-[#2D352C] mb-2">Items</h3>
        <ul className="space-y-2 list-none p-0">
          {items.map((item) => (
            <li
              key={item.cartId}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <span className="text-[#2D352C] truncate">
                {item.name}
                {item.plan_label && (
                  <span className="ml-1 text-xs text-[var(--text-muted)]">
                    ({item.plan_label})
                  </span>
                )}
              </span>
              <span className="font-medium text-[#2D352C] whitespace-nowrap">
                {formatUsd(item.price_cents)}
              </span>
            </li>
          ))}
        </ul>
        {membershipTier && (
          <div className="mt-2 flex items-start justify-between gap-3 text-sm">
            <span className="text-[#2D352C]">
              Membership — {membershipTier.label}
              <span className="ml-1 text-xs text-[var(--text-muted)]">(first month)</span>
            </span>
            <span className="font-medium text-[#2D352C] whitespace-nowrap">
              {formatUsd(membershipFirstMonthCents)}
            </span>
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-[#EEF1ED] flex justify-between">
          <span className="text-sm text-[var(--text-muted)]">
            {membershipTier ? 'Due today' : 'Estimated total'}
          </span>
          <span className="text-base font-bold text-[var(--accent-strong)]">
            {formatUsd(dueTodayCents)}
          </span>
        </div>
        {membershipTier && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Then {formatUsd(membershipTier.priceCents)}/month for your membership
            (cancel anytime). Products are a one-time charge.
          </p>
        )}
      </section>

      <section className="mb-5" aria-labelledby="review-shipping">
        <h3 id="review-shipping" className="text-sm font-semibold text-[#2D352C] mb-2">
          Shipping to
        </h3>
        <p className="text-sm text-[#2D352C]">{shipping.name}</p>
        <p className="text-sm text-[var(--text-muted)]">
          {shipping.street}{shipping.apt ? `, ${shipping.apt}` : ''}<br />
          {shipping.city}, {shipping.state} {shipping.zip}<br />
          {shipping.country}
        </p>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {shipping.email} &middot; {shipping.phone}
        </p>
      </section>

      <section className="mb-5" aria-labelledby="review-intake">
        <h3 id="review-intake" className="text-sm font-semibold text-[#2D352C] mb-2">
          Medical intake
        </h3>
        {intakeRequired ? (
          intake ? (
            <p className="text-sm text-[var(--accent-strong)]">
              Completed. Your information will be reviewed by a licensed provider.
            </p>
          ) : (
            <p className="text-sm text-red-700">
              Medical intake is required for prescription items.
            </p>
          )
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Not required for this order.
          </p>
        )}
      </section>

      {errorMessage && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3">
          <p className={ERROR_TEXT_CLASS + ' mt-0'}>{errorMessage}</p>
          {isTierError && (
            <Link
              href="/upgrade?from=/shop"
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent-strong)] underline underline-offset-4 hover:text-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 rounded"
            >
              Upgrade your membership &rarr;
            </Link>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className={SECONDARY_BUTTON_CLASS}
          disabled={submitting}
        >
          Back
        </button>
        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={submitting || items.length === 0 || (intakeRequired && !intake)}
          className={PRIMARY_BUTTON_CLASS}
        >
          {submitting ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span
                aria-hidden="true"
                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
              />
              Placing order...
            </span>
          ) : (
            'Place order'
          )}
        </button>
      </div>
    </div>
  );
}
