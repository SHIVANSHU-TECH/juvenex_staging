'use client';

import type { ReactNode } from 'react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  /** Optional illustration / icon shown above the title. */
  icon?: ReactNode;
  /** Large title — describes the empty condition. */
  title: string;
  /** Supporting copy explaining what to do next. */
  description?: string;
  /** Optional primary call-to-action. */
  action?: EmptyStateAction;
  /** Tailwind class additions for the outer container. */
  className?: string;
}

const DEFAULT_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    aria-hidden="true"
    className="w-12 h-12 text-[var(--accent)]"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
    />
  </svg>
);

/**
 * Reusable empty-state primitive for admin tabs. Centered card layout with
 * an optional illustration, title, description, and primary CTA.
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`bg-[#FAF9F6]/80 border border-dashed border-[#E5EAE3] rounded-3xl p-10 text-center flex flex-col items-center gap-4 ${className}`}
      role="status"
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#E5EAE3]/40">
        {icon ?? DEFAULT_ICON}
      </div>
      <div className="space-y-1 max-w-md">
        <h3 className="text-lg font-semibold text-[#2D352C]">{title}</h3>
        {description && (
          <p className="text-sm text-[#2D352C]/60 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent)] transition-colors shadow-sm"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
            className="w-4 h-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {action.label}
        </button>
      )}
    </div>
  );
}
