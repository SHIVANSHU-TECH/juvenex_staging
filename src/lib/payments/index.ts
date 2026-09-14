// Payment provider factory.
//
// Every consumer of a payment provider should call getPaymentProvider() —
// no concrete provider class is exported from here. That keeps the rest of
// the codebase from accidentally pinning to a specific vendor when the
// real one is selected.
//
// Adding a new provider:
//   1. Create src/lib/payments/<vendor>-provider.ts implementing
//      PaymentProvider.
//   2. Add a case to the switch below keyed on its env value.
//   3. Set PAYMENT_PROVIDER=<vendor> in the deploy environment.
//
// PAYMENT_PROVIDER unset or set to 'stub' falls back to the StubProvider
// (see ./stub-provider.ts) so a fresh dev clone works without configuration.
//
// Stripe rollout (planned): once the StripeProvider lands as a sibling file,
// presence of STRIPE_SECRET_KEY combined with PAYMENT_PROVIDER='stripe' will
// flip the factory to the real vendor. Until then, never read STRIPE_SECRET_KEY
// here — leaving the env var unset (or PAYMENT_PROVIDER=stub) keeps the stub
// path active in dev/staging.
//
// Production gate: in NODE_ENV=production, the stub provider is hard-disabled.
// getPaymentProvider() throws and isPaymentConfigured() returns false so
// callers can serve a graceful 503 from /api/payments/checkout instead of
// blowing up at request time.

import { PaymentProvider } from './provider'
import { AuthNetProvider } from './authnet-provider'
import { StripeProvider } from './stripe-provider'
import { KurvProvider } from './kurv-provider'
import { StubProvider } from './stub-provider'

export type {
  CheckoutSession,
  CheckoutSessionRequest,
  PaymentProvider,
  WebhookEvent,
  WebhookEventType,
} from './provider'

/**
 * Returns true when a real payment provider is configured (or we're not in
 * production, where the stub is allowed). Routes that do checkout MUST consult
 * this BEFORE calling getPaymentProvider() and serve a 503 when it's false —
 * that lets the app build & boot in production without a payment processor
 * configured, while still failing closed for the actual checkout call.
 */
export function isPaymentConfigured(): boolean {
  const provider = process.env.PAYMENT_PROVIDER ?? 'stub'
  if (process.env.NODE_ENV === 'production' && provider === 'stub') return false
  if (provider === 'stripe') {
    const secretKey = process.env.STRIPE_SECRET_KEY
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    return Boolean(
      secretKey &&
        !secretKey.startsWith('your_') &&
        webhookSecret &&
        !webhookSecret.startsWith('your_')
    )
  }
  if (provider === 'authnet') {
    return Boolean(
      process.env.AUTHORIZENET_API_LOGIN_ID &&
        process.env.AUTHORIZENET_TRANSACTION_KEY
    )
  }
  if (provider === 'kurv') {
    const key = process.env.KURV_API_KEY
    return Boolean(key && !key.startsWith('your_'))
  }
  return true
}

export function getPaymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER ?? 'stub'
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER === 'stub')
  ) {
    throw new Error(
      'PAYMENT_PROVIDER must be set to a real provider in production. Stub is not allowed.'
    )
  }
  switch (name) {
    case 'authnet':
      return new AuthNetProvider()
    case 'stripe':
      return new StripeProvider()
    case 'kurv':
      return new KurvProvider()
    case 'stub':
      return new StubProvider()
    default:
      throw new Error(`Unknown payment provider: ${name}`)
  }
}
