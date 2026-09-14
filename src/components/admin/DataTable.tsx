import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  loading?: boolean
  emptyMessage?: ReactNode
  onRowClick?: (row: T) => void
  /** Optional row classes; called per row to allow expanded-row highlights. */
  rowClassName?: (row: T) => string
}

const ALIGN_CLASS: Record<NonNullable<Column<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

/**
 * Lightweight, generic table primitive used by admin surfaces.
 * Renders a thead/tbody pair with hover, row click, skeleton loading,
 * and an empty state. Layout/styling decisions kept minimal so each
 * tab can compose richer cells via the `render` callback.
 */
export default function DataTable<T>({
  data,
  columns,
  rowKey,
  loading,
  emptyMessage = 'No results',
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-white border-b border-[#E5EAE3]">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  className={`px-4 py-3 text-[11px] font-semibold text-[#6B7568] uppercase tracking-wider ${ALIGN_CLASS[c.align ?? 'left']}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody aria-busy="true" aria-label="Loading">
            {[0, 1, 2, 3, 4].map((i) => (
              <tr key={i} className="border-b border-[#E5EAE3]">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-4">
                    <div className="h-3 rounded bg-[#E5EAE3]/60 animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (data.length === 0) {
    return <div className="px-6 py-16 text-center text-sm text-[#6B7568]">{emptyMessage}</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-white border-b border-[#E5EAE3]">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={`px-4 py-3 text-[11px] font-semibold text-[#6B7568] uppercase tracking-wider ${ALIGN_CLASS[c.align ?? 'left']}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const extra = rowClassName?.(row) ?? ''
            const interactive = Boolean(onRowClick)
            // When the row is interactive we expose it as a button-style row
            // so keyboard users get the same affordance mouse users get from
            // the cursor-pointer hint. We add tabIndex/role/onKeyDown so
            // Enter and Space activate the row click handler.
            const handleKeyDown = interactive
              ? (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onRowClick?.(row)
                  }
                }
              : undefined
            return (
              <tr
                key={rowKey(row)}
                onClick={interactive ? () => onRowClick?.(row) : undefined}
                onKeyDown={handleKeyDown}
                tabIndex={interactive ? 0 : undefined}
                role={interactive ? 'button' : undefined}
                className={`border-b border-[#E5EAE3] transition-colors ${
                  interactive
                    ? 'cursor-pointer hover:bg-[#F5F8F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-inset'
                    : ''
                } ${extra}`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-3 text-sm text-[#2D352C] ${ALIGN_CLASS[c.align ?? 'left']}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
