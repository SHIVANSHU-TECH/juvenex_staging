// Server-only shared helpers for tenant_product_overrides.
//
// Two callsites consume this:
//   1. The admin API under /api/admin/organizations/[id]/product-overrides
//      (JSON, CSV) — write side.
//   2. The shop catalog endpoint /api/shop/products — read side, applied to
//      the upstream PrescribeRx catalog when the request is scoped to an org.
//
// Default semantics live here so every callsite agrees:
//   - A product NOT in the override table is INCLUDED with the upstream price.
//   - included = false hides the product from that org's catalog.
//   - price_override_cents != null replaces the upstream price for that org.
//
// Do not import this module from client code — it pulls in the service-role
// Supabase client.
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import type { ShopProduct } from '@/lib/prescriberx'

export const ORG_ID_SCHEMA = z.string().uuid()

// Single override row as exposed to the client. We deliberately keep the
// shape narrow (no created_by, no created_at) — it mirrors what the admin UI
// needs to render and edit.
export interface ProductOverrideRecord {
  product_id: string
  included: boolean
  price_override_cents: number | null
  updated_at: string
}

const productIdSchema = z
  .string()
  .min(1, 'product_id is required')
  // Catalog ids today are uuids, but PrescribeRx could change that. Accept
  // any non-empty string up to a sane cap to avoid runaway payloads.
  .max(128, 'product_id too long')

export const overrideEntrySchema = z
  .object({
    product_id: productIdSchema,
    included: z.boolean(),
    // Use coerce on the JSON path so admin UI components that round-trip
    // numeric inputs as strings still validate. CSV path coerces explicitly.
    price_override_cents: z
      .number()
      .int('price_override_cents must be an integer')
      .nonnegative('price_override_cents cannot be negative')
      .max(10_000_000, 'price_override_cents exceeds sanity cap')
      .nullable()
      .optional(),
  })
  .strict()

export type OverrideEntryInput = z.infer<typeof overrideEntrySchema>

// Hard cap on a single bulk request to prevent runaway payloads. Mirrored on
// the CSV path. Tuned to comfortably cover the ~332-product PrescribeRx
// catalog with headroom.
export const MAX_BULK_OVERRIDES = 500

export const bulkOverrideBodySchema = z
  .object({
    overrides: z
      .array(overrideEntrySchema)
      .min(1, 'overrides cannot be empty')
      .max(
        MAX_BULK_OVERRIDES,
        `overrides exceeds limit of ${MAX_BULK_OVERRIDES} entries`
      ),
  })
  .strict()

export type BulkOverrideBody = z.infer<typeof bulkOverrideBodySchema>

interface UpsertResult {
  upserted_count: number
  skipped_count: number
}

/**
 * Bulk upsert overrides into tenant_product_overrides.
 *
 * Dedupe by product_id (last write wins) before sending to the database to
 * avoid the unique-index violation that Supabase upsert returns for duplicates
 * within the same payload. The number of duplicates is reported as
 * skipped_count so the UI can surface it.
 *
 * Returns null on database error (caller should 500). Never throws.
 */
export async function upsertOverrides(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  entries: ReadonlyArray<OverrideEntryInput>
): Promise<UpsertResult | null> {
  // Last write wins on duplicate product_id — matches the on-conflict update
  // semantics the database would apply anyway, just done client-side so the
  // skipped count is accurate.
  const byProduct = new Map<string, OverrideEntryInput>()
  for (const entry of entries) {
    byProduct.set(entry.product_id, entry)
  }
  const skipped = entries.length - byProduct.size

  const rows = Array.from(byProduct.values()).map((entry) => ({
    organization_id: orgId,
    product_id: entry.product_id,
    included: entry.included,
    price_override_cents: entry.price_override_cents ?? null,
    created_by: userId,
  }))

  const { error } = await supabase
    .from('tenant_product_overrides')
    .upsert(rows, { onConflict: 'organization_id,product_id' })

  if (error) {
    logger.error('upsertOverrides failed', {
      orgId,
      attempted: rows.length,
      error: error.message,
    })
    return null
  }

  return { upserted_count: rows.length, skipped_count: skipped }
}

const overrideRowSchema = z.object({
  product_id: z.string(),
  included: z.boolean(),
  price_override_cents: z.number().int().nullable(),
  updated_at: z.string(),
})

/**
 * Read all override rows for an organization. Returns [] on db error after
 * logging — callers should treat a fetch failure as "no overrides" rather
 * than 500ing the user-facing shop endpoint.
 */
export async function fetchOverridesForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<ProductOverrideRecord[]> {
  const { data, error } = await supabase
    .from('tenant_product_overrides')
    .select('product_id, included, price_override_cents, updated_at')
    .eq('organization_id', orgId)

  if (error) {
    logger.error('fetchOverridesForOrg failed', {
      orgId,
      error: error.message,
    })
    return []
  }

  // Defensive parse so a column-rename in the migration can't silently ship
  // a typed-as-anything result downstream.
  const records: ProductOverrideRecord[] = []
  for (const row of data ?? []) {
    const parsed = overrideRowSchema.safeParse(row)
    if (parsed.success) {
      records.push(parsed.data)
    }
  }
  return records
}

