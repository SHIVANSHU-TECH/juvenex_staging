/**
 * Persists VIP telehealth wizard state across steps (sessionStorage).
 */

import type { StorefrontCategoryKey } from '@/lib/jx/storefront-catalog'
import type { IntakeSubmissionResult, StaticIntakeValues } from './intake/types'
import type { VipProductPlan } from './products'

const KEY = 'jx.telehealth.vip.session.v1'
/** Prefill for /store/checkout shipping fields from VIP intake. */
export const VIP_CHECKOUT_PREFILL_KEY = 'jx.telehealth.checkoutPrefill.v1'
/** Marks that pharmacy adapter should run after a successful VIP checkout. */
export const VIP_PHARMACY_PENDING_KEY = 'jx.telehealth.pharmacy.pending.v1'

export type VipFlowStep =
  | 'categories'
  | 'products'
  | 'details'
  | 'intake'
  | 'review'

export interface VipTelehealthSession {
  step: VipFlowStep
  category: StorefrontCategoryKey | null
  productSlug: string | null
  plan: VipProductPlan | null
  intakeDraft: StaticIntakeValues | null
  intakeResult: IntakeSubmissionResult | null
}

export interface VipCheckoutPrefill {
  firstName: string
  lastName: string
  phone: string
  email: string
}

export interface VipPharmacyPending {
  productId: string
  productTitle: string
  price: number
  intakeId: string
  userId?: string | null
  customer: {
    firstName: string
    lastName: string
    email: string
    phone: string
  }
}

const EMPTY: VipTelehealthSession = {
  step: 'categories',
  category: null,
  productSlug: null,
  plan: null,
  intakeDraft: null,
  intakeResult: null,
}

const VALID_STEPS: VipFlowStep[] = [
  'categories',
  'products',
  'details',
  'intake',
  'review',
]

export function readVipSession(): VipTelehealthSession {
  if (typeof window === 'undefined') return { ...EMPTY }
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<VipTelehealthSession>
    const rawStep = parsed.step as string | undefined
    const step: VipFlowStep =
      rawStep && VALID_STEPS.includes(rawStep as VipFlowStep)
        ? (rawStep as VipFlowStep)
        : 'categories'
    return {
      ...EMPTY,
      ...parsed,
      step,
      category: parsed.category ?? null,
    }
  } catch {
    return { ...EMPTY }
  }
}

export function writeVipSession(next: VipTelehealthSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function clearVipSession(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function writeVipCheckoutPrefill(prefill: VipCheckoutPrefill): void {
  try {
    sessionStorage.setItem(VIP_CHECKOUT_PREFILL_KEY, JSON.stringify(prefill))
  } catch {
    /* ignore */
  }
}

export function readVipCheckoutPrefill(): VipCheckoutPrefill | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(VIP_CHECKOUT_PREFILL_KEY)
    if (!raw) return null
    return JSON.parse(raw) as VipCheckoutPrefill
  } catch {
    return null
  }
}

export function clearVipCheckoutPrefill(): void {
  try {
    sessionStorage.removeItem(VIP_CHECKOUT_PREFILL_KEY)
  } catch {
    /* ignore */
  }
}

export function writeVipPharmacyPending(payload: VipPharmacyPending): void {
  try {
    sessionStorage.setItem(VIP_PHARMACY_PENDING_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function readVipPharmacyPending(): VipPharmacyPending | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(VIP_PHARMACY_PENDING_KEY)
    if (!raw) return null
    return JSON.parse(raw) as VipPharmacyPending
  } catch {
    return null
  }
}

export function clearVipPharmacyPending(): void {
  try {
    sessionStorage.removeItem(VIP_PHARMACY_PENDING_KEY)
  } catch {
    /* ignore */
  }
}

/** Writes a single line into the native store bag for /store/checkout. */
export function setStoreBagForVipCheckout(line: {
  id: string
  title: string
  subtitle: string
  price: number
  rawName: string
}): void {
  const STORAGE_KEY = 'jx.bag.v1'
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([line]))
  } catch {
    /* ignore */
  }
}
