// ---------------------------------------------------------------------------
// Drawer types — `AdminOrderDetail` is the canonical shape declared in
// `@/lib/api-types`. Re-export it here so the existing per-section imports
// (`import type { AdminOrderDetail } from './types'`) keep compiling without
// dragging in the server-only route module.
// ---------------------------------------------------------------------------

import type { AdminOrderDetail } from '@/lib/api-types'

export type { AdminOrderDetail }

export interface OrderItem {
  name?: string
  title?: string
  quantity?: number
  qty?: number
  price_cents?: number
  unit_price_cents?: number
  price?: number
}

export interface Address {
  name?: string
  street?: string
  apt?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  postal_code?: string
  zip?: string
  country?: string
  phone?: string
}

export interface PatchResponse {
  success: boolean
  data?: AdminOrderDetail
  error?: string
}

export interface DetailResponse {
  success: boolean
  data?: AdminOrderDetail
  error?: string
}

export interface ToastState {
  kind: 'success' | 'error'
  message: string
}

export interface OrderDetailDrawerProps {
  orderId: string | null
  onClose: () => void
  /** Fired after a successful PATCH so the parent list can refetch. */
  onMutated?: (updated: AdminOrderDetail) => void
}
