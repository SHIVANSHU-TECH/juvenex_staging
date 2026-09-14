import StatusPill from '../StatusPill'
import type { StatusVariant } from '@/lib/admin-theme'

// ---------------------------------------------------------------------------
// Status icon — tiny inline SVG so we don't add a dependency. Matches the
// stroke style used elsewhere in the admin shell.
// ---------------------------------------------------------------------------

type IconKind = 'check' | 'clock' | 'cross'

function classifyIcon(status: string): IconKind {
  // Positive, terminal-good states.
  if (
    status === 'confirmed' ||
    status === 'fulfilled' ||
    status === 'paid' ||
    status === 'shipped'
  ) {
    return 'check'
  }
  // Failure / negative terminal states.
  if (
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'refunded'
  ) {
    return 'cross'
  }
  // Everything else (pending, sent, not_sent, awaiting…) is in-flight.
  return 'clock'
}

function StatusIcon({ kind }: { kind: IconKind }) {
  // 12px feels right against the StatusPill text-xs (~12px line).
  const common = {
    className: 'h-3 w-3 flex-none',
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (kind === 'check') {
    return (
      <svg {...common}>
        <path d="m3 8 3.5 3.5L13 5" />
      </svg>
    )
  }
  if (kind === 'cross') {
    return (
      <svg {...common}>
        <path d="m4 4 8 8M12 4l-8 8" />
      </svg>
    )
  }
  // clock
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3l2 1.5" />
    </svg>
  )
}

interface StatusBadgeProps {
  /** Raw status string; lowercase, snake_case acceptable. */
  status: string
  /** Pre-mapped pill variant from helpers. */
  variant: StatusVariant
  /** Optional label override; defaults to a humanised version of `status`. */
  label?: string
}

function humanise(status: string): string {
  return status.replace(/_/g, ' ')
}

/**
 * Status pill that adds an icon + screen-reader-friendly label so the badge
 * does not rely on color alone (WCAG 1.4.1 Use of Color).
 */
export default function StatusBadge({
  status,
  variant,
  label,
}: StatusBadgeProps) {
  const text = label ?? humanise(status)
  const iconKind = classifyIcon(status)
  return (
    <StatusPill variant={variant}>
      <StatusIcon kind={iconKind} />
      <span className="capitalize" aria-label={`Status: ${text}`}>
        {text}
      </span>
    </StatusPill>
  )
}
