'use client';

import { useId, useState } from 'react';
import {
  shippingSchema,
  billingSchema,
  type ShippingValues,
  type BillingValues,
} from './types';
import {
  CHECKBOX_CLASS,
  ERROR_TEXT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CARD_CLASS,
} from './ui';

const US_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

// Currently we ship US only. The country select is locked to "United States"
// instead of free text so users can't submit unsupported destinations and so
// the shipping zod schema's country field always lines up with the catalog.
const SUPPORTED_COUNTRIES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'US', name: 'United States' },
];

export interface ShippingFormResult {
  shipping: ShippingValues;
  billing?: BillingValues;
  useBillingSameAsShipping: boolean;
}

interface ShippingFormProps {
  initialShipping: ShippingValues;
  initialBilling?: BillingValues;
  initialUseSame: boolean;
  onBack: () => void;
  onContinue: (result: ShippingFormResult) => void;
}

type FieldErrors = Partial<Record<string, string>>;

function fieldErrorsFromZod(error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> }, prefix = ''): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '');
    if (key) out[`${prefix}${key}`] = issue.message;
  }
  return out;
}

export default function ShippingForm({
  initialShipping,
  initialBilling,
  initialUseSame,
  onBack,
  onContinue,
}: ShippingFormProps) {
  // Force-default any blank country into "US" so the locked select is in a
  // valid state on first paint.
  const [shipping, setShipping] = useState<ShippingValues>({
    ...initialShipping,
    country: initialShipping.country || 'US',
  });
  const [billing, setBilling] = useState<BillingValues>(() => {
    const seed = initialBilling ?? initialShipping;
    return { ...seed, country: seed.country || 'US' };
  });
  const [useSame, setUseSame] = useState<boolean>(initialUseSame);
  const [errors, setErrors] = useState<FieldErrors>({});

  const formId = useId();
  const errorSummaryId = useId();

  // Map a namespaced error key (e.g. "shipping_email") to the DOM id of the
  // matching field (e.g. "shipping-email") so the submit handler can move
  // focus to the first invalid input without each call site repeating the
  // string surgery.
  const focusFirstError = (allErrors: FieldErrors) => {
    const firstKey = Object.keys(allErrors)[0];
    if (!firstKey) return;
    const domId = firstKey.replace('_', '-');
    if (typeof document !== 'undefined') {
      const el = document.getElementById(domId);
      if (el && typeof (el as HTMLElement).focus === 'function') {
        (el as HTMLElement).focus();
      }
    }
  };

  // Validate a single field against its slice of the shipping schema. Returns
  // the error message, or null when the field is valid.
  const fieldError = (field: string, value: unknown): string | null => {
    const shape = shippingSchema.shape as Record<
      string,
      { safeParse: (v: unknown) => { success: boolean; error?: { issues: ReadonlyArray<{ message: string }> } } }
    >;
    const schema = shape[field];
    if (!schema) return null;
    const res = schema.safeParse(typeof value === 'string' ? value.trim() : value);
    if (res.success) return null;
    return res.error?.issues[0]?.message ?? 'Invalid value';
  };

  // On change: clear an EXISTING error the moment the field becomes valid, but
  // don't surface a brand-new error mid-typing (that's the blur handler's job).
  const clearErrorIfValid = (errKey: string, field: string, value: unknown) => {
    setErrors((prev) => {
      if (!(errKey in prev)) return prev;
      if (fieldError(field, value) !== null) return prev;
      const next = { ...prev };
      delete next[errKey];
      return next;
    });
  };

  // On blur: fully re-validate the field — set or clear its error immediately.
  const revalidateField = (errKey: string, field: string, value: unknown) => {
    setErrors((prev) => {
      const message = fieldError(field, value);
      if (message === null) {
        if (!(errKey in prev)) return prev;
        const next = { ...prev };
        delete next[errKey];
        return next;
      }
      if (prev[errKey] === message) return prev;
      return { ...prev, [errKey]: message };
    });
  };

  const updateShipping = <K extends keyof ShippingValues>(field: K, value: ShippingValues[K]) => {
    setShipping((prev) => ({ ...prev, [field]: value }));
    clearErrorIfValid(`shipping_${String(field)}`, String(field), value);
  };

  const updateBilling = <K extends keyof BillingValues>(field: K, value: BillingValues[K]) => {
    setBilling((prev) => ({ ...prev, [field]: value }));
    clearErrorIfValid(`billing_${String(field)}`, String(field), value);
  };

  const blurShipping = <K extends keyof ShippingValues>(field: K, value: ShippingValues[K]) => {
    revalidateField(`shipping_${String(field)}`, String(field), value);
  };

  const blurBilling = <K extends keyof BillingValues>(field: K, value: BillingValues[K]) => {
    revalidateField(`billing_${String(field)}`, String(field), value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const shippingResult = shippingSchema.safeParse(shipping);
    let billingResult: ReturnType<typeof billingSchema.safeParse> | null = null;
    if (!useSame) {
      billingResult = billingSchema.safeParse(billing);
    }

    const allErrors: FieldErrors = {};
    if (!shippingResult.success) {
      Object.assign(allErrors, fieldErrorsFromZod(shippingResult.error, 'shipping_'));
    }
    if (billingResult && !billingResult.success) {
      Object.assign(allErrors, fieldErrorsFromZod(billingResult.error, 'billing_'));
    }

    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      // Defer focus to the next paint so the rendered error markup (and any
      // newly-mounted inputs) exists before we try to focus.
      requestAnimationFrame(() => focusFirstError(allErrors));
      return;
    }

    if (!shippingResult.success) return; // satisfies type narrowing
    setErrors({});
    onContinue({
      shipping: shippingResult.data,
      billing: useSame ? undefined : (billingResult?.success ? billingResult.data : undefined),
      useBillingSameAsShipping: useSame,
    });
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className={SECTION_CARD_CLASS} noValidate>
      <h2 className="text-lg font-bold text-[#2D352C] mb-2">Shipping address</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Fields marked with <span className="text-red-600" aria-hidden="true">*</span> are required.
      </p>
      {/* Error summary announces field-level validation problems as a single
          assertive update, so screen reader users hear what's wrong without
          having to tab through every input to find the first aria-invalid. */}
      <div
        id={errorSummaryId}
        role="alert"
        aria-live="assertive"
        className="sr-only"
      >
        {Object.keys(errors).length > 0
          ? `${Object.keys(errors).length} ${Object.keys(errors).length === 1 ? 'field needs' : 'fields need'} attention before continuing.`
          : ''}
      </div>

      <AddressFields
        idPrefix="shipping"
        values={shipping}
        errors={errors}
        onChange={updateShipping}
        onBlur={blurShipping}
        statesList={US_STATES}
        countriesList={SUPPORTED_COUNTRIES}
      />

      <div className="mt-5 mb-3 bg-[#EEF1ED] border border-[#D8DFD5] rounded-xl p-4">
        <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={useSame}
            onChange={(e) => setUseSame(e.target.checked)}
            className={CHECKBOX_CLASS}
          />
          <span className="text-[#2D352C] font-medium">
            Use this address for billing too
          </span>
        </label>
      </div>

      {!useSame && (
        <div className="mt-5">
          <h3 className="text-base font-bold text-[#2D352C] mb-4">Billing address</h3>
          <AddressFields
            idPrefix="billing"
            values={billing}
            errors={errors}
            onChange={updateBilling}
            onBlur={blurBilling}
            statesList={US_STATES}
            countriesList={SUPPORTED_COUNTRIES}
          />
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <button type="button" onClick={onBack} className={SECONDARY_BUTTON_CLASS}>
          Back
        </button>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          Continue
        </button>
      </div>
    </form>
  );
}

interface AddressFieldsProps {
  idPrefix: 'shipping' | 'billing';
  values: ShippingValues;
  errors: FieldErrors;
  onChange: <K extends keyof ShippingValues>(field: K, value: ShippingValues[K]) => void;
  onBlur: <K extends keyof ShippingValues>(field: K, value: ShippingValues[K]) => void;
  statesList: ReadonlyArray<{ code: string; name: string }>;
  countriesList: ReadonlyArray<{ code: string; name: string }>;
}

// Visible required-field marker. aria-hidden because aria-required on the
// input itself is what assistive tech reads.
function RequiredMark() {
  return (
    <span className="text-red-600" aria-hidden="true">
      {' '}*
    </span>
  );
}

function AddressFields({ idPrefix, values, errors, onChange, onBlur, statesList, countriesList }: AddressFieldsProps) {
  const fid = (key: string) => `${idPrefix}-${key}`;
  const errKey = (key: string) => `${idPrefix}_${key}`;
  const errId = (key: string) => `${idPrefix}-${key}-error`;

  const renderError = (key: string) => {
    const message = errors[errKey(key)];
    if (!message) return null;
    return (
      <p id={errId(key)} role="alert" className={ERROR_TEXT_CLASS}>
        {message}
      </p>
    );
  };

  // Single-country mode: lock the country select so users can't submit an
  // unsupported destination. We still render a real <select> (instead of a
  // hidden field) so the country is visible and obvious in the form.
  const countryLocked = countriesList.length <= 1;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={fid('name')} className={LABEL_CLASS}>
          Full name<RequiredMark />
        </label>
        <input
          id={fid('name')}
          type="text"
          autoComplete={idPrefix === 'shipping' ? 'shipping name' : 'billing name'}
          value={values.name}
          onChange={(e) => onChange('name', e.target.value)}
          onBlur={(e) => onBlur('name', e.target.value)}
          aria-required="true"
          aria-invalid={errors[errKey('name')] ? 'true' : undefined}
          aria-describedby={errors[errKey('name')] ? errId('name') : undefined}
          className={INPUT_CLASS}
        />
        {renderError('name')}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={fid('email')} className={LABEL_CLASS}>
            Email<RequiredMark />
          </label>
          <input
            id={fid('email')}
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => onChange('email', e.target.value)}
            onBlur={(e) => onBlur('email', e.target.value)}
            aria-required="true"
            aria-invalid={errors[errKey('email')] ? 'true' : undefined}
            aria-describedby={errors[errKey('email')] ? errId('email') : undefined}
            className={INPUT_CLASS}
          />
          {renderError('email')}
        </div>
        <div>
          <label htmlFor={fid('phone')} className={LABEL_CLASS}>
            Phone<RequiredMark />
          </label>
          <input
            id={fid('phone')}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={values.phone}
            onChange={(e) => onChange('phone', e.target.value)}
            onBlur={(e) => onBlur('phone', e.target.value)}
            aria-required="true"
            aria-invalid={errors[errKey('phone')] ? 'true' : undefined}
            aria-describedby={errors[errKey('phone')] ? errId('phone') : undefined}
            placeholder="(555) 123-4567"
            className={INPUT_CLASS}
          />
          {renderError('phone')}
        </div>
      </div>

      <div>
        <label htmlFor={fid('street')} className={LABEL_CLASS}>
          Street address<RequiredMark />
        </label>
        <input
          id={fid('street')}
          type="text"
          autoComplete={idPrefix === 'shipping' ? 'shipping street-address' : 'billing street-address'}
          value={values.street}
          onChange={(e) => onChange('street', e.target.value)}
          onBlur={(e) => onBlur('street', e.target.value)}
          aria-required="true"
          aria-invalid={errors[errKey('street')] ? 'true' : undefined}
          aria-describedby={errors[errKey('street')] ? errId('street') : undefined}
          className={INPUT_CLASS}
        />
        {renderError('street')}
      </div>

      <div>
        <label htmlFor={fid('apt')} className={LABEL_CLASS}>
          Apt / Suite <span className="text-[var(--text-muted)] font-normal">(optional)</span>
        </label>
        <input
          id={fid('apt')}
          type="text"
          value={values.apt ?? ''}
          onChange={(e) => onChange('apt', e.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={fid('city')} className={LABEL_CLASS}>
            City<RequiredMark />
          </label>
          <input
            id={fid('city')}
            type="text"
            autoComplete={idPrefix === 'shipping' ? 'shipping address-level2' : 'billing address-level2'}
            value={values.city}
            onChange={(e) => onChange('city', e.target.value)}
            onBlur={(e) => onBlur('city', e.target.value)}
            aria-required="true"
            aria-invalid={errors[errKey('city')] ? 'true' : undefined}
            aria-describedby={errors[errKey('city')] ? errId('city') : undefined}
            className={INPUT_CLASS}
          />
          {renderError('city')}
        </div>
        <div>
          <label htmlFor={fid('state')} className={LABEL_CLASS}>
            State<RequiredMark />
          </label>
          <select
            id={fid('state')}
            value={values.state}
            onChange={(e) => onChange('state', e.target.value)}
            onBlur={(e) => onBlur('state', e.target.value)}
            autoComplete={idPrefix === 'shipping' ? 'shipping address-level1' : 'billing address-level1'}
            aria-required="true"
            aria-invalid={errors[errKey('state')] ? 'true' : undefined}
            aria-describedby={errors[errKey('state')] ? errId('state') : undefined}
            className={INPUT_CLASS}
          >
            <option value="">Select state...</option>
            {statesList.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
          {renderError('state')}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={fid('zip')} className={LABEL_CLASS}>
            ZIP code<RequiredMark />
          </label>
          <input
            id={fid('zip')}
            type="text"
            inputMode="numeric"
            autoComplete={idPrefix === 'shipping' ? 'shipping postal-code' : 'billing postal-code'}
            value={values.zip}
            onChange={(e) => onChange('zip', e.target.value)}
            onBlur={(e) => onBlur('zip', e.target.value)}
            aria-required="true"
            aria-invalid={errors[errKey('zip')] ? 'true' : undefined}
            aria-describedby={errors[errKey('zip')] ? errId('zip') : undefined}
            placeholder="12345"
            maxLength={10}
            className={INPUT_CLASS}
          />
          {renderError('zip')}
        </div>
        <div>
          <label htmlFor={fid('country')} className={LABEL_CLASS}>
            Country<RequiredMark />
          </label>
          <select
            id={fid('country')}
            value={values.country || 'US'}
            // When the country is locked we keep the select in the tab order
            // (no `disabled` attribute) so keyboard users can still focus it
            // and read its current value. We block any change attempt by
            // calling preventDefault on the synthetic event and ignoring the
            // value, then re-asserting the locked default.
            onChange={(e) => {
              if (countryLocked) {
                e.preventDefault();
                const lockedValue = countriesList[0]?.code ?? 'US';
                if (values.country !== lockedValue) {
                  onChange('country', lockedValue);
                }
                return;
              }
              onChange('country', e.target.value);
            }}
            onKeyDown={(e) => {
              if (countryLocked) {
                // Allow Tab/Shift+Tab/Esc but block typing/arrow changes.
                if (
                  e.key !== 'Tab' &&
                  e.key !== 'Escape' &&
                  e.key !== 'Enter'
                ) {
                  e.preventDefault();
                }
              }
            }}
            aria-required="true"
            aria-readonly={countryLocked ? 'true' : undefined}
            aria-invalid={errors[errKey('country')] ? 'true' : undefined}
            aria-describedby={
              errors[errKey('country')]
                ? errId('country')
                : countryLocked
                  ? `${idPrefix}-country-hint`
                  : undefined
            }
            autoComplete={idPrefix === 'shipping' ? 'shipping country' : 'billing country'}
            className={`${INPUT_CLASS} ${countryLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {countriesList.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
          {countryLocked && (
            <p id={`${idPrefix}-country-hint`} className="mt-1 text-xs text-[var(--text-muted)]">
              We currently ship to the United States only.
            </p>
          )}
          {renderError('country')}
        </div>
      </div>
    </div>
  );
}
