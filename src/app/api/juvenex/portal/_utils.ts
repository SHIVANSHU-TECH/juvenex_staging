import { juvenexClient } from '@/lib/juvenex/client'

type AuthUser = { email: string }

function sameEmail(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function authenticatedEmail(user: AuthUser) {
  return user.email.trim().toLowerCase()
}

export async function requireOwnedOrder(orderId: string, user: AuthUser) {
  const order = await juvenexClient.getOrder({ order_id: orderId })
  if (order.status !== 1) {
    return {
      response: Response.json(
        { error: order.message || 'Order not found' },
        { status: 404 }
      ),
    }
  }
  if (!order.email || !sameEmail(order.email, user.email)) {
    return { response: Response.json({ error: 'Order not found' }, { status: 404 }) }
  }
  return { order }
}

export async function requireOwnedCustomer(customerId: string | number, user: AuthUser) {
  const customer = await juvenexClient.getCustomer({ email: authenticatedEmail(user) })
  if (
    customer.status !== 1 ||
    customer.customer_id === undefined ||
    String(customer.customer_id) !== String(customerId)
  ) {
    return { response: Response.json({ error: 'Customer not found' }, { status: 404 }) }
  }
  return { customer }
}

