import type { Metadata } from 'next'
import { StoreBrowser } from '@/components/jx/store/StoreBrowser'
import { STOREFRONT_CATEGORIES, STOREFRONT_PRODUCTS } from '@/lib/jx/storefront-catalog'

/**
 * /store — static shell; category filtering is client-side in StoreBrowser so
 * chip clicks never wait on an RSC refetch. Catalog is local (no partner API).
 */

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Shop treatments',
  description:
    'Browse Juvenex treatments by category. Every option maps to a Juvenex checkout SKU.',
}

export default function StorePage() {
  return (
    <StoreBrowser
      products={STOREFRONT_PRODUCTS}
      categories={STOREFRONT_CATEGORIES}
      initialCategory={null}
    />
  )
}
