// Canonical membership-access gate. Every surface that decides whether a user's
// subscription unlocks paid access MUST go through `subscriptionGrantsAccess`
// so the rules stay identical across the API. Previously each route reimplemented
// the check inline and they had drifted:
//   - subscription/route.ts + checkout/route.ts treated ANY stored external
//     subscription id as active-until-cancelled — WRONG for a trial, whose card
//     is captured but not yet charged.
//   - shop/products/route.ts + ai/chat/route.ts checked `status` only and
//     ignored `current_period_end` — an expired 'trialing'/one-time row leaked
//     access.
//
// The rule:
//   - status must be access-enabling ('active' or 'trialing');
//   - an 'active' row WITH an external subscription id is genuinely recurring
//     (the provider auto-bills monthly) → active until cancelled, NOT expired at
//     current_period_end;
//   - a 'trialing' row is ALWAYS period-bound, even with a captured-card handle:
//     no money has changed hands, so if the trial window lapses without the
//     day-7 charge converting it to 'active', access drops;
//   - a one-time grant (no handle) is period-bound.

// 'pending' (a tier chosen at signup but payment not yet confirmed) intentionally
// does NOT grant access — otherwise registration would bypass the paywall.
export const ACCESS_ENABLED_STATUSES = new Set(['active', 'trialing'])

/** Shape of the columns this gate needs. Extra columns are ignored. */
export interface SubscriptionAccessRow {
  status?: unknown
  current_period_end?: unknown
  stripe_subscription_id?: unknown
}

/**
 * The DB columns this gate reads. Use in `.select(...)` so every call site
 * fetches what `subscriptionGrantsAccess` requires.
 */
export const SUBSCRIPTION_ACCESS_COLUMNS =
  'status, current_period_end, stripe_subscription_id'

// A subscription grants access only while within its paid period. A
// missing/blank/invalid current_period_end is treated as non-expiring (legacy
// rows and admin-granted comps have no period end). Membership purchases set a
// 30-day period on activation; trials set a 7-day period.
export function isWithinPeriod(periodEnd: unknown): boolean {
  if (!periodEnd) return true
  const end = new Date(String(periodEnd))
  if (Number.isNaN(end.getTime())) return true
  return end.getTime() > Date.now()
}

/**
 * True when the subscription row currently unlocks paid access. This is the one
 * authoritative membership gate — do not reimplement it inline.
 */
export function subscriptionGrantsAccess(
  row: SubscriptionAccessRow | null | undefined
): boolean {
  if (!row) return false
  const status = typeof row.status === 'string' ? row.status : null
  if (!status || !ACCESS_ENABLED_STATUSES.has(status)) return false

  // Only an 'active' row with a provider handle bills forever; a 'trialing'
  // handle is a captured-but-uncharged card and stays period-bound.
  const recurring = status === 'active' && Boolean(row.stripe_subscription_id)
  return recurring || isWithinPeriod(row.current_period_end)
}
