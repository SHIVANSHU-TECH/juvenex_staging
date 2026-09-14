import type { PortalApiResponse } from '@/lib/api/juvenex-portal'

export type JsonRecord = Record<string, unknown>
export const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
export const asArray = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.map(asRecord) : []
export const text = (value: unknown, fallback = '—') =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : fallback

export function requireSuccess(response: PortalApiResponse, fallback: string) {
  if (response.status !== 1) throw new Error(response.message || response.error || fallback)
  return response
}

export function friendlyError(error: unknown) {
  const raw = error instanceof Error ? error.message : 'Something went wrong.'
  if (/401|unauth|token|sign.?in|log.?in/i.test(raw)) return 'Please sign in to view your Juvenex account.'
  if (/403|forbidden|not.*belong|email.*match/i.test(raw)) return 'This order is not available for your account.'
  if (/network|fetch|timeout/i.test(raw)) return 'We could not reach Juvenex. Check your connection and try again.'
  return raw
}

export function hasSession() {
  return typeof window !== 'undefined' && Boolean(window.localStorage.getItem('auth_token'))
}

export function formatDate(value: unknown, includeTime = false) {
  const raw = text(value, '')
  if (!raw) return 'Not available'
  const parsed = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return raw
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(parsed)
}

export function statusTone(status: unknown) {
  const value = text(status, '').toLowerCase()
  if (['declined', 'refunded', 'not_found', 'cancelled'].some((part) => value.includes(part))) return 'bad'
  if (['pending', 'unknown', 'paused'].some((part) => value.includes(part))) return 'wait'
  return 'good'
}
