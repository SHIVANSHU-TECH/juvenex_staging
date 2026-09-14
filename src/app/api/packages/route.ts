import { NextRequest } from 'next/server'
import { logger } from '@/lib/logger'
import { getAuthUser } from '@/lib/supabase/server'
import {
  getGlobalPrescribeRxConfig,
  getPrescribeRxConfigForOrg,
  type PrescribeRxConfig,
} from '@/lib/prescriberx-config'
import {
  fetchPrescribeRxPackages,
  isPackagesConfigured,
  type PrescribeRxPackage,
} from '@/lib/prescriberx-packages'

// Public read-only listing of PrescribeRx packages (membership / subscription
// bundles such as "GLP-3R Package" or "Cellular Regenerative Therapy").
//
// Optional query params:
//   slug   — return only the package matching this slug
//   id     — return only the package matching this id
//
// Per-tenant routing (Model B): when the caller is authenticated AND has an
// `organization_id`, the package fetch is scoped to that org's PrescribeRx
// client_id (resolved via prescriberx-config). Anonymous callers fall
// through to the global / token-default catalog so public marketing pages
// still render. Org-scope failures degrade silently to global to avoid
// blocking the storefront.
//
// We intentionally do NOT apply tenant_product_overrides here: packages are
// upstream catalog items, not individual SKUs. Per-tenant package gating
// will be a separate `tenant_package_overrides` table when the client sends
// the package matrix.

async function resolveConfig(): Promise<PrescribeRxConfig | null> {
  try {
    const user = await getAuthUser()
    if (user?.organization_id) {
      const orgConfig = await getPrescribeRxConfigForOrg(user.organization_id)
      if (orgConfig) return orgConfig
    }
  } catch (error: unknown) {
    logger.warn('packages GET: per-org config resolution failed; using global', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return getGlobalPrescribeRxConfig()
}

export async function GET(request: NextRequest) {
  if (!isPackagesConfigured()) {
    return Response.json(
      { success: false, error: 'Package catalog not configured' },
      { status: 503 }
    )
  }

  try {
    const config = await resolveConfig()
    const all = await fetchPrescribeRxPackages(config ? { config } : {})
    const { searchParams } = request.nextUrl
    const slug = searchParams.get('slug')
    const id = searchParams.get('id')

    let filtered: PrescribeRxPackage[] = all
    if (slug) filtered = filtered.filter((p) => p.slug === slug)
    if (id) filtered = filtered.filter((p) => p.id === id)

    return Response.json({
      success: true,
      data: filtered,
      meta: {
        total: filtered.length,
        source: 'prescriberx',
        scope: config?.clientId ? 'tenant' : 'global',
      },
    })
  } catch (error: unknown) {
    logger.error('packages GET error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      { success: false, error: 'Failed to load packages' },
      { status: 502 }
    )
  }
}