/**
 * Apply an org's overrides to an upstream product catalog.
 *
 *   - Drop products where included === false.
 *   - Replace price_cents with price_override_cents when set.
 *   - Pass through products with no override row unchanged (default-included).
 *
 * Returns the filtered list plus the count of override rows that actually
 * matched a product so callers can surface meta.applied_overrides_count.
 */
export function applyTenantOverrides(
  catalog: ReadonlyArray<ShopProduct>,
  overrides: ReadonlyArray<ProductOverrideRecord>
): { products: ShopProduct[]; appliedCount: number } {
  if (overrides.length === 0) {
    return { products: catalog.slice(), appliedCount: 0 }
  }

  const overrideById = new Map<string, ProductOverrideRecord>()
  for (const o of overrides) {
    overrideById.set(o.product_id, o)
  }

  const products: ShopProduct[] = []
  let appliedCount = 0

  for (const product of catalog) {
    const o = overrideById.get(product.id)
    if (!o) {
      products.push(product)
      continue
    }
    appliedCount += 1
    if (!o.included) {
      continue
    }
    if (o.price_override_cents !== null) {
      products.push({ ...product, price_cents: o.price_override_cents })
      continue
    }
    products.push(product)
  }

  return { products, appliedCount }
}

// CSV parsing for the bulk-import path. Lives here so the route stays under
// the 250-line limit and so unit tests (when added) can target the parser
// without spinning up a Next route handler.
//
// TODO: this parser does NOT handle RFC-4180 quoted fields, embedded commas,
// or escaped newlines. Today every product_id is a uuid and the other two
// columns are simple scalars, so a split-based parser is sufficient. Swap in
// a battle-tested parser (e.g. csv-parse) before importing fields that may
// contain commas, quotes, or newlines.
const CSV_REQUIRED_HEADERS = [
  'product_id',
  'included',
  'price_override_cents',
] as const

export interface CsvRowError {
  line: number
  error: string
  raw?: string
}

export interface ParsedOverrideCsv {
  rows: OverrideEntryInput[]
  errors: CsvRowError[]
}

function parseCsvBoolean(raw: string): boolean | null {
  const v = raw.trim().toLowerCase()
  if (v === 'true' || v === '1' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'no') return false
  return null
}

function parseCsvPriceCents(raw: string): number | null | 'invalid' {
  const v = raw.trim()
  if (v === '' || v.toLowerCase() === 'null') return null
  if (!/^-?\d+$/.test(v)) return 'invalid'
  return Number(v)
}

export function parseOverrideCsv(text: string): ParsedOverrideCsv {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }

  const rows: OverrideEntryInput[] = []
  const errors: CsvRowError[] = []

  if (lines.length === 0) {
    errors.push({ line: 0, error: 'CSV is empty' })
    return { rows, errors }
  }

  const headerCells = lines[0].split(',').map((c) => c.trim().toLowerCase())
  for (let i = 0; i < CSV_REQUIRED_HEADERS.length; i += 1) {
    if (headerCells[i] !== CSV_REQUIRED_HEADERS[i]) {
      errors.push({
        line: 1,
        error: `Header row must be exactly: ${CSV_REQUIRED_HEADERS.join(',')}`,
        raw: lines[0],
      })
      return { rows, errors }
    }
  }

  for (let i = 1; i < lines.length; i += 1) {
    const lineNumber = i + 1 // 1-indexed for human-friendly error reports
    const raw = lines[i]
    if (raw.trim() === '') continue

    const cells = raw.split(',')
    if (cells.length < 2 || cells.length > 3) {
      errors.push({
        line: lineNumber,
        error: `Expected 2-3 columns, got ${cells.length}`,
        raw,
      })
      continue
    }

    const productId = cells[0].trim()
    const included = parseCsvBoolean(cells[1] ?? '')
    if (included === null) {
      errors.push({
        line: lineNumber,
        error: 'included must be true/false/1/0/yes/no',
        raw,
      })
      continue
    }

    let priceOverrideCents: number | null = null
    if (cells.length === 3) {
      const parsedPrice = parseCsvPriceCents(cells[2] ?? '')
      if (parsedPrice === 'invalid') {
        errors.push({
          line: lineNumber,
          error: 'price_override_cents must be an integer, blank, or "null"',
          raw,
        })
        continue
      }
      priceOverrideCents = parsedPrice
    }

    const parsed = overrideEntrySchema.safeParse({
      product_id: productId,
      included,
      price_override_cents: priceOverrideCents,
    })
    if (!parsed.success) {
      errors.push({
        line: lineNumber,
        error: parsed.error.issues[0]?.message ?? 'Invalid row',
        raw,
      })
      continue
    }
    rows.push(parsed.data)
  }

  return { rows, errors }
}

export interface OverrideAuthContext {
  user: {
    id: string
    role: string
    organization_id: string | null
  }
  orgId: string
}

/**
 * Authorize a request against /api/admin/organizations/[id]/product-overrides.
 *
 *   - super_admin: always allowed.
 *   - org_admin: allowed iff their profile.organization_id === [id].
 *   - everyone else: forbidden.
 *
 * Returns null on success; on failure returns a Response the route handler
 * should pass through directly.
 */
export function authorizeOverrideRequest(
  ctx: OverrideAuthContext
): Response | null {
  const { user, orgId } = ctx
  if (user.role === 'super_admin') return null
  if (user.role === 'org_admin' && user.organization_id === orgId) return null
  return Response.json(
    { success: false, error: 'Forbidden' },
    { status: 403 }
  )
}
