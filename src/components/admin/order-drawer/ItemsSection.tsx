import { formatMoney } from '@/lib/format'
import Section from './Section'
import { asArray, itemDisplay } from './helpers'

interface ItemsSectionProps {
  items: unknown
  currency: string
}

export default function ItemsSection({ items, currency }: ItemsSectionProps) {
  const rows = asArray(items)
  return (
    <Section title="Items">
      {rows.length === 0 ? (
        <p className="text-sm text-[#6B7568]">No items recorded.</p>
      ) : (
        <ul className="divide-y divide-[#E5EAE3]">
          {rows.map((raw, idx) => {
            const it = itemDisplay(raw)
            return (
              <li
                key={idx}
                className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm text-[#2D352C] truncate">{it.name}</p>
                  <p className="text-xs text-[#6B7568]">Qty {it.qty}</p>
                </div>
                <p className="text-sm tabular-nums text-[#2D352C]">
                  {formatMoney(it.priceCents * it.qty, currency)}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
