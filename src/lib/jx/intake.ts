import { pendingFormSchema, type PendingForm } from '@/lib/juvenex/schemas'

/**
 * Stage 2 intake — client-side helpers shared by the checkout success page and
 * the account orders list.
 *
 * Everything here fails SILENTLY to an empty list. The vendor route is not
 * deployed yet, and when it is, an intake outage must not surface as an error
 * banner on a page whose real job is confirming an order that already
 * succeeded. "No intake UI" is always a safe render; a broken or dead intake
 * button is not.
 */

/**
 * Read at module scope: `NEXT_PUBLIC_*` is inlined at BUILD time, so flipping
 * this requires a rebuild, not just a restart.
 */
export const INTAKE_ENABLED = process.env.NEXT_PUBLIC_INTAKE_ENABLED === 'true'

/** Actions that give the customer something to actually do. */
export function isActionable(form: PendingForm) {
  return form.action === 'intake' || form.action === 'check_in'
}

/**
 * The URL for a form's CURRENT action. `form_url` and `form_url_new` are
 * independent fields and both may be populated, so the action — not
 * whichever URL happens to be non-null — decides which one is opened.
 * Returns null when the action has no destination, so callers can't render a
 * button that goes nowhere.
 */
export function intakeFormUrl(form: PendingForm): string | null {
  if (form.action === 'intake') return form.form_url
  if (form.action === 'check_in') return form.form_url_new
  return null
}

/** A form is only renderable as a CTA if it is actionable AND has a URL. */
export function hasIntakeCta(form: PendingForm) {
  return isActionable(form) && Boolean(intakeFormUrl(form))
}

/**
 * Parse row-by-row rather than validating the whole array at once: one
 * malformed row (an unexpected `action`, a non-URL `form_url`) would
 * otherwise blank the intake UI for every other order.
 */
export function parsePendingForms(payload: unknown): PendingForm[] {
  const raw = (payload as { forms?: unknown } | null)?.forms
  if (!Array.isArray(raw)) return []
  const forms: PendingForm[] = []
  for (const row of raw) {
    const parsed = pendingFormSchema.safeParse(row)
    if (parsed.success) forms.push(parsed.data)
  }
  return forms
}

/**
 * Fetch pending forms for the signed-in user. Omit `orderId` for the full
 * list. Never throws and never logs: the 503 soft-failures from the route
 * (`intake_not_configured`, `intake_not_deployed`, `intake_unavailable`) are
 * expected states, not errors.
 */
export async function fetchPendingForms(orderId?: string): Promise<PendingForm[]> {
  if (!INTAKE_ENABLED) return []
  if (typeof window === 'undefined') return []
  const token = window.localStorage.getItem('auth_token')
  if (!token) return []

  try {
    const response = await fetch('/api/juvenex/intake/pending-forms', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderId ? { order_id: orderId } : {}),
    })
    if (!response.ok) return []
    return parsePendingForms(await response.json())
  } catch {
    return []
  }
}
