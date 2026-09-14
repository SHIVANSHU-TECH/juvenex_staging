import Section from './Section'
import { addressFingerprint, normaliseAddress } from './helpers'
import type {
  AdminOrderDetail,
  Address,
} from './types'
import type { NormalisedAddress } from './helpers'

function AddressBlock({ addr }: { addr: NormalisedAddress }) {
  const cityLine = [addr.city, addr.state].filter(Boolean).join(', ')
  const cityZip = [cityLine, addr.zip].filter(Boolean).join(' ').trim()
  const streetLine = [addr.street, addr.apt].filter(Boolean).join(', ')
  return (
    <address className="not-italic text-[#2D352C] leading-relaxed">
      {addr.name && <div>{addr.name}</div>}
      {streetLine && <div>{streetLine}</div>}
      {cityZip && <div>{cityZip}</div>}
      {addr.country && <div>{addr.country}</div>}
      {addr.phone && (
        <div className="text-[#6B7568] text-xs mt-1">{addr.phone}</div>
      )}
    </address>
  )
}

export default function CustomerSection({
  order,
}: {
  order: AdminOrderDetail
}) {
  const shipping = normaliseAddress(order.shipping_address as Address | unknown)
  const billing = normaliseAddress(order.billing_address as Address | unknown)
  const billingDiffers =
    billing !== null &&
    shipping !== null &&
    addressFingerprint(billing) !== addressFingerprint(shipping)

  return (
    <Section title="Customer">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs text-[#6B7568]">Name</dt>
          <dd className="text-[#2D352C]">
            {order.customer_name?.trim() || 'Unknown'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[#6B7568]">Email</dt>
          <dd className="text-[#2D352C] break-all">
            {order.contact_email ?? order.customer_email ?? '—'}
          </dd>
        </div>
        {order.contact_phone && (
          <div>
            <dt className="text-xs text-[#6B7568]">Phone</dt>
            <dd className="text-[#2D352C]">{order.contact_phone}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-[#6B7568]">Shipping</dt>
          <dd>
            {shipping ? (
              <AddressBlock addr={shipping} />
            ) : (
              <span className="text-[#6B7568]">
                No shipping address on file
              </span>
            )}
          </dd>
        </div>
        {billingDiffers && billing && (
          <div>
            <dt className="text-xs text-[#6B7568]">Billing</dt>
            <dd>
              <AddressBlock addr={billing} />
            </dd>
          </div>
        )}
      </dl>
    </Section>
  )
}
