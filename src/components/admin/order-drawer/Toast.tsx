import type { ToastState } from './types'

/**
 * Drawer-local toast. Success notifications use role="status" (polite) so
 * they don't interrupt; errors use role="alert" (assertive) per FIX 7 so
 * AT users hear failures immediately.
 */
export default function Toast({ kind, message }: ToastState) {
  const tone =
    kind === 'success'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : 'bg-red-50 text-red-700 ring-red-200'
  const role = kind === 'success' ? 'status' : 'alert'
  return (
    <div
      role={role}
      aria-live={kind === 'success' ? 'polite' : 'assertive'}
      className={`absolute bottom-4 left-1/2 -translate-x-1/2 max-w-sm w-[calc(100%-2rem)] px-3 py-2 rounded-lg ring-1 ring-inset shadow-sm text-sm ${tone}`}
    >
      {message}
    </div>
  )
}
