import { z } from 'zod';

// Cart shape persisted by /shop in localStorage under CART_KEY.
// Each item is a product with cartId added. We re-declare here so checkout
// stays decoupled from shop internals.
export interface CartLineItem {
  id: string;
  cartId: string;
  name: string;
  description?: string;
  category: string;
  price: number;
  price_cents: number;
  plan_months?: 1 | 3;
  plan_label?: string;
  image_url?: string;
}

// Aggregated line for the API contract: same product_id collapsed into one
// row with quantity. Sent to /api/payments/checkout.
export interface CheckoutItem {
  product_id: string;
  name: string;
  quantity: number;
  price_cents: number;
}

export const usZipRegex = /^\d{5}(-\d{4})?$/;

// Phone validation is format-agnostic: we strip every non-digit and accept a
// 10-digit US number (or 11 digits with a leading "1"). This means
// "5555555555", "(555) 555-5555", "555-555-5555", and "+1 555 555 5555" are
// all valid — only the digit count matters.
export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidUsPhone(value: string): boolean {
  const digits = normalizePhoneDigits(value);
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

export const shippingSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().email('Enter a valid email'),
  phone: z
    .string()
    .trim()
    .refine(isValidUsPhone, 'Enter a valid 10-digit US phone number'),
  street: z.string().trim().min(1, 'Street address is required'),
  apt: z.string().trim().optional(),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(2, 'Select a state'),
  zip: z.string().trim().regex(usZipRegex, 'Enter a valid US ZIP code'),
  country: z.string().trim().min(2, 'Country is required'),
});

export type ShippingValues = z.infer<typeof shippingSchema>;

export const billingSchema = shippingSchema.extend({});
export type BillingValues = z.infer<typeof billingSchema>;

// Intake schema. The numeric ranges below MUST stay aligned with the
// server-side intakeAnswersSchema in src/app/api/payments/checkout/route.ts.
// Drift between client and server caps means a value can pass the form, hit
// the API, and bounce with a cryptic 400 — clinical baseline ranges:
//   weight_lbs: 50 - 800
//   total height (feet*12 + inches): 36 - 96 inches (3'0" - 8'0")
export const intakeSchema = z
  .object({
    dob: z.string().trim().min(1, 'Date of birth is required'),
    sex: z.enum(['male', 'female', 'other']),
    weightLbs: z
      .number({ message: 'Enter a valid weight in pounds' })
      .min(50, 'Weight must be at least 50 lbs')
      .max(800, 'Weight must be 800 lbs or less'),
    heightFeet: z
      .number()
      .int('Height (feet) must be a whole number')
      .min(0, 'Height (feet) is required')
      .max(8, 'Height (feet) is too large'),
    heightInches: z
      .number()
      .int('Height (inches) must be a whole number')
      .min(0)
      .max(11, 'Inches must be 0-11'),
    pregnant: z.enum(['yes', 'no', 'na']),
    allergies: z.string().trim().max(2000, 'Allergies field is too long'),
    currentMedications: z
      .string()
      .trim()
      .max(2000, 'Current medications field is too long'),
    conditions: z.array(z.string().max(100)).max(20),
    conditionsOther: z.string().trim().max(500).optional(),
    priorGlp1: z.enum(['yes', 'no']),
    priorGlp1Which: z.string().trim().max(200).optional(),
    priorGlp1Duration: z.string().trim().max(200).optional(),
    hipaaConsent: z.boolean().refine((v) => v, 'HIPAA consent is required'),
    telehealthConsent: z
      .boolean()
      .refine((v) => v, 'Telehealth consent is required'),
  })
  .superRefine((val, ctx) => {
    // Date of birth must be a real, past date and the patient must be 18+.
    // (The <input type="date" max> attribute blocks future dates in the UI;
    // this is the authoritative check and also guards keyboard/paste entry.)
    if (val.dob) {
      const dob = new Date(`${val.dob}T00:00:00`);
      if (Number.isNaN(dob.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dob'],
          message: 'Enter a valid date of birth',
        });
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dob > today) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['dob'],
            message: 'Date of birth cannot be in the future',
          });
        } else {
          let age = today.getFullYear() - dob.getFullYear();
          const monthDiff = today.getMonth() - dob.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age -= 1;
          }
          if (age < 18) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['dob'],
              message: 'You must be at least 18 years old',
            });
          }
        }
      }
    }

    // Reject totals outside the clinical baseline range that the server also
    // enforces (height_inches 36-96).
    const totalInches = val.heightFeet * 12 + val.heightInches;
    if (totalInches < 36) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['heightFeet'],
        message: 'Height must be at least 3 feet',
      });
    }
    if (totalInches > 96) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['heightFeet'],
        message: 'Height must be 8 feet or less',
      });
    }
  });

export type IntakeValues = z.infer<typeof intakeSchema>;

export const CONDITION_OPTIONS = [
  'Diabetes',
  'Hypertension',
  'Thyroid disorder',
  'Heart disease',
  'Pancreatitis',
  'MEN2 / MTC family history',
  'Other',
] as const;

export const STEP_LABELS = ['Cart', 'Shipping', 'Medical Intake', 'Review'] as const;

export type StepIndex = 0 | 1 | 2 | 3;

// Defensive set covering every known prescription-category string we have
// observed in the DB seed, the shop catalog, and historical product imports.
// The shop and admin surfaces use mixed casings ("GLP1", "Peptides",
// "Prescription", "medication"); we want any of them to gate the intake step.
export const PRESCRIPTION_CATEGORIES: ReadonlySet<string> = new Set([
  'GLP1',
  'glp1',
  'GLP-1',
  'glp-1',
  'Peptides',
  'peptides',
  'Peptide',
  'peptide',
  'medication',
  'Medication',
  'Prescription',
  'prescription',
  'Weight loss',
  'Weight loss protocol',
  'weight_loss',
  'Metabolic/energy',
  'Metabolic protocol',
  'metabolic_energy',
  'Sexual health',
  'Sexual protocol',
  'sexual_health',
  'Growth protocol',
  'growth',
  'Recovery',
  'recovery',
]);

// Returns true when the supplied product category string maps to a
// prescription item, regardless of the casing the catalog used.
export function isPrescriptionCategory(category?: string | null): boolean {
  if (!category) return false;
  if (PRESCRIPTION_CATEGORIES.has(category)) return true;
  const lower = category.toLowerCase();
  if (PRESCRIPTION_CATEGORIES.has(lower)) return true;
  const upper = category.toUpperCase();
  if (PRESCRIPTION_CATEGORIES.has(upper)) return true;
  return false;
}

// Membership the buyer is purchasing in the same cart (members-only store).
// When present, checkout becomes one recurring charge: products + first-month
// membership now, then membership monthly.
export interface MembershipSelection {
  plan: string;
  selectedProtocols?: string[];
}

export interface CheckoutPostBody {
  items: CheckoutItem[];
  membership?: MembershipSelection;
  shipping_address: {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string;
  };
  billing_address?: {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string;
  };
  intake_answers: Record<string, unknown>;
  contact_email: string;
  contact_phone: string;
}

export interface CheckoutPostResponseSuccess {
  success: true;
  orderId: string;
  sessionUrl: string;
}

export interface CheckoutPostResponseError {
  success: false;
  error: string;
}

export type CheckoutPostResponse = CheckoutPostResponseSuccess | CheckoutPostResponseError;
