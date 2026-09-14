/**
 * Card-input helpers shared by the checkout form.
 *
 * No formatting/validation library is added for this — the rules are small
 * and well-known (Luhn, digit grouping) and pulling in a dependency for them
 * would violate the "no new dependencies" constraint for no real benefit.
 */

/** Strips everything but digits, e.g. for turning a formatted display value back into raw digits. */
export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, '')
}

/** Groups raw card digits into 4s for display: "4242424242424242" -> "4242 4242 4242 4242". */
export function formatCardNumber(digits: string): string {
  const trimmed = digits.slice(0, 19)
  return trimmed.replace(/(\d{4})(?=\d)/g, '$1 ')
}

/**
 * Luhn checksum. The upstream schema only checks digit-count/shape
 * (`^\d{12,19}$`); this catches obvious typos (transposed/mistyped digits)
 * before the customer's card is ever sent anywhere.
 */
export function passesLuhn(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false
  let sum = 0
  let alternate = false
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i])
    if (alternate) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    alternate = !alternate
  }
  return sum % 10 === 0
}

export const CARD_EXPIRY_MONTHS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, '0')
)

/** Current year through +15 — long enough to cover any real expiry, short enough to stay a sane dropdown. */
export function cardExpiryYears(now: Date = new Date()): string[] {
  const start = now.getFullYear()
  return Array.from({ length: 16 }, (_, i) => String(start + i))
}
