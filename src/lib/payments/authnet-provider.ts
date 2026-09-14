import crypto from 'crypto'

import type {
  CheckoutSession,
  CheckoutSessionRequest,
  PaymentProvider,
  WebhookEvent,
} from './provider'

type AuthNetEnvironment = 'production' | 'sandbox'

const AUTHNET_ENDPOINTS: Record<AuthNetEnvironment, string> = {
  production: 'https://api2.authorize.net/xml/v1/request.api',
  sandbox: 'https://apitest.authorize.net/xml/v1/request.api',
}

const AUTHNET_HOSTED_PAYMENT_URLS: Record<AuthNetEnvironment, string> = {
  production: 'https://accept.authorize.net/payment/payment',
  sandbox: 'https://test.authorize.net/payment/payment',
}

function env(): AuthNetEnvironment {
  return process.env.AUTHORIZENET_ENV === 'sandbox' ? 'sandbox' : 'production'
}

function apiLoginId(): string {
  const value = process.env.AUTHORIZENET_API_LOGIN_ID
  if (!value) throw new Error('AUTHORIZENET_API_LOGIN_ID is not configured')
  return value
}

function transactionKey(): string {
  const value = process.env.AUTHORIZENET_TRANSACTION_KEY
  if (!value) throw new Error('AUTHORIZENET_TRANSACTION_KEY is not configured')
  return value
}

function signatureKey(): string | null {
  return process.env.AUTHORIZENET_SIGNATURE_KEY || null
}

function appOrigin(successUrl: string): string {
  try {
    return new URL(successUrl).origin
  } catch {
    return process.env.NEXT_PUBLIC_APP_URL || ''
  }
}

function dollars(amountCents: number): string {
  return (amountCents / 100).toFixed(2)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseSignature(signature: string | null): string | null {
  if (!signature) return null
  const match = signature.match(/^sha512=(.+)$/i)
  return match?.[1] ?? signature
}

function timingSafeHexEqual(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, 'hex')
    const right = Buffer.from(b, 'hex')
    return left.length === right.length && crypto.timingSafeEqual(left, right)
  } catch {
    return false
  }
}

export class AuthNetProvider implements PaymentProvider {
  readonly name = 'authnet'

  async createCheckoutSession(
    req: CheckoutSessionRequest
  ): Promise<CheckoutSession> {
    const mode = env()
    const origin = appOrigin(req.successUrl)
    const hostedPaymentUrl = AUTHNET_HOSTED_PAYMENT_URLS[mode]

    const response = await fetch(AUTHNET_ENDPOINTS[mode], {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        getHostedPaymentPageRequest: {
          merchantAuthentication: {
            name: apiLoginId(),
            transactionKey: transactionKey(),
          },
          transactionRequest: {
            transactionType: 'authCaptureTransaction',
            amount: dollars(req.amountCents),
            order: {
              invoiceNumber: req.orderId,
              description: `Juvenex order ${req.orderId}`,
            },
            customer: {
              email: req.customerEmail,
            },
            userFields: {
              userField: [
                { name: 'orderId', value: req.orderId },
                ...(req.metadata?.userId
                  ? [{ name: 'userId', value: req.metadata.userId }]
                  : []),
              ],
            },
          },
          hostedPaymentSettings: {
            setting: [
              {
                settingName: 'hostedPaymentReturnOptions',
                settingValue: JSON.stringify({
                  showReceipt: true,
                  url: req.successUrl,
                  urlText: 'Return to Juvenex',
                  cancelUrl: req.cancelUrl,
                  cancelUrlText: 'Cancel',
                }),
              },
              {
                settingName: 'hostedPaymentButtonOptions',
                settingValue: JSON.stringify({ text: 'Pay' }),
              },
              {
                settingName: 'hostedPaymentPaymentOptions',
                settingValue: JSON.stringify({
                  cardCodeRequired: true,
                  showCreditCard: true,
                  showBankAccount: false,
                }),
              },
              {
                settingName: 'hostedPaymentSecurityOptions',
                settingValue: JSON.stringify({ captcha: false }),
              },
              {
                settingName: 'hostedPaymentCustomerOptions',
                settingValue: JSON.stringify({
                  showEmail: true,
                  requiredEmail: true,
                }),
              },
              {
                settingName: 'hostedPaymentOrderOptions',
                settingValue: JSON.stringify({ show: true }),
              },
            ],
          },
        },
      }),
    })

    const payload = (await response.json().catch(() => null)) as
      | {
          token?: unknown
          messages?: {
            resultCode?: string
            message?: Array<{ code?: string; text?: string }>
          }
        }
      | null

    const resultCode = payload?.messages?.resultCode
    const token = stringValue(payload?.token)
    if (!response.ok || resultCode !== 'Ok' || !token) {
      const message = payload?.messages?.message?.[0]
      throw new Error(
        `Authorize.net hosted payment token failed${
          message?.code || message?.text
            ? `: ${message?.code ?? ''} ${message?.text ?? ''}`.trim()
            : ''
        }`
      )
    }

    const sessionUrl = `${origin}/api/payments/authnet/redirect?token=${encodeURIComponent(
      token
    )}&target=${encodeURIComponent(hostedPaymentUrl)}`

    return {
      sessionId: `authnet_hosted_${req.orderId}`,
      sessionUrl,
      provider: this.name,
    }
  }

  verifyWebhookSignature(
    payload: string,
    signature: string | null
  ): WebhookEvent | null {
    const key = signatureKey()
    if (!key) return null

    const received = parseSignature(signature)
    if (!received) return null

    const expected = crypto
      .createHmac('sha512', Buffer.from(key, 'hex'))
      .update(payload, 'utf8')
      .digest('hex')

    if (!timingSafeHexEqual(received, expected)) return null

    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>
      const eventType = stringValue(parsed.eventType)
      const eventPayload =
        typeof parsed.payload === 'object' &&
        parsed.payload !== null &&
        !Array.isArray(parsed.payload)
          ? (parsed.payload as Record<string, unknown>)
          : null

      if (!eventPayload) return null

      const orderId =
        stringValue(eventPayload.invoiceNumber) ??
        stringValue(eventPayload.orderId)
      const paymentReference = stringValue(eventPayload.id)
      const amount = numberValue(
        eventPayload.authAmount ?? eventPayload.settleAmount
      )

      if (!orderId || !paymentReference || amount === null) return null

      const amountCents = Math.round(amount * 100)
      if (eventType === 'net.authorize.payment.authcapture.created') {
        return {
          type: 'payment.succeeded',
          orderId,
          paymentReference,
          amountCents,
        }
      }

      if (eventType === 'net.authorize.payment.refund.created') {
        return {
          type: 'payment.refunded',
          orderId,
          paymentReference,
          amountCents,
        }
      }

      if (eventType === 'net.authorize.payment.void.created') {
        return {
          type: 'payment.failed',
          orderId,
          paymentReference,
          amountCents,
        }
      }

      return null
    } catch {
      return null
    }
  }
}
