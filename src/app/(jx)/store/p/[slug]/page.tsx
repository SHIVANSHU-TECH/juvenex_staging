import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FamilyDetailClient } from '@/components/jx/store/FamilyDetailClient'
import {
  STOREFRONT_PRODUCTS,
  getStorefrontProduct,
} from '@/lib/jx/storefront-catalog'

/**
 * Family PDP — local catalog only (no partner API). Force-static so navigations
 * do not wait on Get_Products / revalidation.
 *
 * Note: `searchParams` on /store are handled client-side in StoreBrowser so
 * category chips do not trigger RSC refetches.
 */

export const dynamic = 'force-static'
export const dynamicParams = false

interface PageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return STOREFRONT_PRODUCTS.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = getStorefrontProduct(slug)
  if (!product) return { title: 'Product not found' }
  return {
    title: `${product.name} — Shop`,
    description: product.tagline,
  }
}

export default async function FamilyProductPage({ params }: PageProps) {
  const { slug } = await params
  const product = getStorefrontProduct(slug)
  if (!product) notFound()

  return (
    <div className="jx-shell" style={{ paddingBlock: '22px 64px' }}>
      <nav aria-label="Breadcrumb" style={{ marginBottom: 18 }}>
        <ol
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            listStyle: 'none',
            margin: 0,
            padding: 0,
            fontSize: 12.5,
            color: 'var(--jx-muted)',
          }}
        >
          <li>
            <Link href="/" prefetch={process.env.NODE_ENV === 'production'} style={{ color: 'var(--jx-muted)' }}>
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/store" prefetch={process.env.NODE_ENV === 'production'} style={{ color: 'var(--jx-muted)' }}>
              Shop
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" style={{ color: 'var(--jx-ink)' }}>
            {product.name}
          </li>
        </ol>
      </nav>

      <FamilyDetailClient product={product} />
    </div>
  )
}
