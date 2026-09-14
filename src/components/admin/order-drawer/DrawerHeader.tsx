import { forwardRef } from 'react'
import type { AdminOrderDetail } from './types'

interface DrawerHeaderProps {
  order: AdminOrderDetail | null
  isLoading: boolean
  onClose: () => void
}

const DrawerHeader = forwardRef<HTMLButtonElement, DrawerHeaderProps>(
  function DrawerHeader({ order, isLoading, onClose }, ref) {
    return (
      <header className="flex items-center justify-between gap-3 px-5 h-14 border-b border-[#E5EAE3] bg-white">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7568]">
            Order
          </p>
          <p className="text-sm font-mono text-[#2D352C] truncate">
            {isLoading ? 'Loading...' : (order?.id ?? '')}
          </p>
        </div>
        <button
          ref={ref}
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-[#E5EAE3] bg-white text-[#2D352C] hover:bg-[#F5F8F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/40"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </header>
    )
  }
)

export default DrawerHeader
