// GET /api/payments/availability
//
// Returns whether a real payment provider is configured for this deployment.
// The checkout page polls this endpoint on mount and renders a "temporarily
// unavailable" surface when the deployment is not yet configured for live
// payments. This lets us ship the rest of the reverse-flow checkout (intake,
// shipping, cart) without an actual payment vendor wired in, while keeping
// the user in a graceful "saved cart" state instead of a broken submit.
//
// The check itself lives in src/lib/payments — see isPaymentConfigured().
//
// Public: no auth required, returns no PII.

import { NextResponse } from 'next/server'

import { isPaymentConfigured } from '@/lib/payments'

export interface PaymentAvailabilityResponse {
  available: boolean
}

export async function GET(): Promise<NextResponse<PaymentAvailabilityResponse>> {
  return NextResponse.json({ available: isPaymentConfigured() })
}
