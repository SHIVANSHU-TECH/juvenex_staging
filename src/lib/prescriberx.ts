// PrescribeRx upstream catalog client.
//
// Fetches the live product catalog (~332 items) and product-classes from
// PrescribeRx, maps them into the shop's product shape, and caches the
// merged result in-process for CACHE_TTL_MS to avoid hammering upstream.
//
// All callers should treat results as read-only; mutations to the catalog
// happen via PrescribeRx's own admin tooling. Image URLs are returned as
// the upstream signed S3 URLs and are expected to be routed through
// /api/img/[...path] on the client side (see src/app/shop/page.tsx).
//
// Multi-tenant routing (Model B): callers may pass a resolved
// `PrescribeRxConfig` (see prescriberx-config.ts) to scope the fetch to a
// specific PrescribeRx client_id. The cache is keyed by
// `clientId ?? 'global'` so each tenant's catalog is memoized
// independently. When no config is passed, env vars are read and a cache
// key of 'global' is used (today's behavior).

import { logger } from './logger'
import {
  getGlobalPrescribeRxConfig,
  type PrescribeRxConfig,
} from './prescriberx-config'

export interface ShopProduct {
  id: string
  name: string
  description: string
  short_description: string | null
  price_cents: number
  category: string
  image_url: string | null
  is_active: boolean
  external_product_id: string
  rx_required: boolean
  created_at: string
}

interface PrescribeRxProduct {
  id: string
  sku?: string
  name: string
  description?: string | null
  short_description?: string | null
  product_class_id?: string | null
  product_type_id?: string | null
  rx_required?: boolean
  is_active?: boolean
  image_url?: string | null
  pricing?: {
    retail_price?: number
    consumer_price?: number
    wholesale_price?: number
    price?: number
    price_type?: string
  }
}

interface PrescribeRxClass {
  id: string
  name: string
  is_active?: boolean
}

interface PrescribeRxEnvelope<T> {
  success: boolean
  data: T[]
  meta?: {
    pagination?: {
      total?: number
      per_page?: number
      current_page?: number
      last_page?: number
    }
  }
}

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const FETCH_TIMEOUT_MS = 15_000
const PER_PAGE = 100

interface CatalogCache {
  data: ShopProduct[]
  expiresAt: number
}

// Per-clientId cache and inflight maps. Key is `clientId ?? 'global'`.
const catalogCache = new Map<string, CatalogCache>()
const inflightFetch = new Map<string, Promise<ShopProduct[]>>()

export function isPrescribeRxConfigured(): boolean {
  return getGlobalPrescribeRxConfig() !== null
}

function cacheKeyFor(config: PrescribeRxConfig): string {
  return config.clientId ?? 'global'
}

async function fetchPaginated<T>(
  path: string,
  config: PrescribeRxConfig
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  while (page < 50) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const params = new URLSearchParams()
      params.set('per_page', String(PER_PAGE))
      params.set('page', String(page))
      if (config.clientId) params.set('client_id', config.clientId)
      const sep = path.includes('?') ? '&' : '?'
      const url = `${config.base}${path}${sep}${params.toString()}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`PrescribeRx ${path} failed: ${res.status} ${body.slice(0, 200)}`)
      }
      const json = (await res.json()) as PrescribeRxEnvelope<T>
      if (!json.success) throw new Error(`PrescribeRx ${path} returned success=false`)
      all.push(...json.data)
      const last = json.meta?.pagination?.last_page ?? page
      if (page >= last || json.data.length < PER_PAGE) break
      page += 1
    } finally {
      clearTimeout(timeoutId)
    }
  }
  return all
}

function mapProduct(p: PrescribeRxProduct, classNameById: Map<string, string>): ShopProduct {
  // Customer-facing price. `pricing.price` is our org's WHOLESALE cost
  // (price_type: "wholesale") — the PRX embed checkout charges the customer
  // the sales-org retail price, so the shop must display the same or carts
  // won't match the final checkout total (verified against all 22 products
  // in embed dM3nSqfERswp: embed price == retail_price).
  const priceUsd =
    p.pricing?.retail_price ?? p.pricing?.consumer_price ?? p.pricing?.price ?? 0
  const className = (p.product_class_id && classNameById.get(p.product_class_id)) || 'General'
  return {
    id: p.id,
    name: p.name.trim(),
    description: (p.description ?? p.short_description ?? '').trim(),
    short_description: p.short_description?.trim() ?? null,
    price_cents: Math.round(priceUsd * 100),
    category: className,
    image_url: p.image_url ?? null,
    is_active: p.is_active ?? true,
    external_product_id: p.id,
    rx_required: p.rx_required ?? false,
    created_at: new Date().toISOString(),
  }
}

async function loadCatalog(config: PrescribeRxConfig): Promise<ShopProduct[]> {
  const [products, classes] = await Promise.all([
    fetchPaginated<PrescribeRxProduct>('/products', config),
    fetchPaginated<PrescribeRxClass>('/product-classes', config),
  ])

  const classNameById = new Map<string, string>()
  for (const c of classes) classNameById.set(c.id, c.name)

  const mapped = products
    .filter((p) => p.is_active !== false)
    .map((p) => mapProduct(p, classNameById))

  return mapped
}

export interface FetchCatalogOptions {
  /** When omitted, env-derived global config (no client_id) is used. */
  config?: PrescribeRxConfig
}

export async function fetchPrescribeRxCatalog(
  opts: FetchCatalogOptions = {}
): Promise<ShopProduct[]> {
  const config = opts.config ?? getGlobalPrescribeRxConfig()
  if (!config) {
    throw new Error('PrescribeRx API not configured')
  }

  const key = cacheKeyFor(config)
  const now = Date.now()
  const cached = catalogCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.data
  }
  const existing = inflightFetch.get(key)
  if (existing) return existing

  const promise = loadCatalog(config)
    .then((data) => {
      catalogCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
      return data
    })
    .catch((err: unknown) => {
      logger.error('PrescribeRx catalog load failed', {
        cacheKey: key,
        error: err instanceof Error ? err.message : String(err),
      })
      // Serve stale data if we have it; otherwise propagate.
      const stale = catalogCache.get(key)
      if (stale) return stale.data
      throw err
    })
    .finally(() => {
      inflightFetch.delete(key)
    })

  inflightFetch.set(key, promise)
  return promise
}

/**
 * Drops the catalog cache for a single tenant (or all when no key passed).
 * Pass `clientId` to scope to one tenant; pass null/undefined to clear all.
 */
export function invalidatePrescribeRxCatalogCache(clientId?: string | null): void {
  if (clientId === undefined) {
    catalogCache.clear()
    return
  }
  catalogCache.delete(clientId ?? 'global')
}
