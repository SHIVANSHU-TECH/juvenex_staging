// PrescribeRx packages client.
//
// Fetches the live package catalog (membership / subscription bundles)
// from PrescribeRx and caches the result in-process for CACHE_TTL_MS.
// Mirror of the products fetcher in prescriberx.ts — same error handling
// and dedup-on-inflight-fetch pattern.
//
// A "package" wraps one or more line items (e.g. Glutathione + Sermorelin)
// and exposes either a one-time retail price OR a set of subscription plans
// (1/3/6-month tiers). Callers should treat the returned shape as read-only.
//
// Multi-tenant routing (Model B): callers may pass a resolved
// `PrescribeRxConfig` to scope the fetch to a specific PrescribeRx
// client_id. The cache is keyed by `clientId ?? 'global'`.

import { logger } from './logger'
import {
  getGlobalPrescribeRxConfig,
  type PrescribeRxConfig,
} from './prescriberx-config'

export interface PackageItem {
  id: string
  display_name: string
  product_id: string | null
  product_sku: string | null
  quantity: number
  is_primary: boolean
  is_optional: boolean
  additional_price: number
  sort_order: number
}

export interface PackagePlan {
  id: string
  name: string
  slug: string
  is_active: boolean
  is_default: boolean
  price: number
  price_per_month: number | null
  term_months: number | null
  term_weeks: number | null
  subscription_interval_days: number | null
  shipments_per_term: number | null
  days_between_shipments: number | null
}

export interface PrescribeRxPackage {
  id: string
  package_number: string
  name: string
  slug: string
  description: string
  is_active: boolean
  retail_price_cents: number
  consumer_price_cents: number
  items: PackageItem[]
  plans: PackagePlan[]
}

interface RawItem {
  id: string
  display_name: string | null
  product_id: string | null
  product_sku: string | null
  quantity?: number | null
  is_primary?: boolean | null
  is_optional?: boolean | null
  additional_price?: number | null
  sort_order?: number | null
}

interface RawPlan {
  id: string
  name: string
  slug: string
  is_active?: boolean | null
  is_default?: boolean | null
  price?: number | null
  price_per_month?: number | null
  term_months?: number | null
  term_weeks?: number | null
  subscription_interval_days?: number | null
  shipments_per_term?: number | null
  days_between_shipments?: number | null
}

interface RawPackage {
  id: string
  package_number?: string
  name: string
  slug?: string
  description?: string | null
  is_active?: boolean | null
  pricing?: {
    retail_price?: number | null
    consumer_price?: number | null
    price?: number | null
  } | null
  items?: RawItem[] | null
  plans?: RawPlan[] | null
}

interface Envelope<T> {
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

const CACHE_TTL_MS = 10 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000
const PER_PAGE = 100

interface PackageCache {
  data: PrescribeRxPackage[]
  expiresAt: number
}

// Per-clientId cache and inflight maps.
const cache = new Map<string, PackageCache>()
const inflight = new Map<string, Promise<PrescribeRxPackage[]>>()

export function isPackagesConfigured(): boolean {
  return getGlobalPrescribeRxConfig() !== null
}

function cacheKeyFor(config: PrescribeRxConfig): string {
  return config.clientId ?? 'global'
}

async function fetchPaginated(config: PrescribeRxConfig): Promise<RawPackage[]> {
  const all: RawPackage[] = []
  let page = 1
  while (page < 50) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const params = new URLSearchParams()
      params.set('per_page', String(PER_PAGE))
      params.set('page', String(page))
      if (config.clientId) params.set('client_id', config.clientId)
      const url = `${config.base}/packages?${params.toString()}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`PrescribeRx /packages failed: ${res.status} ${body.slice(0, 200)}`)
      }
      const json = (await res.json()) as Envelope<RawPackage>
      if (!json.success) throw new Error('PrescribeRx /packages returned success=false')
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

function toCents(usd: number | null | undefined): number {
  if (typeof usd !== 'number' || !Number.isFinite(usd)) return 0
  return Math.round(usd * 100)
}

function mapItem(raw: RawItem): PackageItem {
  return {
    id: raw.id,
    display_name: (raw.display_name ?? '').trim(),
    product_id: raw.product_id ?? null,
    product_sku: raw.product_sku ?? null,
    quantity: raw.quantity ?? 1,
    is_primary: Boolean(raw.is_primary),
    is_optional: Boolean(raw.is_optional),
    additional_price: raw.additional_price ?? 0,
    sort_order: raw.sort_order ?? 0,
  }
}

function mapPlan(raw: RawPlan): PackagePlan {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    is_active: raw.is_active ?? true,
    is_default: Boolean(raw.is_default),
    price: raw.price ?? 0,
    price_per_month: raw.price_per_month ?? null,
    term_months: raw.term_months ?? null,
    term_weeks: raw.term_weeks ?? null,
    subscription_interval_days: raw.subscription_interval_days ?? null,
    shipments_per_term: raw.shipments_per_term ?? null,
    days_between_shipments: raw.days_between_shipments ?? null,
  }
}

function mapPackage(raw: RawPackage): PrescribeRxPackage {
  return {
    id: raw.id,
    package_number: raw.package_number ?? '',
    name: raw.name.trim(),
    slug: raw.slug ?? '',
    description: (raw.description ?? '').trim(),
    is_active: raw.is_active ?? true,
    retail_price_cents: toCents(raw.pricing?.retail_price ?? raw.pricing?.price),
    consumer_price_cents: toCents(raw.pricing?.consumer_price ?? raw.pricing?.price),
    items: (raw.items ?? []).map(mapItem).sort((a, b) => a.sort_order - b.sort_order),
    plans: (raw.plans ?? []).map(mapPlan).filter((p) => p.is_active),
  }
}

async function loadPackages(config: PrescribeRxConfig): Promise<PrescribeRxPackage[]> {
  const raw = await fetchPaginated(config)
  return raw.filter((p) => p.is_active !== false).map(mapPackage)
}

export interface FetchPackagesOptions {
  /** When omitted, env-derived global config (no client_id) is used. */
  config?: PrescribeRxConfig
}

export async function fetchPrescribeRxPackages(
  opts: FetchPackagesOptions = {}
): Promise<PrescribeRxPackage[]> {
  const config = opts.config ?? getGlobalPrescribeRxConfig()
  if (!config) {
    throw new Error('PrescribeRx packages not configured')
  }

  const key = cacheKeyFor(config)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) return cached.data
  const existing = inflight.get(key)
  if (existing) return existing

  const promise = loadPackages(config)
    .then((data) => {
      cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
      return data
    })
    .catch((err: unknown) => {
      logger.error('PrescribeRx packages load failed', {
        cacheKey: key,
        error: err instanceof Error ? err.message : String(err),
      })
      const stale = cache.get(key)
      if (stale) return stale.data
      throw err
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

/**
 * Drops the packages cache for a single tenant (or all when no arg passed).
 */
export function invalidatePackagesCache(clientId?: string | null): void {
  if (clientId === undefined) {
    cache.clear()
    return
  }
  cache.delete(clientId ?? 'global')
}
