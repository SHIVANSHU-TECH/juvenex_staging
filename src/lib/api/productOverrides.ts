// Client-safe API wrappers for the per-tenant product override admin UI.
//
// All routes live under /api/admin/organizations/[orgId]/product-overrides
// and are super_admin gated server-side. We attach the same Bearer token
// the rest of the admin UI uses (see src/lib/api.ts) and normalise every
// failure into a single thrown Error whose `.message` is safe to render.

export interface Override {
  product_id: string;
  included: boolean;
  price_override_cents: number | null;
  updated_at: string;
}

export interface OverrideUpsert {
  product_id: string;
  included: boolean;
  price_override_cents?: number | null;
}

export interface CsvRowResult {
  row: number;
  status: 'ok' | 'error';
  error?: string;
}

interface OverridesEnvelope {
  success?: boolean;
  data?: Override[];
  error?: string;
}

interface UpsertEnvelope {
  success?: boolean;
  data?: { upserted_count: number };
  error?: string;
}

interface CsvEnvelope {
  success?: boolean;
  data?: { rows: CsvRowResult[] };
  error?: string;
}

function authHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = window.localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new Error(`Server returned ${res.status} with no JSON body`);
  }
}

function envelopeError(env: { error?: string } | null, fallback: string): string {
  return env?.error ?? fallback;
}

function escapePath(value: string): string {
  return encodeURIComponent(value);
}

export async function fetchOverrides(orgId: string): Promise<Override[]> {
  const res = await fetch(
    `/api/admin/organizations/${escapePath(orgId)}/product-overrides`,
    {
      method: 'GET',
      credentials: 'include',
      headers: { ...authHeader() },
    }
  );
  const body = (await parseJson(res)) as OverridesEnvelope | null;
  if (!res.ok || body?.success === false) {
    throw new Error(envelopeError(body, `Failed to load overrides (${res.status})`));
  }
  return body?.data ?? [];
}

export async function upsertOverrides(
  orgId: string,
  overrides: OverrideUpsert[]
): Promise<{ upserted_count: number }> {
  if (overrides.length === 0) return { upserted_count: 0 };
  const res = await fetch(
    `/api/admin/organizations/${escapePath(orgId)}/product-overrides`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ overrides }),
    }
  );
  const body = (await parseJson(res)) as UpsertEnvelope | null;
  if (!res.ok || body?.success === false || !body?.data) {
    throw new Error(envelopeError(body, `Failed to save overrides (${res.status})`));
  }
  return body.data;
}

export async function clearOverride(
  orgId: string,
  productId: string
): Promise<void> {
  const url =
    `/api/admin/organizations/${escapePath(orgId)}/product-overrides` +
    `?product_id=${escapePath(productId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
    headers: { ...authHeader() },
  });
  if (!res.ok) {
    const body = (await parseJson(res).catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(envelopeError(body, `Failed to clear override (${res.status})`));
  }
}

export async function importOverridesCsv(
  orgId: string,
  file: File
): Promise<{ rows: CsvRowResult[] }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(
    `/api/admin/organizations/${escapePath(orgId)}/product-overrides/csv`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { ...authHeader() },
      body: form,
    }
  );
  const body = (await parseJson(res)) as CsvEnvelope | null;
  if (!res.ok || body?.success === false || !body?.data) {
    throw new Error(envelopeError(body, `CSV import failed (${res.status})`));
  }
  return body.data;
}

// ---------------------------------------------------------------------------
// Master catalog loader — paginates /api/shop/products to assemble all SKUs.
// Lives here so the table doesn't have to inline pagination logic.
// ---------------------------------------------------------------------------

export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  image_url: string | null;
  is_active: boolean;
}

interface CatalogPageResponse {
  success?: boolean;
  data?: CatalogProduct[];
  meta?: { total: number; page: number; limit: number };
  error?: string;
}

const CATALOG_PAGE_SIZE = 100;
const CATALOG_MAX_PAGES = 20; // Hard cap so a runaway upstream can't loop forever.

export async function fetchAllCatalog(): Promise<CatalogProduct[]> {
  const accumulated: CatalogProduct[] = [];
  let page = 1;
  let total = Infinity;
  while (accumulated.length < total && page <= CATALOG_MAX_PAGES) {
    const url = `/api/shop/products?limit=${CATALOG_PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, {
      credentials: 'include',
      headers: { ...authHeader() },
    });
    const body = (await parseJson(res)) as CatalogPageResponse | null;
    if (!res.ok || body?.success === false || !body?.data) {
      throw new Error(envelopeError(body, `Failed to load catalog (${res.status})`));
    }
    accumulated.push(...body.data);
    total = body.meta?.total ?? accumulated.length;
    if (body.data.length === 0) break;
    page += 1;
  }
  return accumulated;
}
