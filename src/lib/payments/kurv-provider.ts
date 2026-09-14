// Kurv payment provider (https://kurv.app, docs https://docs.kurv.app).
//
// Checkout model:
//   POST {base}/payment-requests/ with request_methods:["WEB"] creates a hosted
//   payment page and returns `long_url` — we redirect the customer there. We
//   pass our orderId as `reference_number` so the webhook can correlate back,
//   and our success/cancel/webhook URLs as redirect_url/cancel_url/response_url.
//
// Webhook model:
//   Kurv POSTs payment status to `response_url`. Kurv publishes NO webhook
//   signature scheme, so we never trust the delivered body. Instead we extract
//   the payment_id / transaction_id from it and RE-FETCH the authoritative
//   record from the Kurv API with our secret key. That makes a forged webhook
//   useless — only Kurv's own records can flip an order.
//
// Amounts: Kurv uses MAJOR currency units (e.g. 95.00 = $95). Our system uses
// integer cents everywhere, so we divide by 100 on the way out and multiply by
// 100 on the way back.

import {
  CheckoutSession,
  CheckoutSessionRequest,
  PaymentProvider,
  WebhookEvent,
  WebhookEventType,
} from './provider'

function kurvBase(): string {
  const explicit = process.env.KURV_API_BASE
  if (explicit) return explicit.replace(/\/$/, '')
  // Fall back to the environment implied by the key prefix.
  const key = process.env.KURV_API_KEY ?? ''
  return key.startsWith('kp_live_')
    ? 'https://live.kurv.app'
    : 'https://api-sandbox.kurv.app'
}

function authHeaders(): Record<string, string> {
  const key = process.env.KURV_API_KEY
  if (!key) throw new Error('KURV_API_KEY is not configured')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

// Kurv requires customer_first_name. We only reliably have an email at checkout,
// so derive a presentable first name from its local part, defaulting safely.
function deriveFirstName(email: string): string {
  const local = (email || '').split('@')[0] ?? ''
  const word = local.replace(/[^a-zA-Z]+/g, ' ').trim().split(/\s+/)[0] ?? ''
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : 'Customer'
}

interface KurvRecordShape {
  status?: unknown
  amount?: unknown
  payment_id?: unknown
  transaction_id?: unknown
  reference_number?: unknown
}

// The docs render the webhook value as response='{...}' — Kurv can wrap the
// JSON string in single (or double) quotes. Strip a single matching pair so
// JSON.parse doesn't choke on the leading quote.
function stripWrappingQuotes(value: string): string {
  const t = value.trim()
  if (
    t.length >= 2 &&
    ((t.startsWith("'") && t.endsWith("'")) ||
      (t.startsWith('"') && t.endsWith('"')))
  ) {
    return t.slice(1, -1)
  }
  return t
}

// Parse Kurv's webhook delivery into a record object.
//
// Kurv POSTs application/x-www-form-urlencoded with a single `response` field
// holding a JSON string (sometimes quote-wrapped per the docs). The previous
// implementation JSON.parsed that value WITHOUT stripping the wrapping quotes,
// so every real delivery threw and the payment was silently dropped (order
// stuck 'pending'). We now tolerate: form `response`, flat form fields, a bare
// JSON body, or a JSON body with a nested `response` string.
function parseKurvWebhook(payload: string): KurvRecordShape | null {
  // a) form-encoded — the documented shape.
  try {
    const params = new URLSearchParams(payload)
    const resp = params.get('response')
    if (resp) {
      try {
        return JSON.parse(stripWrappingQuotes(resp)) as KurvRecordShape
      } catch {
        // fall through to flat fields / JSON body
      }
    }
    const pid = params.get('payment_id')
    const tid = params.get('transaction_id')
    if (pid || tid) {
      return {
        payment_id: pid ?? undefined,
        transaction_id: tid ?? undefined,
        reference_number: params.get('reference_number') ?? undefined,
        status: params.get('status') ?? params.get('result') ?? undefined,
        amount: params.get('amount') ?? undefined,
      }
    }
  } catch {
    // not form-encoded — try JSON below
  }

  // b) JSON body — either a bare record or { response: "<json string>" }.
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>
    if (obj && typeof obj === 'object') {
      if (typeof obj.response === 'string') {
        try {
          return JSON.parse(stripWrappingQuotes(obj.response)) as KurvRecordShape
        } catch {
          // fall through
        }
      }
      if (
        typeof obj.payment_id === 'string' ||
        typeof obj.transaction_id === 'string'
      ) {
        return obj as KurvRecordShape
      }
    }
  } catch {
    // not JSON
  }

  return null
}

