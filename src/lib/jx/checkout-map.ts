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
 * Required Tirzepatide (2.5 mg/week only) and Semaglutide duration mappings.
 *
 * Checkout URL / productId / SKU match juvenex.xlsx Sheet1 preferred rows.
 * Sticky IDs below are the audit-brief values (380xx). The available workbook
 * Sheet1 lists different Sticky IDs for the same checkout URLs (e.g. id=50 →
 * Sheet1 Sticky 38798). This app does not send Sticky IDs to checkout — only
 * productId — so checkout routing uses productId exclusively.
 */
export const REQUIRED_CHECKOUT_MAPPINGS: readonly CheckoutMapping[] = [
  {
    product: 'Tirzepatide',
    durationMonths: 1,
    dosage: '2.5 mg/week',
    sku: 'TIRZ-CR1',
    stickyId: '38093',
    productId: '50',
    checkoutUrl: 'https://checkout.juvenex.app/?id=50',
  },
  {
    product: 'Tirzepatide',
    durationMonths: 3,
    dosage: '2.5 mg/week',
    sku: 'TZ-MAINT-S2-A',
    stickyId: '38094',
    productId: '51',
    checkoutUrl: 'https://checkout.juvenex.app/?id=51',
  },
  {
    product: 'Tirzepatide',
    durationMonths: 6,
    dosage: '2.5 mg/week',
    sku: 'TIRZ-2.5MG-30-6B',
    stickyId: '38095',
    productId: '52',
    checkoutUrl: 'https://checkout.juvenex.app/?id=52',
  },
  {
    product: 'Tirzepatide',
    durationMonths: 12,
    dosage: '2.5 mg/week',
    sku: 'TIRZ-2.5MG-30-12B',
    stickyId: '38096',
    productId: '53',
    checkoutUrl: 'https://checkout.juvenex.app/?id=53',
  },
  {
    product: 'Semaglutide',
    durationMonths: 1,
    dosage: '0.5 mg/week',
    sku: 'SEMA-0.5MG-30-D',
    stickyId: '38045',
    productId: '2',
    checkoutUrl: 'https://checkout.juvenex.app/?id=2',
  },
  {
    product: 'Semaglutide',
    durationMonths: 3,
    dosage: '0.25 mg/week',
    sku: 'SG-MAINT-S3-A',
    stickyId: '38090',
    productId: '47',
    checkoutUrl: 'https://checkout.juvenex.app/?id=47',
  },
  {
    product: 'Semaglutide',
    durationMonths: 6,
    dosage: '0.5 mg/week',
    sku: 'SEMA-0.5MG-30-D-6M',
    stickyId: '38078',
    productId: '35',
    checkoutUrl: 'https://checkout.juvenex.app/?id=35',
  },
  {
    product: 'Semaglutide',
    durationMonths: 12,
    dosage: '0.5 mg/week',
    sku: 'SEMA-0.5MG-30-D-12M',
    stickyId: '38084',
    productId: '41',
    checkoutUrl: 'https://checkout.juvenex.app/?id=41',
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
