import { formatMoney } from '@/lib/format'
import Section from './Section'
import StatusBadge from './StatusBadge'
import { prescriberXVariant, statusVariant } from './helpers'
import type { AdminOrderDetail } from './types'

export default function SummarySection({ order }: { order: AdminOrderDetail }) {
  const prx = order.prescriberx_status ?? 'not_sent'
  return (
    <Section title="Summary">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[#6B7568]">Created</dt>
          <dd className="text-[#2D352C]">
            {new Date(order.created_at).toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[#6B7568]">Total</dt>
          <dd className="text-[#2D352C] font-semibold tabular-nums">
            {formatMoney(order.total_cents, order.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[#6B7568]">Status</dt>
          <dd>
            <StatusBadge
              status={order.status}
              variant={statusVariant(order.status)}
            />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[#6B7568]">PrescribeRx</dt>
          <dd>
            <StatusBadge status={prx} variant={prescriberXVariant(prx)} />
          </dd>
        </div>
      </dl>
    </Section>
  )
}
