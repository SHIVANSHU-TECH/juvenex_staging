// PrescribeRx config resolver — Model B per-tenant routing.
//
// Centralized helper that resolves the (base, token, client_id) tuple used
// for every PrescribeRx API call. Two layers:
//
//   - getGlobalPrescribeRxConfig():
//       Returns env-derived config WITHOUT client_id. Used for platform-wide
//       reads (encounter-types catalog, admin-master catalog, unauthenticated
//       shop browse) and as the base for every per-org call.
//
//   - getPrescribeRxConfigForOrg(organizationId):
//       Returns config with client_id resolved from
//       `organizations.prescriberx_client_id`. When the org row is missing
//       or its mapping is null, returns config with `clientId: null` so
//       callers fall through to the token's default scope (today's
//       single-tenant behavior).
//
// Org → clientId mappings rarely change, so we cache them in-process for
// CACHE_TTL_MS to avoid hitting the DB on every PrescribeRx-touching
// request. Call `invalidatePrescribeRxConfigCache(orgId)` after admin
// updates the mapping.

import { createAdminClient } from './supabase/admin'
import { logger } from './logger'

export interface PrescribeRxConfig {
  /** Base URL with no trailing slash, e.g. "https://prescribe-rx.com/api/v1". */
  base: string
  /** Bearer token from PRESCRIBERX_API_TOKEN. */
  token: string
  /**
   * Per-tenant Client UUID. When set, callers should pass it on every
   * PrescribeRx call (as `?client_id=` for catalog reads or as a top-level
   * `client_id` body field for unified intake). When null, omit the param
   * entirely — the token's default sales-org scope applies.
   */
  clientId: string | null
}

const CACHE_TTL_MS = 60_000 // 60 seconds

interface OrgClientIdCacheEntry {
  clientId: string | null
  expiresAt: number
}

const orgClientIdCache = new Map<string, OrgClientIdCacheEntry>()
const orgClientIdInflight = new Map<string, Promise<string | null>>()

function readApiBase(): string | null {
  const raw = process.env.PRESCRIBERX_API_BASE
  if (!raw || raw.length === 0) return null
  return raw.replace(/\/+$/, '')
}

function readApiToken(): string | null {
  const raw = process.env.PRESCRIBERX_API_TOKEN
  return raw && raw.length > 0 ? raw : null
}

/**
 * Returns env-derived config with no client_id. Returns null when either
 * PRESCRIBERX_API_BASE or PRESCRIBERX_API_TOKEN is missing/empty.
 */
export function getGlobalPrescribeRxConfig(): PrescribeRxConfig | null {
  const base = readApiBase()
  const token = readApiToken()
  if (!base || !token) return null
  return { base, token, clientId: null }
}

/**
 * Looks up `organizations.prescriberx_client_id` (cached) and returns it.
 * Returns null when:
 *   - the row does not exist,
 *   - the column is null/empty,
 *   - the lookup fails (logged; we fail open to global scope so a transient
 *     DB blip does not break the whole intake flow).
 */
async function loadOrgClientIdUncached(
  organizationId: string
): Promise<string | null> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('prescriberx_client_id')
      .eq('id', organizationId)
      .maybeSingle()
    if (error) {
      logger.error('PrescribeRx config: organizations lookup failed', {
        organizationId,
        error: error.message,
      })
      return null
    }
    if (!data) return null
    const raw = (data as { prescriberx_client_id?: string | null })
      .prescriberx_client_id
    if (typeof raw !== 'string') return null
    const trimmed = raw.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch (err: unknown) {
    logger.error('PrescribeRx config: organizations lookup threw', {
      organizationId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

async function getOrgClientId(organizationId: string): Promise<string | null> {
  const now = Date.now()
  const cached = orgClientIdCache.get(organizationId)
  if (cached && cached.expiresAt > now) return cached.clientId

  const existing = orgClientIdInflight.get(organizationId)
  if (existing) return existing

  const promise = loadOrgClientIdUncached(organizationId)
    .then((clientId) => {
      orgClientIdCache.set(organizationId, {
        clientId,
        expiresAt: Date.now() + CACHE_TTL_MS,
      })
      return clientId
    })
    .finally(() => {
      orgClientIdInflight.delete(organizationId)
    })

  orgClientIdInflight.set(organizationId, promise)
  return promise
}

/**
 * Returns the per-org PrescribeRx config. Returns null only when the env
 * vars are missing (i.e. PrescribeRx integration is not configured at all).
 * When the org has no mapping, returns config with `clientId: null` so
 * callers transparently fall back to the token's default scope.
 */
export async function getPrescribeRxConfigForOrg(
  organizationId: string
): Promise<PrescribeRxConfig | null> {
  const global = getGlobalPrescribeRxConfig()
  if (!global) return null
  const clientId = await getOrgClientId(organizationId)
  return { ...global, clientId }
}

/**
 * Drops cached org → clientId mappings. Call after an admin update to
 * `organizations.prescriberx_client_id`. With no argument, clears the
 * entire cache.
 */
export function invalidatePrescribeRxConfigCache(
  organizationId?: string
): void {
  if (!organizationId) {
    orgClientIdCache.clear()
    return
  }
  orgClientIdCache.delete(organizationId)
}
