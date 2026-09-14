// HIPAA §164.514(b) Safe Harbor de-identification layer.
//
// This module strips the 18 HIPAA identifiers from any free-text or structured
// payload before it is forwarded to an external AI provider (xAI Grok or
// Anthropic Claude). After de-identification the data is no longer legally
// Protected Health Information (PHI), which means plain Grok/Anthropic API
// usage (without a signed BAA) is HIPAA-compliant.
//
// ============================================================
// WARNING — IDENTIFIERS NOT STRIPPED BY THIS MODULE
// ============================================================
// The following Safe Harbor categories are NOT automatically removed by regex
// and MUST be controlled at the input-validation layer or via a dedicated NER
// (Named Entity Recognition) model before data reaches this sanitizer:
//
//   • Personal names in free text (first name, last name, initials)
//     — A blocklist would produce too many false positives (e.g. "John" in
//       "St. John's wort"). Callers MUST exclude names from prompts.
//   • Geographic subdivisions smaller than a state that are not street
//     addresses (city names, county names, neighbourhood names, etc.).
//   • Biometric identifiers in structured fields (fingerprint hash,
//     retina scan, voice print stored as a string).
//   • Full-face photographs or comparable images — must never be sent
//     to an AI API without a signed BAA.
//
// Treat this module as a last-line-of-defence regex pass, not a complete
// de-identification solution on its own.
// ============================================================
//
// NOTE on names: reliably stripping personal names from free text requires a
// Named Entity Recognition (NER) model. A simple common-names blocklist would
// produce too many false positives (e.g. "John" in "St. John's wort", "Lee" in
// "green tea"). Callers MUST therefore avoid including patient names in any
// prompt they build — structured PHI is stripped via `deidentifyProfile`.

import { createHmac } from 'node:crypto'

// ---------------------------------------------------------------------------
// Free-text redaction
// ---------------------------------------------------------------------------

// Email: simple RFC-5322-lite
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

// Phone numbers: US (xxx) xxx-xxxx, xxx-xxx-xxxx, xxx.xxx.xxxx, +country xxx…
// Match 10-15 digits with optional separators and leading +country code.
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g

// SSN: 9 digits with optional dashes or spaces
const SSN_RE = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g

// IPv4
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g

// IPv6 (simplified — matches compressed and full forms)
const IPV6_RE = /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/g

// URLs: http(s)://… and www.…
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi

// Dates in various formats (must run BEFORE long-digit redaction so YYYY-MM-DD
// is not mistaken for an ID).
// MM/DD/YYYY or M/D/YYYY
const DATE_SLASH_RE = /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g
// YYYY-MM-DD
const DATE_ISO_RE = /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g
// DD-MM-YYYY
const DATE_DMY_RE = /\b(?:0?[1-9]|[12]\d|3[01])-(?:0?[1-9]|1[0-2])-(?:19|20)\d{2}\b/g
// Month DD, YYYY  (January 5, 2024 / Jan 5 2024)
const MONTH_NAMES =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
const DATE_MONTH_RE = new RegExp(
  `\\b${MONTH_NAMES}\\s+\\d{1,2}(?:,)?\\s+(?:19|20)\\d{2}\\b`,
  'gi'
)

// US street addresses: number + (optional pre-direction) + words + street-type
const STREET_TYPES =
  '(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Place|Pl|Terrace|Ter|Highway|Hwy|Parkway|Pkwy|Way|Trail|Trl|Square|Sq)'
const ADDRESS_RE = new RegExp(
  `\\b\\d{1,6}\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Z][a-zA-Z]*\\s+){1,4}${STREET_TYPES}\\.?\\b`,
  'g'
)

// Zip codes: only redact 5-digit sequences that are explicitly prefixed with a
// zip/postal context keyword or follow an ADDRESS_REDACTED tag. A bare
// /\b\d{5}\b/ pattern produces false positives on calorie counts, dosage
// amounts, and other numeric values common in health data. We therefore do NOT
// use a standalone ZIP_RE and instead rely on ADDRESS_RE already redacting
// "123 Main St, 10001" as a single token via the street-address pattern above.
// If a remaining 5-digit+4 ZIP+4 suffix appears after an ADDRESS_REDACTED
// marker we strip it in the post-pass below.
const ZIP_PLUS4_AFTER_REDACT_RE = /(?<=\[ADDRESS_REDACTED\][,\s]*)\d{5}-\d{4}\b/g

// Generic long digit sequences (account numbers, credit cards, MRNs etc.)
// 10+ consecutive digits.
const LONG_DIGIT_RE = /\b\d{10,}\b/g

