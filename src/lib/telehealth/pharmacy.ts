/**
 * Pharmacy fulfillment service boundary (FUTURE client Pharmacy API).
 *
 * NOT used by the active VIP patient flow. VIP fulfillment / clinical status
 * comes from Juvenex/WLMD: pending-forms, get-order, get-order-history
 * (see /store/checkout/success and /store/account/orders).
 *
 * Keep this interface for when a separate Pharmacy API is provided later.
 */

export interface PharmacyOrderPayload {
  /** Juvenex / store bag product id (WLMD id). */
  productId: string
  productTitle: string
  price: number
  /** Link to telehealth intake (static or future API). */
  intakeId: string
  userId?: string | null
  customer: {
    firstName: string
    lastName: string
    email: string
    phone: string
  }
}

export interface PharmacySubmitResult {
  ok: boolean
  /** Opaque pharmacy reference (mock or real). */
  pharmacyReference: string
  provider: 'mock' | 'pharmacy_api'
  message: string
}

export interface TelehealthPharmacyService {
  readonly providerName: 'mock' | 'pharmacy_api'
  submitOrder(payload: PharmacyOrderPayload): Promise<PharmacySubmitResult>
}

export class MockPharmacyService implements TelehealthPharmacyService {
  readonly providerName = 'mock' as const

  async submitOrder(payload: PharmacyOrderPayload): Promise<PharmacySubmitResult> {
    await new Promise((r) => setTimeout(r, 200))
    const pharmacyReference = `mock_rx_${Date.now().toString(36)}`
    const result: PharmacySubmitResult = {
      ok: true,
      pharmacyReference,
      provider: 'mock',
      message:
        'Order queued for pharmacy (mock). Real Pharmacy API not connected yet.',
    }
    try {
      sessionStorage.setItem(
        'jx.telehealth.pharmacy.last',
        JSON.stringify({ payload, result, at: new Date().toISOString() })
      )
    } catch {
      /* ignore */
    }
    return result
  }
}

export function getTelehealthPharmacyService(): TelehealthPharmacyService {
  // FUTURE: return new RealPharmacyApiService()
  return new MockPharmacyService()
}
