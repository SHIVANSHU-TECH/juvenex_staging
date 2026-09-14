import type {
  CancelOwnedEnrollmentSchemaInput,
  CustomerViewInput,
  GetOrderByPaymentTokenInput,
  ListOrdersInput,
  ListOrdersUpdatedSinceInput,
  UpdateOrderInput,
  UpdateShippingAddressInput,
} from '@/lib/juvenex/schemas'

export interface PortalApiResponse {
  status?: number
  message?: string
  error?: string
  [key: string]: unknown
}

export class JuvenexPortalError extends Error {
  constructor(
    message: string,
    readonly upstreamStatus?: number,
    readonly response?: PortalApiResponse
  ) {
    super(message)
    this.name = 'JuvenexPortalError'
  }
}

function authToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('auth_token')
}

async function post<T extends PortalApiResponse>(
  action: string,
  body: Record<string, unknown> | FormData
): Promise<T> {
  const token = authToken()
  const multipart = body instanceof FormData
  const response = await fetch(`/api/juvenex/portal/${action}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(multipart ? {} : { 'Content-Type': 'application/json' }),
    },
    body: multipart ? body : JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as T
  if (!response.ok) {
    throw new JuvenexPortalError(
      data.error || data.message || `Request failed with HTTP ${response.status}`,
      data.status,
      data
    )
  }
  if (typeof data.status === 'number' && data.status !== 1) {
    throw new JuvenexPortalError(
      data.message || 'The order service could not complete this request.',
      data.status,
      data
    )
  }
  return data
}

export const juvenexPortalApi = {
  getOrder: (orderId: string) => post('get-order', { order_id: orderId }),
  listOrders: (filters: Omit<ListOrdersInput, 'email'> = {}) => post('list-orders', filters),
  /**
   * Locally-mirrored orders (migration 050). Returns an empty `orders` array —
   * never an error — for customers who ordered before mirroring existed, which
   * is the signal for callers to fall back to `listOrders`.
   */
  listLocalOrders: () => post('local-orders', {}),
  listOrdersUpdatedSince: (
    filters: Omit<ListOrdersUpdatedSinceInput, 'email'>
  ) => post('list-orders-updated-since', filters),
  updateShippingAddress: (input: UpdateShippingAddressInput) =>
    post('update-shipping-address', input),
  getCustomer: () => post('get-customer', {}),
  customerView: (input: CustomerViewInput) => post('customer-view', input),
  getEnrollment: (orderId: string) => post('get-enrollment', { order_id: orderId }),
  cancelEnrollment: (input: CancelOwnedEnrollmentSchemaInput) =>
    post('cancel-enrollment', input),
  getOrderHistory: (orderId: string) => post('get-order-history', { order_id: orderId }),
  getOrderByPaymentToken: (
    input: Omit<GetOrderByPaymentTokenInput, 'email'>
  ) => post('get-order-by-payment-token', input),
  updateOrder: (input: UpdateOrderInput) => post('update-order', input),
  patientMessages: (orderId: string) => post('patient-message', { order_id: orderId }),
  sendPatientMessage: (input: { order_id: string; text?: string; file?: File }) => {
    if (!input.file) {
      return post('send-patient-message', {
        order_id: input.order_id,
        text: input.text,
      })
    }
    const form = new FormData()
    form.set('order_id', input.order_id)
    if (input.text) form.set('text', input.text)
    form.set('file', input.file, input.file.name)
    return post('send-patient-message', form)
  },
}