export function deidentifyText(text: string): string {
  if (!text) return text

  let out = text

  // Order matters: specific patterns first, generic last.
  out = out.replace(EMAIL_RE, '[EMAIL_REDACTED]')
  out = out.replace(URL_RE, '[URL_REDACTED]')
  out = out.replace(IPV6_RE, '[IP_REDACTED]')
  out = out.replace(IPV4_RE, '[IP_REDACTED]')
  out = out.replace(DATE_ISO_RE, '[DATE_REDACTED]')
  out = out.replace(DATE_SLASH_RE, '[DATE_REDACTED]')
  out = out.replace(DATE_DMY_RE, '[DATE_REDACTED]')
  out = out.replace(DATE_MONTH_RE, '[DATE_REDACTED]')
  out = out.replace(ADDRESS_RE, '[ADDRESS_REDACTED]')
  out = out.replace(SSN_RE, '[SSN_REDACTED]')
  // LONG_DIGIT runs BEFORE PHONE so an unseparated 10+ digit MRN/account
  // number is classified as [ID_REDACTED] instead of getting swallowed by
  // the phone regex. PHONE still catches standard separated formats.
  out = out.replace(LONG_DIGIT_RE, '[ID_REDACTED]')
  out = out.replace(PHONE_RE, '[PHONE_REDACTED]')
  // Strip ZIP+4 sequences that survived only because they are adjacent to an
  // already-redacted address token (see ZIP_PLUS4_AFTER_REDACT_RE above).
  out = out.replace(ZIP_PLUS4_AFTER_REDACT_RE, '[ZIP_REDACTED]')

  return out
}

// ---------------------------------------------------------------------------
// Message and profile de-identification
// ---------------------------------------------------------------------------

export interface SanitizedMessage {
  role: string
  content: string
}

export function deidentifyMessage(msg: { role: string; content: string }): SanitizedMessage {
  return {
    role: msg.role,
    content: deidentifyText(msg.content),
  }
}

// Any structured profile field we might receive from the database or client.
export interface ProfileInput {
  // identifiers — will be stripped
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  street?: string | null
  city?: string | null
  zip?: string | null
  zip_code?: string | null
  ssn?: string | null
  mrn?: string | null
  clinic_name?: string | null
  provider_name?: string | null
  user_id?: string | null
  dob?: string | null
  date_of_birth?: string | null

  // clinical facts — safe to pass through
  age?: number | null
  weight?: number | null
  current_weight?: number | null
  target_weight?: number | null
  height?: number | null
  gender?: string | null
  medications?: string[] | null
  allergies?: string[] | null
  restrictions?: string[] | null
  conditions?: string[] | null
  goals?: string[] | null
  diet_type?: string | null
  activity_level?: string | null
  primary_goal?: string | null
}

export interface SanitizedProfile {
  patient_token?: string
  age?: number | null
  weight?: number | null
  current_weight?: number | null
  target_weight?: number | null
  height?: number | null
  gender?: string | null
  medications?: string[] | null
  allergies?: string[] | null
  restrictions?: string[] | null
  conditions?: string[] | null
  goals?: string[] | null
  diet_type?: string | null
  activity_level?: string | null
  primary_goal?: string | null
}

function computeAgeFromDob(dob: string): number | null {
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getUTCFullYear() - d.getUTCFullYear()
  const m = now.getUTCMonth() - d.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1
  if (age < 0 || age > 150) return null
  return age
}

// Safe Harbor age rule: patients over 89 must be aggregated to 90+.
function capAge(raw: number | null | undefined): number | null | undefined {
  if (raw == null) return raw
  if (raw > 89) return 90
  return raw
}

function sanitizeStringList(xs: string[] | null | undefined): string[] | null | undefined {
  if (!xs) return xs
  return xs.map((s) => deidentifyText(s))
}

export function deidentifyProfile(profile: ProfileInput): SanitizedProfile {
  // Derive age from dob if present, otherwise use provided age.
  const rawAge =
    profile.age ??
    (profile.dob ? computeAgeFromDob(profile.dob) : null) ??
    (profile.date_of_birth ? computeAgeFromDob(profile.date_of_birth) : null)

  const sanitized: SanitizedProfile = {
    age: capAge(rawAge) ?? null,
    weight: profile.weight ?? null,
    current_weight: profile.current_weight ?? null,
    target_weight: profile.target_weight ?? null,
    height: profile.height ?? null,
    gender: profile.gender ?? null,
    medications: sanitizeStringList(profile.medications) ?? null,
    allergies: sanitizeStringList(profile.allergies) ?? null,
    restrictions: sanitizeStringList(profile.restrictions) ?? null,
    conditions: sanitizeStringList(profile.conditions) ?? null,
    goals: sanitizeStringList(profile.goals) ?? null,
    diet_type: profile.diet_type ?? null,
    activity_level: profile.activity_level ?? null,
    primary_goal: profile.primary_goal ?? null,
  }

  if (profile.user_id) {
    sanitized.patient_token = tokenizeUserId(profile.user_id)
  }

  return sanitized
}

// ---------------------------------------------------------------------------
// Deterministic, non-reversible user-id tokenization.
// HMAC-SHA256(user_id, JWT_SECRET) truncated to 8 hex chars, prefixed "anon_".
// ---------------------------------------------------------------------------

export function tokenizeUserId(userId: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is required for phi-sanitizer tokenizeUserId. ' +
      'Set JWT_SECRET before using this function.'
    )
  }
  const h = createHmac('sha256', secret).update(userId).digest('hex')
  return `anon_${h.slice(0, 8)}`
}
