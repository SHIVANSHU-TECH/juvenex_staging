// Loading skeletons and empty-state filler for the product overrides table.

'use client';

import { ROW_GRID_COLS } from './_helpers';

interface SkeletonRowsProps {
  count: number;
}

export function SkeletonRows({ count }: SkeletonRowsProps) {
  // Render fixed-height rows so the loading state matches post-load layout.
  return (
    <div role="status" aria-label="Loading products" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          role="row"
          className={`grid ${ROW_GRID_COLS} items-center gap-2 px-3 py-3 border-b border-[#E5EAE3] animate-pulse`}
          aria-hidden="true"
        >
          <div className="h-4 w-4 bg-[#EFF2EC] rounded" />
          <div className="h-10 w-10 bg-[#EFF2EC] rounded-lg" />
          <div className="space-y-1.5">
            <div className="h-3 bg-[#EFF2EC] rounded w-3/4" />
            <div className="h-2 bg-[#EFF2EC] rounded w-1/3" />
          </div>
          <div className="h-4 bg-[#EFF2EC] rounded w-2/3" />
          <div className="h-4 bg-[#EFF2EC] rounded w-12" />
          <div className="h-5 w-10 bg-[#EFF2EC] rounded-full justify-self-center" />
          <div className="h-7 bg-[#EFF2EC] rounded" />
          <div className="h-3 bg-[#EFF2EC] rounded w-12" />
        </div>
      ))}
      <span className="sr-only">Loading product catalog</span>
    </div>
  );
}

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="px-6 py-16 text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="w-10 h-10 mx-auto text-[#8B9B83]"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0l-4-4m4 4l-4 4M4 13l4-4m-4 4l4 4"
        />
      </svg>
      <p className="mt-3 text-sm text-[#6B7567]">{message}</p>
    </div>
  );
}
