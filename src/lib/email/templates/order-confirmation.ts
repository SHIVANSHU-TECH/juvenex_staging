/**
 * Order-confirmation email for the jx storefront.
 *
 * PHI DISCIPLINE — DO NOT RELAX THIS
 * Email is unencrypted in transit to the recipient's mailbox and is routinely
 * indexed by mail providers. A message that names a prescription product and a
 * shipping address is, in combination with an identifiable recipient, PHI.
 *
 * This template therefore carries ONLY: the customer's first name, the vendor
 * order number(s), the amount charged, and a link back to the dashboard.
 * There are deliberately NO product names, NO dosages, NO addresses, and NO
 * clinical language. Anything a customer needs beyond this lives behind
 * authentication on the dashboard. If a future change wants richer content,
 * that is a compliance decision, not a copy decision.
 */

export interface OrderConfirmationInput {
  customerName: string
  orderIds: string[]
  totalCents: number
  currency: string
  dashboardUrl: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/** Escape user-controlled values before interpolating into HTML. `customerName`
 *  comes from the checkout form, so it is attacker-influenced. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatAmount(totalCents: number, currency: string): string {
  const amount = (totalCents / 100).toFixed(2)
  return currency.toUpperCase() === 'USD' ? `$${amount}` : `${amount} ${currency.toUpperCase()}`
}

/** First token of the supplied name; falls back to a neutral greeting so a
 *  blank or single-character name never produces "Hi ,". */
function firstNameOf(customerName: string): string {
  const first = customerName.trim().split(/\s+/)[0] ?? ''
  return first.length > 0 ? first : 'there'
}

export function renderOrderConfirmation(input: OrderConfirmationInput): RenderedEmail {
  const { orderIds, totalCents, currency, dashboardUrl } = input
  const firstName = firstNameOf(input.customerName)
  const total = formatAmount(totalCents, currency)

  const subject =
    orderIds.length === 1
      ? `Your Juvenex order — ${orderIds[0]}`
      : `Your Juvenex order — ${orderIds.length} items`

  // ---------------------------------------------------------------- plain text
  const text = [
    `Hi ${firstName}, thanks for your order.`,
    '',
    orderIds.length === 1 ? 'Order number:' : 'Order numbers:',
    ...orderIds.map((id) => `  ${id}`),
    '',
    `Total: ${total}`,
    '',
    "You'll receive an update as each order progresses.",
    `Track it any time at ${dashboardUrl}`,
    '',
    '— Juvenex',
  ].join('\n')

  // ---------------------------------------------------------------------- html
  // Table layout with inline styles only: no external stylesheet, no web fonts,
  // no <style> block — the combination most mail clients render consistently.
  const safeName = escapeHtml(firstName)
  const safeUrl = escapeHtml(dashboardUrl)
  const orderRows = orderIds
    .map(
      (id) =>
        `<tr><td style="padding:6px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#111;">` +
        `<span style="font-family:'SF Mono',Menlo,Consolas,monospace;">${escapeHtml(id)}</span></td></tr>`
    )
    .join('')

  const html = `<!-- Juvenex order confirmation -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f6f4;padding:32px 0;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background:#ffffff;border-radius:10px;padding:32px;">
        <tr>
          <td style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:600;color:#111;padding-bottom:14px;">
            Order confirmed
          </td>
        </tr>
        <tr>
          <td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#333;padding-bottom:22px;">
            Hi ${safeName}, thanks for your order.
          </td>
        </tr>
        <tr>
          <td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#777;padding-bottom:6px;">
            ${orderIds.length === 1 ? 'Order number' : 'Order numbers'}
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:18px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${orderRows}</table>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid #e7e7e3;padding-top:16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#111;font-weight:600;">Total</td>
                <td align="right" style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#111;font-weight:600;">${escapeHtml(total)}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#555;padding-top:24px;">
            You&rsquo;ll receive an update as each order progresses.
          </td>
        </tr>
        <tr>
          <td style="padding-top:20px;">
            <a href="${safeUrl}" style="display:inline-block;background:#111;color:#ffffff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;padding:12px 22px;border-radius:6px;">
              Track your order
            </a>
          </td>
        </tr>
        <tr>
          <td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#999;padding-top:26px;">
            &mdash; Juvenex
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`

  return { subject, html, text }
}
