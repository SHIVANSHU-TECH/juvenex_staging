import 'server-only'

import type {
  CardOrderInput,
  CreateOrderTestInput,
  CouponInput,
  CustomPriceOfflineOrderInput,
  CustomerViewInput,
  CancelEnrollmentInput,
  GetCustomerInput,
  GetEnrollmentInput,
  GetOrderByPaymentTokenInput,
  GetOrderHistoryInput,
  GetOrderInput,
  ListOrdersInput,
  ListOrdersUpdatedSinceInput,
  MemberViewInput,
  OfflineOrderInput,
  PatientMessageInput,
  PendingFormsInput,
  PendingFormsResponse,
  SendPatientMessageInput,
  UpdateOrderInput,
  UpdateShippingAddressInput,
} from './schemas'

const DEFAULT_BASE_URL = 'https://panel.whitelabelmd.com/juvenex/api/v1'
/** IdunRX-style createOrder_test (legacy FormData checkout). */
const DEFAULT_CREATE_ORDER_TEST_URL =
  'https://panel.whitelabelmd.com/juvenex/api/createOrder_test'
const DEFAULT_TIMEOUT_MS = 15_000

export interface JuvenexProduct {
  product_id: string
  product_name: string
  product_price: string
  product_sku?: string
  [key: string]: unknown
}

export interface JuvenexResponse {
  status: number
  message?: string
  [key: string]: unknown
}

export interface JuvenexProductsResponse extends JuvenexResponse {
  product: JuvenexProduct[]
}

export interface JuvenexProductDetailsResponse extends JuvenexResponse {
  product_data: JuvenexProduct & {
    product_description?: string
    payment_name?: string[]
    countries?: string
  }
}

export interface JuvenexMemberResponse extends JuvenexResponse {
  data: 0 | 1
  m_price?: string
}

export interface JuvenexCouponResponse extends JuvenexResponse {
  data?: { code: string; discount_amount: string }
}

export interface JuvenexOrderResponse extends JuvenexResponse {
  order_id?: string
}

export interface JuvenexOrderRecord {
  order_id: string
  order_status: string
  order_status_meaning?: string
  is_recurring?: string
  order_type?: 'recurring' | 'one_time'
  email?: string
  tracking_number?: string | null
  payment_token?: string | null
  [key: string]: unknown
}

export interface JuvenexGetOrderResponse extends JuvenexResponse, Partial<JuvenexOrderRecord> {
  enrollment?: JuvenexEnrollment | null
}

export interface JuvenexListOrdersResponse extends JuvenexResponse {
  total?: number
  orders?: JuvenexOrderRecord[]
  since?: string
}

export interface JuvenexCustomerResponse extends JuvenexResponse {
  customer_id?: string | number
  email?: string
  first_name?: string
  last_name?: string
  phone_number?: string
  date_created?: string
  order_count?: string
  order_list?: string[]
}

export interface JuvenexEnrollment {
  subscription_id: string
  product_id?: string
  product_name?: string
  next_bill_date?: string
  billing_model?: string
  status?: 'active' | 'paused' | string
  price?: string
}

export interface JuvenexEnrollmentResponse extends JuvenexResponse {
  order_id?: string
  enrollments?: JuvenexEnrollment[]
}

export interface JuvenexOrderHistoryResponse extends JuvenexResponse {
  timeline?: Array<{
    icon?: string
    title: string
    date?: string
    description?: string
  }>
}

export interface JuvenexPatientMessageResponse extends JuvenexResponse {
  order_id?: string
  patient_id?: string
  data?: unknown
  http?: number
  response?: unknown
}

export class JuvenexApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number = 502,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'JuvenexApiError'
  }
}

