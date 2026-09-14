import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { fetchPrescribeRxCatalog, isPrescribeRxConfigured, type ShopProduct } from '@/lib/prescriberx'
import {
  getGlobalPrescribeRxConfig,
  getPrescribeRxConfigForOrg,
} from '@/lib/prescriberx-config'
import {
  applyTenantOverrides,
  fetchOverridesForOrg,
  ORG_ID_SCHEMA,
} from '@/lib/productOverrides'
import {
  classifyProductAccess,
  isApprovedMarketplaceProduct,
  tierForPlan,
  tierForPlanAndProtocols,
  type MarketplaceTier,
} from '@/lib/marketplace-access'
import { fetchPrescriptionUnlockedProductIds } from '@/lib/prescription-unlocks'
import {
  SUBSCRIPTION_ACCESS_COLUMNS,
  subscriptionGrantsAccess,
} from '@/lib/subscription-access'

const SHOP_PRODUCT_COLUMNS =
  'id, name, description, price_cents, category, image_url, external_product_id, is_active, created_at'

// Defensive: never persist upstream-vendor S3 URLs. Render-time proxy
// is the source of truth — see /api/img/[...path] and shop/page.tsx.
function sanitizeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (parsed.hostname.toLowerCase().endsWith('.s3.amazonaws.com')) {
      logger.warn('shop/products: rejecting upstream S3 image_url at write time', {
        host: parsed.hostname,
      })
      return null
    }
    return value
  } catch {
    // Malformed URLs were already filtered by z.string().url() — be defensive.
    return null
  }
}

const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(2000),
  price_cents: z.number().int().positive(),
  category: z.string().min(1).max(100),
  image_url: z
    .string()
    .url()
    .nullable()
    .optional()
    .transform((value) => sanitizeImageUrl(value ?? null)),
})

const PAGE_SIZE = 20

interface ShopProductRow {
  id: string
  name: string
  description: string
  price_cents: number
  category: string
  image_url: string | null
  external_product_id?: string | null
  is_active: boolean
  created_at: string
  access_group: string
  access_group_label: string
  is_locked: boolean
  required_tier: string
  required_tier_label: string
}

interface UpstreamLoadResult {
  products: ShopProductRow[]
  total: number
  appliedOverridesCount: number | null
}

interface MarketplaceAccessContext {
  tier: MarketplaceTier
  userId: string | null
  organizationId: string | null
}