// Kurv's single-resource reads return LIST wrappers, not bare records:
//   GET /payments            → { payments: [ {...} ] }
//   GET /payment-requests/ID → { transactions: [ {...} ] }
// Unwrap whichever shape we got (or accept a bare record) so status/amount are
// read off the actual record and not the wrapper (where they're undefined).
function unwrapKurvRecord(json: unknown): KurvRecordShape | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  if (Array.isArray(obj.payments) && obj.payments.length > 0) {
    return obj.payments[0] as KurvRecordShape
  }
  if (Array.isArray(obj.transactions) && obj.transactions.length > 0) {
    return obj.transactions[0] as KurvRecordShape
  }
  if (
    'status' in obj ||
    'payment_id' in obj ||
    'transaction_id' in obj ||
    'reference_number' in obj
  ) {
    return obj as KurvRecordShape
  }
  return null
}

// Pull a payment_id / transaction_id out of a webhook delivery.
function extractRef(payload: string): {
  paymentId?: string
  transactionId?: string
} {
  const rec = parseKurvWebhook(payload)
  return {
    paymentId: typeof rec?.payment_id === 'string' ? rec.payment_id : undefined,
    transactionId:
      typeof rec?.transaction_id === 'string' ? rec.transaction_id : undefined,
  }
}

function mapStatus(status: string): WebhookEventType | null {
  const s = status.toLowerCase()
  if (['ack', 'success', 'paid', 'capture', 'approved'].includes(s)) {
    return 'payment.succeeded'
  }
  if (['nok', 'failed', 'declined', 'error', 'cancelled'].includes(s)) {
    return 'payment.failed'
  }
  if (['refund', 'refunded'].includes(s)) {
    return 'payment.refunded'
  }
  return null // pending / unknown — ignore this delivery
}

export class KurvProvider implements PaymentProvider {
  readonly name = 'kurv'

