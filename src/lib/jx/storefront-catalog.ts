/**
 * Stable public API for the KoverX-organized, Excel-mapped storefront catalog.
 * Implementation lives in the generated file so SKU↔productId mappings stay
 * regenerable from juvenex.xlsx without hand-editing.
 */
export {
  STOREFRONT_CATEGORIES,
  STOREFRONT_PRODUCTS,
  STOREFRONT_SKIPPED,
  getStorefrontProduct,
  getStorefrontProductsByCategory,
  findStorefrontPlanByProductId,
  type StorefrontCategory,
  type StorefrontCategoryKey,
  type StorefrontMedication,
  type StorefrontPlan,
  type StorefrontProduct,
} from './storefront-catalog.generated'
