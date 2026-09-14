'use client'

import {
  formatAbsoluteDate,
  timelineStepIndex,
  type OrderDetail,
} from './types'

interface OrderTimelineProps {
  order: OrderDetail
}

interface TimelineStep {
  label: string
  timestamp: string | null
}

export default function OrderTimeline({ order }: OrderTimelineProps) {
  const currentIndex = timelineStepIndex(
    order.status,
    order.prescriberx_status
  )

  const steps: TimelineStep[] = [
    {
      label: 'Pending',
      timestamp: order.created_at,
    },
    {
      label: 'Paid',
      // Best signal we have: payment_status flips to 'succeeded' once paid;
      // the order itself doesn't carry a separate paid_at column.
      timestamp:
        order.payment_status === 'succeeded' || currentIndex >= 1
          ? null
          : null,
    },
    {
      label: 'Sent to PrescribeRx',
      timestamp: order.prescriberx_sent_at,
    },
    {
      label: 'Fulfilled',
      timestamp: order.fulfilled_at,
    },
  ]

  // Cancelled / refunded surfaces don't fit the linear timeline. Render a
  // simple banner instead — the badge in the header covers the headline.
  if (order.status === 'cancelled' || order.status === 'refunded') {
    return (
      <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-5">
        <h2 className="text-sm font-semibold text-[#2D352C]">Status</h2>
        <p className="mt-2 text-sm text-[#6B7567]">
          {order.status === 'cancelled'
            ? 'This order was cancelled. If this was unexpected, contact support.'
            : 'This order was refunded.'}
        </p>
      </div>
    )
  }

  return (
    <section
      className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-5"
      aria-labelledby="order-timeline-heading"
    >
      <h2
        id="order-timeline-heading"
        className="text-sm font-semibold text-[#2D352C] mb-4"
      >
        Status
      </h2>
      <ol className="space-y-4" role="list">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex
          const isCurrent = index === currentIndex
          const isUpcoming = index > currentIndex

          let dotClass = 'bg-[#EEF1ED] border-[#D9DFD3]'
          let labelClass = 'text-[#6B7567]'
          if (isCompleted) {
            dotClass = 'bg-emerald-500 border-emerald-500'
            labelClass = 'text-[#2D352C] font-semibold'
          } else if (isCurrent) {
            dotClass = 'bg-[var(--accent-strong)] border-[var(--accent-strong)]'
            labelClass = 'text-[#2D352C] font-semibold'
          }

          return (
            <li key={step.label} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={`w-3 h-3 rounded-full border-2 ${dotClass}`}
                />
                {index < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`w-px flex-1 mt-1 ${
                      isCompleted ? 'bg-emerald-300' : 'bg-[#E5EAE3]'
                    }`}
                    style={{ minHeight: '1.25rem' }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0 pb-2">
                <p className={`text-sm ${labelClass}`}>{step.label}</p>
                {step.timestamp && (
                  <p className="text-xs text-[#6B7567] mt-0.5">
                    {formatAbsoluteDate(step.timestamp)}
                  </p>
                )}
                {isCurrent && !step.timestamp && (
                  <p className="text-xs text-[var(--accent-strong)] mt-0.5 font-medium">
                    In progress
                  </p>
                )}
                {isUpcoming && (
                  <p className="text-xs text-[#8B9B83] mt-0.5">Upcoming</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
