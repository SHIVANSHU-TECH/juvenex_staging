// Top-of-table error banner and bottom-right toast.
// Shared visual primitives for the product overrides admin UI.

'use client';

import { useEffect } from 'react';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

/**
 * Persistent banner shown when initial data load fails. The CTA wires
 * the parent's retry handler so the user can recover without a full
 * page refresh.
 */
export function ErrorBanner({ message, onRetry, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start justify-between gap-3"
    >
      <div className="flex items-start gap-2 text-sm text-red-800 min-w-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="w-5 h-5 flex-shrink-0 mt-0.5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z"
          />
        </svg>
        <span className="break-words">{message}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1 rounded-lg text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-100"
          >
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error"
            className="p-1 rounded text-red-600 hover:bg-red-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

interface ToastProps {
  message: string;
  tone: 'success' | 'error';
  onDismiss: () => void;
}

const TOAST_AUTO_DISMISS_MS = 4000;

/**
 * Auto-dismissing toast. We use role="status" for success and role="alert"
 * for error so screen readers announce errors with appropriate urgency.
 */
export function Toast({ message, tone, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss, message]);

  const isError = tone === 'error';
  const palette = isError
    ? 'bg-red-600 text-white'
    : 'bg-[var(--accent-strong)] text-white';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className="fixed bottom-6 right-6 z-50 max-w-sm"
    >
      <div
        className={`${palette} px-4 py-3 rounded-xl shadow-lg flex items-start gap-2 text-sm`}
      >
        <span className="flex-1 break-words">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="opacity-80 hover:opacity-100 flex-shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Re-exported for the barrel; banners namespace allows future grouping.
export const Banners = { ErrorBanner, Toast } as const;
