/**
 * Shared formatting helpers used across the admin, community, and profile
 * surfaces. Centralized here to avoid the four near-identical copies that
 * existed previously (formatRelative, timeAgo, formatTime, formatMoney).
 */

/**
 * Returns a relative time string for an ISO timestamp, e.g. "5m ago",
 * "3h ago", "2d ago". Falls back to a localized date string for older
 * timestamps.
 */
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const now = Date.now()
  const diffSec = Math.round((now - then) / 1000)

  if (diffSec < 60) {
    if (diffSec < 5) return 'just now'
    return `${diffSec}s ago`
  }
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * Formats a timestamp for chat-style "MMM d, HH:mm" rendering.
 * Used in message thread bubbles where a relative string would lose
 * ordering context.
 */
export function formatChatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Formats a money value in cents using Intl.NumberFormat.
 * Falls back to a plain `${value} ${CURRENCY}` string if the runtime
 * does not know the supplied currency code.
 */
export function formatMoney(cents: number, currency: string = 'usd'): string {
  const amount = cents / 100
  const code = currency.toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${code}`
  }
}
