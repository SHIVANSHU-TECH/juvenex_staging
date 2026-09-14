// PrescribeRx encounter-types client.
//
// Fetches the live telehealth encounter type catalog and per-type field
// schema from PrescribeRx and caches the result in-process.
//
// Mirrors the cache + inflight dedup pattern in `prescriberx-packages.ts`:
//   - List cache: single 10-min TTL entry for /telehealth/encounter-types
//   - Schema cache: per-id 10-min TTL Map for /telehealth/encounter-types/{id}/schema
//
// Public types and the raw->public mappers live in
// `prescriberx-encounter-types-mappers.ts` to keep this module focused on
// fetching, caching, and dedup.

import { logger } from './logger'
import {
  getGlobalPrescribeRxConfig,
  type PrescribeRxConfig,
} from './prescriberx-config'
import {
  mapEncounterType,
  mapSchema,
  type EncounterType,
  type EncounterTypeSchema,
  type ListEnvelope,
  type SchemaEnvelope,
} from './prescriberx-encounter-types-mappers'

export type {
  EncounterType,
  EncounterTypeField,
  EncounterTypeStep,
  EncounterTypeSchema,
} from './prescriberx-encounter-types-mappers'

const CACHE_TTL_MS = 10 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000

interface ListCache {
  data: EncounterType[]
  expiresAt: number
}

interface SchemaCacheEntry {
  data: EncounterTypeSchema
  expiresAt: number
}

let listCache: ListCache | null = null
let listInflight: Promise<EncounterType[]> | null = null
const schemaCache = new Map<string, SchemaCacheEntry>()
const schemaInflight = new Map<string, Promise<EncounterTypeSchema>>()

export function isEncounterTypesConfigured(): boolean {
  return getGlobalPrescribeRxConfig() !== null
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const err = new Error(
        `PrescribeRx ${url} failed: ${res.status} ${body.slice(0, 200)}`
      )
      ;(err as Error & { status?: number }).status = res.status
      throw err
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timeoutId)
  }
}

async function loadList(config: PrescribeRxConfig): Promise<EncounterType[]> {
  // Encounter types are platform-wide metadata in the PrescribeRx OpenAPI
  // spec — they are NOT scoped per client_id. We accept a config for
  // base/token override only; client_id is intentionally ignored here.
  const json = await getJson<ListEnvelope>(
    `${config.base}/telehealth/encounter-types`,
    config.token
  )
  if (!Array.isArray(json.data)) {
    throw new Error('PrescribeRx /telehealth/encounter-types returned invalid payload')
  }
  return json.data.map(mapEncounterType)
}

async function loadSchema(
  id: string,
  config: PrescribeRxConfig
): Promise<EncounterTypeSchema> {
  // Schema is also platform-wide; client_id intentionally not appended.
  const json = await getJson<SchemaEnvelope>(
    `${config.base}/telehealth/encounter-types/${id}/schema`,
    config.token
  )
  if (!json.data || typeof json.data !== 'object') {
    throw new Error('PrescribeRx encounter-type schema returned invalid payload')
  }
  return mapSchema(json.data)
}

export interface FetchEncounterTypesOptions {
  /** When omitted, env-derived global config is used. */
  config?: PrescribeRxConfig
}

export async function fetchEncounterTypes(
  opts: FetchEncounterTypesOptions = {}
): Promise<EncounterType[]> {
  const config = opts.config ?? getGlobalPrescribeRxConfig()
  if (!config) {
    throw new Error('PrescribeRx encounter types not configured')
  }
  const now = Date.now()
  if (listCache && listCache.expiresAt > now) return listCache.data
  if (listInflight) return listInflight

  listInflight = loadList(config)
    .then((data) => {
      listCache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
      return data
    })
    .catch((err: unknown) => {
      logger.error('PrescribeRx encounter-types load failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      if (listCache) return listCache.data
      throw err
    })
    .finally(() => {
      listInflight = null
    })

  return listInflight
}

export async function fetchEncounterTypeSchema(
  id: string,
  opts: FetchEncounterTypesOptions = {}
): Promise<EncounterTypeSchema> {
  const config = opts.config ?? getGlobalPrescribeRxConfig()
  if (!config) {
    throw new Error('PrescribeRx encounter types not configured')
  }
  const now = Date.now()
  const cached = schemaCache.get(id)
  if (cached && cached.expiresAt > now) return cached.data

  const existing = schemaInflight.get(id)
  if (existing) return existing

  const promise = loadSchema(id, config)
    .then((data) => {
      schemaCache.set(id, { data, expiresAt: Date.now() + CACHE_TTL_MS })
      return data
    })
    .catch((err: unknown) => {
      logger.error('PrescribeRx encounter-type schema load failed', {
        encounterTypeId: id,
        error: err instanceof Error ? err.message : String(err),
      })
      const stale = schemaCache.get(id)
      if (stale) return stale.data
      throw err
    })
    .finally(() => {
      schemaInflight.delete(id)
    })

  schemaInflight.set(id, promise)
  return promise
}

export function invalidateEncounterTypesCache(): void {
  listCache = null
  schemaCache.clear()
}
