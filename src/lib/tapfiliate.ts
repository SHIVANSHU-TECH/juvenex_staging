// Tapfiliate affiliate integration — shared helpers.
//
// Two surfaces:
//   1. CLIENT-SIDE tracking + conversion (needs only the public account id):
//      - the tracking snippet (tap('detect')) captures the ?ref=<code> referral
//        cookie on every page;
//      - tap('conversion', <orderId>, <amount>) fires on a paid membership.
//   2. SERVER-SIDE REST (needs TAPFILIATE_API_KEY) for reading referral/affiliate
//      data into our own admin + per-user "your referrals" views, and for
//      get-or-creating a Tapfiliate affiliate per user so each user has a link.
//
// The REST key is optional: when unset, isTapfiliateConfigured() is false and
// the server helpers throw a typed error the callers turn into a graceful
// "affiliate program not configured yet" state (so the app never 500s).

export const TAPFILIATE_ACCOUNT_ID =
  process.env.NEXT_PUBLIC_TAPFILIATE_ACCOUNT_ID ?? '63886-14ccd9'

const API_BASE = 'https://api.tapfiliate.com/1.6'
const API_KEY = process.env.TAPFILIATE_API_KEY

export class TapfiliateNotConfiguredError extends Error {
  constructor() {
    super('TAPFILIATE_API_KEY is not configured')
    this.name = 'TapfiliateNotConfiguredError'
  }
}

/** True when the server-side REST API key is configured. */
export function isTapfiliateConfigured(): boolean {
  return typeof API_KEY === 'string' && API_KEY.length > 0
}

async function tapFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isTapfiliateConfigured()) throw new TapfiliateNotConfiguredError()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Api-Key': API_KEY as string,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    // Affiliate data is not cacheable per-request.
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Tapfiliate ${init?.method ?? 'GET'} ${path} -> ${res.status} ${text.slice(0, 300)}`)
  }
  // 204 has no body.
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

export interface TapAffiliate {
  id: string
  firstname?: string
  lastname?: string
  email?: string
  referral_link?: { link?: string; token?: string } | null
  // Tapfiliate returns more; we keep the fields we use.
  [k: string]: unknown
}

export interface TapConversion {
  id: string
  amount?: number | string
  commissions?: Array<{ amount?: number | string; status?: string }>
  affiliate?: { id?: string; email?: string }
  external_id?: string
  created_at?: string
  [k: string]: unknown
}

/** Build the public referral link for a referral code/token. */
export function referralLink(code: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://juvenex.space'
  return `${base.replace(/\/$/, '')}/?ref=${encodeURIComponent(code)}`
}

/**
 * Find an affiliate by email, or create one. Used so every app user can be
 * given their own referral link. Returns the affiliate (with referral_link).
 */
export async function getOrCreateAffiliate(params: {
  email: string
  firstname?: string
  lastname?: string
}): Promise<TapAffiliate> {
  // Look up by email first (normalized — Tapfiliate's filter is exact-match,
  // so a mixed-case stored email would miss and the create below would 400).
  const email = params.email.trim().toLowerCase()
  const found = await tapFetch<TapAffiliate[]>(
    `/affiliates/?email=${encodeURIComponent(email)}`
  )
  if (Array.isArray(found) && found.length > 0) return found[0]
  // Create — but tolerate the "email already used" race/mismatch by falling
  // back to a second lookup instead of surfacing a 400 to the user.
  try {
    return await tapFetch<TapAffiliate>(`/affiliates/`, {
      method: 'POST',
      body: JSON.stringify({
        firstname: params.firstname ?? 'Member',
        lastname: params.lastname ?? '',
        email,
      }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (/already used|already exists/i.test(message)) {
      // The affiliate exists but the filtered lookup missed (e.g. the account
      // stores a differently-cased email). Scan the list as a last resort.
      const all = await tapFetch<TapAffiliate[]>(`/affiliates/`)
      const match = all.find(
        (a) => (a.email ?? '').trim().toLowerCase() === email
      )
      if (match) return match
    }
    throw err
  }
}

/** List conversions, optionally filtered by affiliate id. */
export async function listConversions(opts?: {
  affiliateId?: string
}): Promise<TapConversion[]> {
  const qs = opts?.affiliateId ? `?affiliate_id=${encodeURIComponent(opts.affiliateId)}` : ''
  return tapFetch<TapConversion[]>(`/conversions/${qs}`)
}

/** List all affiliates (admin view). */
export async function listAffiliates(): Promise<TapAffiliate[]> {
  return tapFetch<TapAffiliate[]>(`/affiliates/`)
}

/**
 * Server-side conversion record (reliable backstop to the client tap()).
 * `referralCode` is the visitor's ref (from the tap cookie / ?ref=), `externalId`
 * is our order id (idempotency), `amount` is the membership price in dollars.
 */
export async function createConversion(params: {
  referralCode: string
  externalId: string
  amount: number
}): Promise<TapConversion | null> {
  if (!isTapfiliateConfigured()) return null
  return tapFetch<TapConversion>(`/conversions/`, {
    method: 'POST',
    body: JSON.stringify({
      referral_code: params.referralCode,
      external_id: params.externalId,
      amount: params.amount,
    }),
  })
}
