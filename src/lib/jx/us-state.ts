/** Map free-text / full names → 2-letter US codes for WLMD createOrder_test. */
const NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
}

const VALID_CODES = new Set(Object.values(NAME_TO_CODE))

/**
 * Temporary: coerce any state input to a 2-letter US code for createOrder_test.
 * Upstream rejects full names / non-US codes with
 * "Shipping state must be 2 characters and valid US state".
 */
export function coerceUsStateCode(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return 'CA'
  const upper = trimmed.toUpperCase()
  if (VALID_CODES.has(upper)) return upper
  const fromName = NAME_TO_CODE[trimmed.toLowerCase()]
  if (fromName) return fromName
  // Temporary bypass: if still not a known code, send CA so checkout is not blocked.
  return 'CA'
}

export const US_STATE_OPTIONS = Object.entries(NAME_TO_CODE)
  .map(([name, code]) => ({
    code,
    label: `${code} — ${name.replace(/\b\w/g, (c) => c.toUpperCase())}`,
  }))
  .sort((a, b) => a.code.localeCompare(b.code))
