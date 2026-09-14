import Section from './Section'
import type { AdminOrderDetail } from './types'

export default function PaymentSection({
  order,
}: {
  order: AdminOrderDetail
}) {
  return (
    <Section title="Payment">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[#6B7568]">Provider</dt>
          <dd className="text-[#2D352C] capitalize">
            {order.payment_provider ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[#6B7568]">Status</dt>
          <dd className="text-[#2D352C] capitalize">
            {order.payment_status ?? '—'}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-[#6B7568]">Reference</dt>
          <dd className="text-[#2D352C] font-mono break-all">
            {order.payment_reference ?? '—'}
          </dd>
        </div>
      </dl>
    </Section>
  )
}