  async createCheckoutSession(
    req: CheckoutSessionRequest
  ): Promise<CheckoutSession> {
    const base = kurvBase()

    // Derive the webhook URL from the (absolute) successUrl origin so we don't
    // need another env var; the checkout route always passes absolute URLs.
    let responseUrl: string | undefined
    try {
      responseUrl = `${new URL(req.successUrl).origin}/api/payments/webhook`
    } catch {
      responseUrl = undefined
    }

    // Recurring (Netflix-style) vs one-time.
    //
    // Kurv's recurring contract (docs): when payment_frequency != ONE-TIME it
    // ALSO requires initial_payment_amount (charged immediately on the hosted
    // page) and total_number_of_payments, plus payment_start_date — which is
    // when the *recurring series* begins and MUST be in the future. We set it
    // ~one month out so it can't lapse while the customer is on the hosted page
    // (the earlier +5min buffer expired mid-checkout → "Start date must be in
    // the future" decline). Net effect: first month billed now, then monthly.
    const recurringFields = req.recurring
      ? {
          payment_frequency:
            req.recurring.interval === 'monthly' ? 'MONTHLY' : 'ONE-TIME',
          payment_start_date: req.recurring.startDate,
          initial_payment_amount: req.recurring.initialAmountCents / 100,
          total_number_of_payments: req.recurring.totalPayments,
        }
      : { payment_frequency: 'ONE-TIME' }

    // Itemized lines for the hosted pay page. Display-only — Kurv charges the
    // top-level amount / initial_payment_amount, not the sum of these.
    const cartItems =
      req.cartItems && req.cartItems.length > 0
        ? req.cartItems.map((line) => ({
            name: line.name.slice(0, 120),
            qty: line.quantity,
            sales_price: line.unitPriceCents / 100,
          }))
        : undefined

    const body = {
      request_methods: ['WEB'],
      email: req.customerEmail,
      customer_first_name: deriveFirstName(req.customerEmail),
      amount: req.amountCents / 100,
      currency: req.currency.toUpperCase(),
      fixed_amount: true,
      reference_number: req.orderId,
      redirect_url: req.successUrl,
      cancel_url: req.cancelUrl,
      ...recurringFields,
      ...(cartItems ? { cart_items: cartItems } : {}),
      ...(responseUrl ? { response_url: responseUrl } : {}),
    }

    const res = await fetch(`${base}/payment-requests/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(
        `Kurv createCheckoutSession failed: ${res.status} ${detail.slice(0, 300)}`
      )
    }

    const data = (await res.json()) as {
      transaction_id?: unknown
      long_url?: unknown
      short_url?: unknown
    }
    const sessionUrl =
      (typeof data.long_url === 'string' && data.long_url) ||
      (typeof data.short_url === 'string' && data.short_url) ||
      ''
    const sessionId =
      typeof data.transaction_id === 'string' ? data.transaction_id : ''

    if (!sessionUrl || !sessionId) {
      throw new Error('Kurv createCheckoutSession: missing long_url/transaction_id')
    }

    return { sessionId, sessionUrl, provider: this.name }
  }

  async verifyWebhookSignature(
    payload: string,
    _signature: string | null
  ): Promise<WebhookEvent | null> {
    const ref = extractRef(payload)
    if (!ref.paymentId && !ref.transactionId) return null

    const base = kurvBase()
    let headers: Record<string, string>
    try {
      headers = authHeaders()
    } catch {
      return null
    }

    // Re-fetch the authoritative record. Prefer the payment id; fall back to
    // the payment-request (transaction) lookup.
    let record: KurvRecordShape | null = null
    if (ref.paymentId) {
      const r = await fetch(
        `${base}/payments/${encodeURIComponent(ref.paymentId)}`,
        { headers }
      )
      if (r.ok) record = unwrapKurvRecord(await r.json().catch(() => null))
    }
    if (!record && ref.transactionId) {
      const r = await fetch(
        `${base}/payment-requests/${encodeURIComponent(ref.transactionId)}`,
        { headers }
      )
      if (r.ok) record = unwrapKurvRecord(await r.json().catch(() => null))
    }
    if (!record) return null
    return recordToEvent(record, ref.paymentId ?? ref.transactionId)
  }

  // Best-effort authoritative re-check used by the success-return fallback
  // (/api/payments/verify): given an order's stored payment_reference (Kurv
  // transaction_id) and our orderId, ask Kurv whether it has been paid. Returns
  // a normalized event or null. Never trusts client input — always re-fetches.
  async confirmOrderPaid(
    reference: string,
    orderId: string
  ): Promise<WebhookEvent | null> {
    const base = kurvBase()
    let headers: Record<string, string>
    try {
      headers = authHeaders()
    } catch {
      return null
    }

    // 1) The payment-request itself may carry a settled status.
    if (reference) {
      const r = await fetch(
        `${base}/payment-requests/${encodeURIComponent(reference)}`,
        { headers }
      )
      if (r.ok) {
        const rec = unwrapKurvRecord(await r.json().catch(() => null))
        const ev = rec ? recordToEvent(rec, reference, orderId) : null
        if (ev && ev.type === 'payment.succeeded') return ev
      }
    }

    // 2) Otherwise scan recent payments for a record whose reference_number is
    //    our orderId (the authoritative paid signal lives on the payment).
    const r2 = await fetch(`${base}/payments?limit=25&page=1`, { headers })
    if (r2.ok) {
      const data = (await r2.json().catch(() => null)) as {
        payments?: KurvRecordShape[]
      } | null
      const list = Array.isArray(data?.payments) ? data!.payments! : []
      const match = list.find(
        (p) => String(p?.reference_number ?? '') === orderId
      )
      if (match) {
        const ev = recordToEvent(match, reference, orderId)
        if (ev) return ev
      }
    }

    return null
  }

  // Cancel a recurring subscription. `reference` is the stored payment-request
  // id. Kurv's cancel endpoint is DELETE /payments/subscription/{id}. Best
  // effort: returns false (without throwing) on any non-OK response so callers
  // can still update local state and surface the result.
  async cancelSubscription(reference: string): Promise<boolean> {
    if (!reference) return false
    const base = kurvBase()
    let headers: Record<string, string>
    try {
      headers = authHeaders()
    } catch {
      return false
    }
    const r = await fetch(
      `${base}/payments/subscription/${encodeURIComponent(reference)}`,
      { method: 'DELETE', headers }
    ).catch(() => null)
    return Boolean(r && r.ok)
  }

  // Best-effort recurring-subscription status for the reconcile job. `reference`
  // is the Kurv payment_id. We read the payment record and map its status using
  // the documented values (success / capture / refund / end_subscription).
  // Anything we can't positively read as ended is reported 'unknown' so we
  // never lapse a paying member on a transient API hiccup.
  async getRecurringStatus(
    reference: string
  ): Promise<'active' | 'ended' | 'unknown'> {
    if (!reference) return 'unknown'
    const base = kurvBase()
    let headers: Record<string, string>
    try {
      headers = authHeaders()
    } catch {
      return 'unknown'
    }
    const r = await fetch(
      `${base}/payments/${encodeURIComponent(reference)}`,
      { headers }
    ).catch(() => null)
    if (!r || !r.ok) return 'unknown'
    const rec = (await r.json().catch(() => null)) as KurvRecordShape | null
    const status = String(rec?.status ?? '').toLowerCase()
    if (!status) return 'unknown'
    // Documented terminal states: the subscription is no longer billing.
    if (['end_subscription', 'refund', 'cancelled', 'canceled', 'failed', 'nok'].includes(status)) {
      return 'ended'
    }
    // Documented healthy states: a charge succeeded / was captured.
    if (['success', 'capture', 'ack', 'active', 'paid'].includes(status)) {
      return 'active'
    }
    return 'unknown'
  }

  // Issue a refund. Kurv: POST /refunds/{payment_id} with { amount } (major
  // units). `reference` is the Kurv payment_id. Returns ok + the confirmed
  // refunded amount in cents. Never throws.
  async refundPayment(
    reference: string,
    amountCents: number
  ): Promise<{ ok: boolean; refundedAmountCents?: number; error?: string }> {
    if (!reference) return { ok: false, error: 'missing payment reference' }
    const base = kurvBase()
    let headers: Record<string, string>
    try {
      headers = authHeaders()
    } catch {
      return { ok: false, error: 'provider not configured' }
    }

    const r = await fetch(
      `${base}/refunds/${encodeURIComponent(reference)}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ amount: amountCents / 100 }),
      }
    ).catch(() => null)

    if (!r) return { ok: false, error: 'network error' }
    const rec = (await r.json().catch(() => null)) as
      | { status?: unknown; refunded_amount?: unknown; amount?: unknown; error?: unknown }
      | null
    if (!r.ok) {
      const msg =
        (rec && typeof rec.error === 'string' && rec.error) ||
        `refund failed (${r.status})`
      return { ok: false, error: msg }
    }
    // Documented success: status 'refund' with a refunded_amount.
    const refunded = Number(rec?.refunded_amount ?? rec?.amount)
    return {
      ok: true,
      refundedAmountCents: Number.isFinite(refunded)
        ? Math.round(refunded * 100)
        : undefined,
    }
  }
}

// Map a Kurv payment / payment-request record to a normalized WebhookEvent.
// `fallbackRef`/`fallbackOrderId` fill in fields the record may omit.
function recordToEvent(
  record: KurvRecordShape,
  fallbackRef?: string,
  fallbackOrderId?: string
): WebhookEvent | null {
  const type = mapStatus(String(record.status ?? ''))
  if (!type) return null

  const orderId =
    (typeof record.reference_number === 'string' && record.reference_number) ||
    fallbackOrderId ||
    ''
  if (!orderId) return null

  const paymentReference =
    (typeof record.payment_id === 'string' && record.payment_id) ||
    (typeof record.transaction_id === 'string' && record.transaction_id) ||
    fallbackRef ||
    ''

  const amount = Number(record.amount)
  if (!Number.isFinite(amount)) return null

  return { type, orderId, paymentReference, amountCents: Math.round(amount * 100) }
}