async function loadFromUpstream(
  category: string | null,
  page: number,
  limit: number,
  overrideOrgId: string | null,
  marketplaceTier: MarketplaceTier,
  unlockedProductIds: ReadonlySet<string>
): Promise<UpstreamLoadResult | null> {
  if (!isPrescribeRxConfigured()) return null
  try {
    // Per-tenant routing: when an org is in scope, resolve its
    // PrescribeRx client_id and pull THAT tenant's catalog. Otherwise use
    // the platform-wide (token-default) catalog.
    const config = overrideOrgId
      ? await getPrescribeRxConfigForOrg(overrideOrgId)
      : getGlobalPrescribeRxConfig()
    const all = await fetchPrescribeRxCatalog(
      config ? { config } : {}
    )

    // Step 1: apply tenant overrides BEFORE category filter + pagination so
    // hidden products don't inflate `total` and price overrides are reflected
    // in any future server-side sort that touches price.
    let working: ShopProduct[] = all
    let appliedOverridesCount: number | null = null
    if (overrideOrgId) {
      const supabase = createAdminClient()
      const overrides = await fetchOverridesForOrg(supabase, overrideOrgId)
      const result = applyTenantOverrides(all, overrides)
      working = result.products
      appliedOverridesCount = result.appliedCount
    }

    // Fire-and-forget + throttled: this is a WRITE that changes nothing between
    // cached catalog reads, so it must not block (or run on) every shop view.
    void syncPrescribeRxProductMappings(working, overrideOrgId)

    // Allowlist: only surface products that map to an approved peptide. Drops
    // unlisted upstream items (e.g. GHK-Cu) before grouping/pagination.
    const approved = working.filter((p) => isApprovedMarketplaceProduct(p))

    const annotated = approved.map((p) =>
      withMarketplaceAccess(p, marketplaceTier, unlockedProductIds)
    )
    const filtered: ShopProductRow[] = category
      ? annotated.filter((p) => p.access_group_label === category || p.category === category)
      : annotated
    const total = filtered.length
    const offset = (page - 1) * limit
    const products: ShopProductRow[] = filtered
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(offset, offset + limit)
    return { products, total, appliedOverridesCount }
  } catch (error: unknown) {
    logger.warn('shop/products: PrescribeRx fetch failed, falling back to DB', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

// Throttle the mapping-sync write to at most once per this window per org, so
// a busy shop doesn't upsert 50 rows on every single GET (the catalog is
// cached ~10min, so nothing changes between syncs anyway).
const SYNC_THROTTLE_MS = 10 * 60 * 1000
const lastSyncAt = new Map<string, number>()

async function syncPrescribeRxProductMappings(
  products: ShopProduct[],
  organizationId: string | null
): Promise<void> {
  if (products.length === 0) return
  const key = organizationId ?? 'global'
  const now = Date.now()
  if (now - (lastSyncAt.get(key) ?? 0) < SYNC_THROTTLE_MS) return
  lastSyncAt.set(key, now)
  const nowIso = new Date().toISOString()
  const rows = products.map((product) => ({
    organization_id: organizationId,
    product_id: product.id,
    external_product_id: product.external_product_id || null,
    sku: product.external_product_id || null,
    updated_at: nowIso,
  }))

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('prescriberx_product_mappings')
    .upsert(rows, { onConflict: 'organization_id,product_id' })

  if (error) {
    logger.warn('shop/products: failed to sync PrescribeRx product mappings', {
      error: error.message,
    })
  }
}

function withMarketplaceAccess(
  product: {
    id: string
    name: string
    description: string
    price_cents: number
    category: string
    image_url: string | null
    external_product_id?: string | null
    is_active: boolean
    created_at: string
  },
  tier: MarketplaceTier,
  unlockedProductIds: ReadonlySet<string> = new Set()
): ShopProductRow {
  const access = classifyProductAccess(product, tier)
  const unlockKeys = [product.id, product.external_product_id].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )
  const prescriptionUnlocked = unlockKeys.some((key) => unlockedProductIds.has(key))
  return {
    ...product,
    access_group: access.group.slug,
    access_group_label: access.group.label,
    is_locked: access.locked && !prescriptionUnlocked,
    required_tier: access.requiredTier.slug,
    required_tier_label: access.requiredTier.label,
  }
}

async function resolveMarketplaceAccessContext(): Promise<MarketplaceAccessContext> {
  try {
    const user = await getAuthUser()
    if (!user) {
      return {
        tier: tierForPlan(null),
        userId: null,
        organizationId: null,
      }
    }

    const supabase = createAdminClient()
    // Only PAID statuses unlock products. A 'pending' row (a plan chosen at
    // signup or pre-StoreKit-purchase) must NOT clear the paywall — otherwise a
    // native user who selects a tier and cancels the Apple sheet sees every
    // peptide unlocked for free. Matches the authoritative gate in
    // /api/payments/subscription.
    const { data, error } = await supabase
      .from('subscriptions')
      .select(
        `plan, created_at, selected_protocols, ${SUBSCRIPTION_ACCESS_COLUMNS}`
      )
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      logger.warn('shop/products: subscription lookup failed; using base tier', {
        userId: user.id,
        error: error.message,
      })
      return {
        tier: tierForPlan(null),
        userId: user.id,
        organizationId: user.organization_id ?? null,
      }
    }

    // Period-bound: a 'trialing'/one-time row whose window has lapsed no longer
    // unlocks products, even though its status is still in the query filter.
    const unlocked = subscriptionGrantsAccess(data)
    return {
      tier: unlocked
        ? tierForPlanAndProtocols(
            (data?.plan as string | null | undefined) ?? null,
            data?.selected_protocols as string[] | null | undefined
          )
        : tierForPlan(null),
      userId: user.id,
      organizationId: user.organization_id ?? null,
    }
  } catch (error: unknown) {
    logger.warn('shop/products: marketplace tier resolution failed; using base tier', {
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      tier: tierForPlan(null),
      userId: null,
      organizationId: null,
    }
  }
}

/**
 * Decide whether the caller is allowed to see a given org's effective
 * catalog (overrides applied to the upstream PrescribeRx feed). Authorized
 * when:
 *   - the caller is super_admin, or
 *   - the caller is authenticated AND their profile.organization_id matches.
 *
 * Anyone else falls through to the existing DB path so this addition cannot
 * break public/anonymous shop traffic.
 */
async function canSeeOrgCatalog(orgId: string): Promise<boolean> {
  const orgIdCheck = ORG_ID_SCHEMA.safeParse(orgId)
  if (!orgIdCheck.success) return false
  try {
    const user = await getAuthUser()
    if (!user) return false
    if (user.role === 'super_admin') return true
    return user.organization_id === orgIdCheck.data
  } catch (error: unknown) {
    logger.warn('shop/products: auth check failed for org-scoped catalog', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const category = searchParams.get('category')
    const organizationId = searchParams.get('organization_id')
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? String(PAGE_SIZE))))
    const offset = (page - 1) * limit
    const accessContext = await resolveMarketplaceAccessContext()
    const supabase = createAdminClient()

    // Prefer live PrescribeRx catalog.
    //
    // If organizationId is supplied AND the caller is authorized for that
    // org, apply that org's tenant_product_overrides on top of upstream
    // before paginating. If the caller is not authorized for the org, fall
    // through to the existing local-DB path — never leak another tenant's
    // catalog through the upstream branch.
    let overrideOrgId: string | null = null
    if (organizationId) {
      const allowed = await canSeeOrgCatalog(organizationId)
      if (allowed) {
        overrideOrgId = organizationId
      }
    }

    const unlockOrgId = overrideOrgId ?? accessContext.organizationId
    const unlockedProductIds = accessContext.userId
      ? await fetchPrescriptionUnlockedProductIds(supabase, accessContext.userId, {
          organizationId: unlockOrgId,
        })
      : new Set<string>()

    // Tracks whether we fell back to the local seed table BECAUSE a configured
    // PrescribeRx catalog fetch failed (e.g. expired token), as opposed to
    // PrescribeRx simply not being configured. Only the former is a degraded
    // state worth surfacing: otherwise catalog-only meds (e.g. anastrozole)
    // silently vanish from the shop with no explanation to the shopper.
    let catalogUnavailable = false

    if (!organizationId || overrideOrgId) {
      const upstream = await loadFromUpstream(
        category,
        page,
        limit,
        overrideOrgId,
        accessContext.tier,
        unlockedProductIds
      )
      if (upstream) {
        return Response.json({
          success: true,
          data: upstream.products,
          meta: {
            total: upstream.total,
            page,
            limit,
            source: 'prescriberx',
            ...(upstream.appliedOverridesCount !== null
              ? { applied_overrides_count: upstream.appliedOverridesCount }
              : {}),
          },
        })
      }
      // upstream === null while PrescribeRx IS configured means the live fetch
      // failed: loadFromUpstream returns null only when (a) not configured, or
      // (b) the fetch threw and was caught. Since we've confirmed it's
      // configured, this is case (b) — a genuine degradation, not a no-op.
      if (isPrescribeRxConfigured()) {
        catalogUnavailable = true
      }
    }

    // We always filter by the peptide allowlist in memory, so fetch the full
    // active catalog (bounded) and paginate after filtering rather than at the
    // DB level — this keeps `total` and pagination accurate.
    let listQuery = supabase
      .from('shop_products')
      .select(SHOP_PRODUCT_COLUMNS)
      .eq('is_active', true)
    // Use the AUTHORIZED org id (overrideOrgId), never the raw client param —
    // otherwise a caller could read another tenant's catalog + price overrides
    // by passing ?organization_id=<other-org>.
    if (overrideOrgId) listQuery = listQuery.eq('organization_id', overrideOrgId)

    const { data: productsData } = await listQuery
      .order('name', { ascending: true })
      .limit(500)

    // Allowlist: drop any product that doesn't map to an approved peptide.
    const approved = (productsData ?? []).filter((p) => isApprovedMarketplaceProduct(p))

    const annotated = approved.map((p) => withMarketplaceAccess(
      {
        id: p.id,
        name: p.name,
        description: p.description,
        price_cents: p.price_cents,
        category: p.category,
        image_url: p.image_url,
        is_active: p.is_active,
        created_at: p.created_at,
      },
      accessContext.tier,
      unlockedProductIds
    ))
    const matching = category
      ? annotated.filter((p) => p.access_group_label === category || p.category === category)
      : annotated
    const products = matching.slice(offset, offset + limit)

    return Response.json({
      success: true,
      data: products,
      meta: {
        total: matching.length,
        page,
        limit,
        source: 'database',
        ...(catalogUnavailable ? { catalog_unavailable: true } : {}),
      },
    })
  } catch (error: unknown) {
    logger.error('shop/products GET error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`shop-products:${user.id}`, 20, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const supabase = createAdminClient()

    // Check admin status via profile/organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.organization_id) {
      return Response.json({ success: false, error: 'Forbidden: admin access required' }, { status: 403 })
    }

    if (profile.role !== 'org_admin' && profile.role !== 'super_admin') {
      return Response.json({ success: false, error: 'Forbidden: admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createProductSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { data: product, error: insertError } = await supabase
      .from('shop_products')
      .insert({
        name: parsed.data.name,
        description: parsed.data.description,
        price_cents: parsed.data.price_cents,
        category: parsed.data.category,
        image_url: parsed.data.image_url ?? null,
        is_active: true,
        organization_id: profile.organization_id,
      })
      .select(SHOP_PRODUCT_COLUMNS)
      .single()

    if (insertError || !product) {
      logger.error('shop/products insert error', { error: insertError?.message })
      return Response.json({ success: false, error: 'Failed to create product' }, { status: 500 })
    }

    return Response.json({ success: true, data: product }, { status: 201 })
  } catch (error: unknown) {
    logger.error('shop/products POST error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