export class JuvenexClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly timeoutMs: number

  constructor(options?: { baseUrl?: string; apiKey?: string; timeoutMs?: number }) {
    this.baseUrl = (options?.baseUrl ?? process.env.JUVENEX_API_BASE_URL ?? DEFAULT_BASE_URL)
      .replace(/\/+$/, '')
    this.apiKey = options?.apiKey ?? process.env.JUVENEX_API_KEY ?? ''
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  private async request<T extends JuvenexResponse>(path: string, body?: unknown): Promise<T> {
    if (!this.apiKey) {
      throw new JuvenexApiError('Juvenex API is not configured', 503)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'api-key': this.apiKey,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: controller.signal,
      })

      const text = await response.text()
      let data: unknown
      try {
        data = JSON.parse(text)
      } catch {
        throw new JuvenexApiError('Juvenex returned an invalid JSON response', 502)
      }

      if (!response.ok) {
        throw new JuvenexApiError(`Juvenex request failed with HTTP ${response.status}`, 502)
      }
      if (!data || typeof data !== 'object' || typeof (data as { status?: unknown }).status !== 'number') {
        throw new JuvenexApiError('Juvenex returned an invalid response envelope', 502)
      }
      return data as T
    } catch (error: unknown) {
      if (error instanceof JuvenexApiError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new JuvenexApiError('Juvenex request timed out', 504, error)
      }
      throw new JuvenexApiError('Unable to reach Juvenex', 502, error)
    } finally {
      clearTimeout(timeout)
    }
  }

  private async requestForm<T extends JuvenexResponse>(path: string, form: FormData): Promise<T> {
    if (!this.apiKey) throw new JuvenexApiError('Juvenex API is not configured', 503)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'api-key': this.apiKey, Accept: 'application/json' },
        body: form,
        cache: 'no-store',
        signal: controller.signal,
      })
      const text = await response.text()
      let data: unknown
      try {
        data = JSON.parse(text)
      } catch {
        throw new JuvenexApiError('Juvenex returned an invalid JSON response', 502)
      }
      if (!response.ok) {
        throw new JuvenexApiError(`Juvenex request failed with HTTP ${response.status}`, 502)
      }
      if (!data || typeof data !== 'object' || typeof (data as { status?: unknown }).status !== 'number') {
        throw new JuvenexApiError('Juvenex returned an invalid response envelope', 502)
      }
      return data as T
    } catch (error: unknown) {
      if (error instanceof JuvenexApiError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new JuvenexApiError('Juvenex request timed out', 504, error)
      }
      throw new JuvenexApiError('Unable to reach Juvenex', 502, error)
    } finally {
      clearTimeout(timeout)
    }
  }

  getProducts() {
    return this.request<JuvenexProductsResponse>('Get_Products')
  }

  getProductDetails(productId: string) {
    return this.request<JuvenexProductDetailsResponse>('Get_Product_Details', {
      product_id: productId,
    })
  }

  memberView(input: MemberViewInput) {
    return this.request<JuvenexMemberResponse>('Member_View', input)
  }

  checkCoupon(input: CouponInput) {
    return this.request<JuvenexCouponResponse>('Check_Coupons', input)
  }

  createOrder(input: CardOrderInput) {
    return this.request<JuvenexOrderResponse>('Create_Order', input)
  }

  /**
   * IdunRX-compatible `createOrder_test` — multipart FormData, whole cart in one call.
   * URL: https://panel.whitelabelmd.com/Juvenex/api/createOrder_test
   */
  async createOrderTest(input: CreateOrderTestInput): Promise<JuvenexOrderResponse & { order_ids?: string[] }> {
    const url = (
      process.env.JUVENEX_CREATE_ORDER_TEST_URL || DEFAULT_CREATE_ORDER_TEST_URL
    ).replace(/\/+$/, '')

    const form = new FormData()
    form.append('billingSameAsShipping', input.billingSameAsShipping === 'NO' ? 'NO' : 'YES')
    form.append('email', input.email)
    form.append('first_name', input.first_name)
    form.append('last_name', input.last_name)
    form.append('phone', input.phone)
    form.append('address', input.address)
    if (input.address2) form.append('address2', input.address2)
    form.append('city_name', input.city_name)
    form.append('state_name', input.state_name)
    form.append('zip_code', input.zip_code)
    form.append('card_type', input.card_type || inferCardType(input.card_no))
    form.append('card_no', input.card_no)
    form.append('ex_month', input.ex_month)
    form.append('ex_year', input.ex_year.slice(-2))
    form.append('cvv_no', input.cvv_no)
    form.append('card_holder_name', input.card_holder_name)
    form.append('start_url', input.start_url)
    form.append('promo_codes', input.promo_codes || '')
    form.append('campaign_id', '')

    if (input.billingSameAsShipping === 'NO') {
      form.append('billingAddress', input.billing_address || '')
      form.append('billingCity', input.billing_city_name || '')
      form.append('billingState', input.billing_state_name || '')
      form.append('billingZip', input.billing_zip_code || '')
      form.append('billingCountry', 'US')
    }

    for (const product of input.products) {
      const price = String(product.product_price)
      const original = String(product.original_price ?? product.product_price)
      form.append('product_id[]', String(product.product_id))
      form.append('product_price[]', price)
      form.append('original_price[]', original)
      form.append('gateway_id[]', '1')
      form.append('billing_model_id[]', '3')
      form.append('promoCodes[]', '0')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      // Match IdunRX: do not send api-key on createOrder_test (HTML login pages break JSON parse).

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: form,
        cache: 'no-store',
        signal: controller.signal,
      })
      const text = await response.text()
      let data: unknown
      try {
        data = JSON.parse(text)
      } catch {
        const snippet = text.replace(/\s+/g, ' ').slice(0, 160)
        throw new JuvenexApiError(
          `Juvenex createOrder_test returned invalid JSON (HTTP ${response.status}): ${snippet || '(empty)'}`,
          502
        )
      }
      if (!response.ok) {
        throw new JuvenexApiError(
          `Juvenex createOrder_test failed with HTTP ${response.status}`,
          502
        )
      }
      return normalizeCreateOrderTestResponse(data)
    } catch (error: unknown) {
      if (error instanceof JuvenexApiError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new JuvenexApiError('Juvenex createOrder_test timed out', 504, error)
      }
      throw new JuvenexApiError('Unable to reach Juvenex createOrder_test', 502, error)
    } finally {
      clearTimeout(timeout)
    }
  }

  createOfflineOrder(input: OfflineOrderInput) {
    return this.request<JuvenexOrderResponse>('Create_Order_Offline', input)
  }

  createCustomPriceOfflineOrder(input: CustomPriceOfflineOrderInput) {
    return this.request<JuvenexOrderResponse>('Create_Order_Custom_Price_Offline', input)
  }

  getOrder(input: GetOrderInput) {
    return this.request<JuvenexGetOrderResponse>('get-order', input)
  }

  listOrders(input: ListOrdersInput) {
    return this.request<JuvenexListOrdersResponse>('list-orders', input)
  }

  listOrdersUpdatedSince(input: ListOrdersUpdatedSinceInput) {
    return this.request<JuvenexListOrdersResponse>('list-orders-updated-since', input)
  }

  updateShippingAddress(input: UpdateShippingAddressInput) {
    return this.request<JuvenexResponse>('update-shipping-address', input)
  }

  getCustomer(input: GetCustomerInput) {
    return this.request<JuvenexCustomerResponse>('get-customer', input)
  }

  customerView(input: CustomerViewInput) {
    return this.request<JuvenexCustomerResponse>('customer-view', input)
  }

  getEnrollment(input: GetEnrollmentInput) {
    return this.request<JuvenexEnrollmentResponse>('get-enrollment', input)
  }

  cancelEnrollment(input: CancelEnrollmentInput) {
    return this.request<JuvenexResponse>('cancel-enrollment', input)
  }

  getOrderHistory(input: GetOrderHistoryInput) {
    return this.request<JuvenexOrderHistoryResponse>('get-order-history', input)
  }

  getOrderByPaymentToken(input: GetOrderByPaymentTokenInput) {
    return this.request<JuvenexGetOrderResponse>('get-order-by-payment-token', input)
  }

  updateOrder(input: UpdateOrderInput) {
    return this.request<JuvenexResponse>('update-order', input)
  }

  patientMessage(input: PatientMessageInput) {
    return this.request<JuvenexPatientMessageResponse>('patient-message', input)
  }

  sendPatientMessage(input: SendPatientMessageInput, file?: File) {
    if (!file) return this.request<JuvenexPatientMessageResponse>('send-patient-message', input)
    const form = new FormData()
    form.set('order_id', input.order_id)
    if (input.text) form.set('text', input.text)
    form.set('file', file, file.name)
    return this.requestForm<JuvenexPatientMessageResponse>('send-patient-message', form)
  }

  /**
   * Stage 2 intake. NOT yet deployed by the vendor at time of writing: the
   * route 404s with an HTML body, which `request()` surfaces as an
   * invalid-JSON error rather than a 404 (it parses before checking `ok`).
   * The calling route detects that case and degrades silently — see
   * `api/juvenex/intake/pending-forms`.
   *
   * The declared `status: 1` is the success shape only; a vendor business
   * error still arrives here as `status: 0`, so callers must validate with
   * `pendingFormsResponseSchema` before trusting the payload.
   */
  pendingForms(input: PendingFormsInput) {
    return this.request<PendingFormsResponse>('pending-forms', input)
  }
}

