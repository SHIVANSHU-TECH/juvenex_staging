/**
 * Pending add-to-bag intent for guests who must sign in before carting.
 * Stored in sessionStorage so login → returnTo can finish the add and send
 * the user to /store/cart (Biomax-style path).
 */

import type { BagLine } from '@/components/jx/JxStore'

const PENDING_KEY = 'jx.pendingAdd.v1'
const INTAKE_RETURN_KEY = 'jx.intakeReturn.v1'

export type PendingAdd = BagLine

function safePath(path: string | null | undefined): string | null {
  if (!path) return null
  if (!path.startsWith('/') || path.startsWith('//')) return null
  return path
}

export function savePendingAdd(line: PendingAdd): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(line))
  } catch {
    /* private mode */
  }
}

export function readPendingAdd(): PendingAdd | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as BagLine).id !== 'string' ||
      typeof (parsed as BagLine).title !== 'string' ||
      typeof (parsed as BagLine).price !== 'number'
    ) {
      return null
    }
    const line = parsed as BagLine
    return {
      id: line.id,
      title: line.title,
      subtitle: typeof line.subtitle === 'string' ? line.subtitle : '',
      price: line.price,
      rawName: typeof line.rawName === 'string' ? line.rawName : line.title,
    }
  } catch {
    return null
  }
}

export function clearPendingAdd(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    /* ignore */
  }
}

/** Path to return to after intake (orders list, success, shop, etc.). */
export function saveIntakeReturnTo(path: string): void {
  const safe = safePath(path)
  if (!safe) return
  try {
    sessionStorage.setItem(INTAKE_RETURN_KEY, safe)
  } catch {
    /* ignore */
  }
}

export function readIntakeReturnTo(): string | null {
  try {
    return safePath(sessionStorage.getItem(INTAKE_RETURN_KEY))
  } catch {
    return null
  }
}

export function clearIntakeReturnTo(): void {
  try {
    sessionStorage.removeItem(INTAKE_RETURN_KEY)
  } catch {
    /* ignore */
  }
}

/** Build login URL that returns the user to the current store/PDP path. */
export function loginUrlForReturn(returnPath: string): string {
  const safe = safePath(returnPath) ?? '/store'
  return `/login?next=${encodeURIComponent(safe)}`
}

export function registerUrlForReturn(returnPath: string): string {
  const safe = safePath(returnPath) ?? '/store'
  return `/register?next=${encodeURIComponent(safe)}`
}
