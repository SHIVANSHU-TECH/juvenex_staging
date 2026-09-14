/**
 * Admin design tokens.
 *
 * Canonical palette + status mapping used by the admin shell, KPI cards,
 * StatusPill, DataTable, and every Linear/Stripe-style surface under
 * /admin. Other admin components should import `adminTheme` (raw hex
 * values) or `STATUS_PALETTE` (Tailwind class triples) from here rather
 * than hardcoding colors.
 */

/** Juvenex warm-sage palette, exposed as raw hex values. */
export const adminTheme = {
  bg: '#FAF9F6',
  surface: '#FFFFFF',
  border: '#E5EAE3',
  text: { primary: '#2D352C', secondary: '#6B7567', muted: '#8B9B83' },
  accent: '#8FA888',
  accentHover: '#7A9477',
  accentSubtle: '#F5F8F3',
  danger: '#DC2626',
  dangerSubtle: '#FEE2E2',
  warning: '#F59E0B',
  warningSubtle: '#FEF3C7',
  success: '#10B981',
  successSubtle: '#D1FAE5',
} as const

/**
 * Legacy alias kept for OrdersTab, ReportsTab, and other callers that
 * imported ADMIN_COLORS before the `adminTheme` export landed. New code
 * should prefer `adminTheme`.
 */
export const ADMIN_COLORS = {
  surface: adminTheme.bg,
  surfaceHover: adminTheme.accentSubtle,
  surfaceMuted: adminTheme.surface,
  border: adminTheme.border,
  borderStrong: '#D7DFD2',
  text: adminTheme.text.primary,
  textMuted: adminTheme.text.secondary,
  accent: '#5C7A4F',
  accentHover: '#4F6A44',
  accentSoft: '#E6EFE2',
} as const

/**
 * Status palette for StatusPill. Each entry maps a semantic status to a
 * `bg`/`text`/`ring` Tailwind class triple. Mirrors the Linear/Stripe
 * convention of soft tinted backgrounds with strong colored text.
 */
export const STATUS_PALETTE = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' },
  paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  shipped: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200' },
  refunded: { bg: 'bg-slate-50', text: 'text-slate-700', ring: 'ring-slate-200' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-200' },
  reviewed: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200' },
  dismissed: { bg: 'bg-slate-50', text: 'text-slate-700', ring: 'ring-slate-200' },
  public: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  private: { bg: 'bg-slate-50', text: 'text-slate-700', ring: 'ring-slate-200' },
  hidden: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' },
} as const

export type StatusVariant = keyof typeof STATUS_PALETTE
