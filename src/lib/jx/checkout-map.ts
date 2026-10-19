/**
 * Product → checkout mapping for the Juvenex /store catalogue.
 *
 * Source of truth: `juvenex.xlsx` (Sheet1 = Weight Loss) plus the required
 * Tirzepatide 2.5 mg/week and Semaglutide duration mappings.
 *
 * This app does not redirect to Sticky hosted URLs. Checkout posts the
 * WhiteLabelMD `product_id`, which matches the Excel `CHECKOUT_LINKS` query
 * `?id=`. When the partner lists the same molecule/dose/supply under several
 * IDs, `PREFERRED_CHECKOUT_PRODUCT_IDS` forces the Excel-canonical ID to win
 * over the default “lowest ID” dedupe.
 */

export interface CheckoutMapping {
  product: string
  durationMonths: 1 | 3 | 6 | 12
  dosage: string
  sku: string
  stickyId: string
  /** WhiteLabelMD / Excel checkout product id (`?id=`). */
  productId: string
  checkoutUrl: string
}

/**
 * Required Tirzepatide / Semaglutide duration mappings.
 *
 * SKUs are the Sheet1 alias codes (SEMA-1M…SEMA-12M, TIRZ-1M…TIRZ-12M).
 * productId / checkoutUrl use the preferred Excel rows (?id=46–53).
 * Sticky IDs match Sheet1 for those rows. Checkout posts productId only.
 */
export const REQUIRED_CHECKOUT_MAPPINGS: readonly CheckoutMapping[] = [
  {
    product: 'Tirzepatide',
    durationMonths: 1,
    dosage: '2.5 mg/week',
    sku: 'TIRZ-1M',
    stickyId: '38798',
    productId: '50',
    checkoutUrl: 'https://checkout.juvenex.app/?id=50',
  },
  {
    product: 'Tirzepatide',
    durationMonths: 3,
    dosage: '2.5 mg/week',
    sku: 'TIRZ-3M',
    stickyId: '38799',
    productId: '51',
    checkoutUrl: 'https://checkout.juvenex.app/?id=51',
  },
  {
    product: 'Tirzepatide',
    durationMonths: 6,
    dosage: '2.5 mg/week',
    sku: 'TIRZ-6M',
    stickyId: '38800',
    productId: '52',
    checkoutUrl: 'https://checkout.juvenex.app/?id=52',
  },
  {
    product: 'Tirzepatide',
    durationMonths: 12,
    dosage: '2.5 mg/week',
    sku: 'TIRZ-12M',
    stickyId: '38801',
    productId: '53',
    checkoutUrl: 'https://checkout.juvenex.app/?id=53',
  },
  {
    product: 'Semaglutide',
    durationMonths: 1,
    dosage: '0.25 mg/week',
    sku: 'SEMA-1M',
    stickyId: '38794',
    productId: '46',
    checkoutUrl: 'https://checkout.juvenex.app/?id=46',
  },
  {
    product: 'Semaglutide',
    durationMonths: 3,
    dosage: '0.25 mg/week',
    sku: 'SEMA-3M',
    stickyId: '38795',
    productId: '47',
    checkoutUrl: 'https://checkout.juvenex.app/?id=47',
  },
  {
    product: 'Semaglutide',
    durationMonths: 6,
    dosage: '0.25 mg/week',
    sku: 'SEMA-6M',
    stickyId: '38796',
    productId: '48',
    checkoutUrl: 'https://checkout.juvenex.app/?id=48',
  },
  {
    product: 'Semaglutide',
    durationMonths: 12,
    dosage: '0.25 mg/week',
    sku: 'SEMA-12M',
    stickyId: '38797',
    productId: '49',
    checkoutUrl: 'https://checkout.juvenex.app/?id=49',
  },
] as const

/**
 * When exact duplicates exist under multiple partner IDs, keep these IDs
 * instead of the lowest numeric ID. Derived from Excel CHECKOUT_LINKS for the
 * required Tirz/Sema rows (and any other Sheet1 row where the preferred
 * checkout id is not the lowest duplicate).
 */
export const PREFERRED_CHECKOUT_PRODUCT_IDS: ReadonlySet<string> = new Set(
  REQUIRED_CHECKOUT_MAPPINGS.map((m) => m.productId)
)

export function isPreferredCheckoutProductId(id: string): boolean {
  return PREFERRED_CHECKOUT_PRODUCT_IDS.has(String(id))
}

export function findRequiredCheckoutMapping(input: {
  molecule: string | null
  doseMg: number | null
  supplyMonths: number
  kind: string
}): CheckoutMapping | undefined {
  if (input.kind !== 'standard' || input.molecule == null || input.doseMg == null) {
    return undefined
  }
  return REQUIRED_CHECKOUT_MAPPINGS.find(
    (m) =>
      m.product === input.molecule &&
      m.durationMonths === input.supplyMonths &&
      m.dosage.startsWith(String(input.doseMg))
  )
}