function inferCardType(pan: string): string {
  const d = pan.replace(/\D/g, '')
  if (d.startsWith('4')) return 'visa'
  if (d.startsWith('5') || d.startsWith('2')) return 'mastercard'
  if (d.startsWith('3')) return 'american express'
  if (d.startsWith('6')) return 'discover'
  return 'visa'
}

function pickOrderId(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') return null
  const o = entry as Record<string, unknown>
  for (const key of ['order_id', 'orderId', 'orderid', 'id']) {
    const v = o[key]
    if (v != null && String(v).trim()) return String(v)
  }
  return null
}

/** Normalize IdunRX-style createOrder_test responses (object or array). */
function normalizeCreateOrderTestResponse(
  data: unknown
): JuvenexOrderResponse & { order_ids?: string[] } {
  if (Array.isArray(data)) {
    const orderIds = data.map(pickOrderId).filter((id): id is string => !!id)
    const allOk = data.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        (entry as { status?: number }).status === 1
    )
    const firstMsg =
      data.find(
        (entry) =>
          entry && typeof entry === 'object' && (entry as { message?: string }).message
      ) as { message?: string; status?: number } | undefined
    return {
      status: allOk && orderIds.length ? 1 : firstMsg?.status === 5 ? 5 : 0,
      message: firstMsg?.message,
      order_id: orderIds[0],
      order_ids: orderIds,
    }
  }

  if (!data || typeof data !== 'object') {
    throw new JuvenexApiError('Juvenex createOrder_test returned an invalid response', 502)
  }

  const obj = data as Record<string, unknown>
  const orderIds: string[] = []
  if (Array.isArray(obj.orders)) {
    for (const entry of obj.orders) {
      const id = pickOrderId(entry)
      if (id) orderIds.push(id)
    }
  }
  if (Array.isArray(obj.order_ids)) {
    for (const id of obj.order_ids) {
      if (id != null && String(id).trim()) orderIds.push(String(id))
    }
  }
  const single = pickOrderId(obj)
  if (single && !orderIds.includes(single)) orderIds.unshift(single)

  const status = typeof obj.status === 'number' ? obj.status : orderIds.length ? 1 : 0
  return {
    status,
    message: typeof obj.message === 'string' ? obj.message : undefined,
    order_id: orderIds[0],
    order_ids: orderIds.length ? orderIds : undefined,
  }
}

export const juvenexClient = new JuvenexClient()
