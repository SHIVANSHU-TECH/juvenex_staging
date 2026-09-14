'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'default' | 'destructive'
  onConfirm: () => void
  onCancel: () => void
}

const VARIANT_CLASS: Record<NonNullable<ConfirmDialogProps['confirmVariant']>, string> = {
  default:
    'bg-[var(--accent-strong)] text-white hover:bg-[#4F6A44] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/40',
  destructive:
    'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-2 focus-visible:ring-red-400',
}

/**
 * Headless confirm modal. Replaces native window.confirm in admin actions
 * so destructive operations (ban user, delete) get a deliberate UI gesture
 * with proper focus management and Esc-to-cancel.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    // For destructive actions, default focus to Cancel so an accidental
    // Enter press does not trigger an irreversible operation. WCAG 3.3.4
    // (Error Prevention) — keep destructive defaults safe.
    if (confirmVariant === 'destructive') {
      cancelRef.current?.focus()
    } else {
      confirmRef.current?.focus()
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      previouslyFocusedRef.current?.focus?.()
    }
  }, [open, onCancel, confirmVariant])

  // Full focus trap: cycle Tab / Shift+Tab among focusable elements inside
  // the dialog so keyboard users cannot tab out of a modal confirmation.
  // Mirrors the AddOrgModal pattern.
  useEffect(() => {
    if (!open) return
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleTab)
    return () => window.removeEventListener('keydown', handleTab)
  }, [open])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div
        className="absolute inset-0 bg-[#2D352C]/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-[#E5EAE3] p-6"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-[#2D352C]"
        >
          {title}
        </h2>
        <div className="mt-2 text-sm text-[#6B7568]">{message}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-[#E5EAE3] text-[#2D352C] hover:bg-[#F5F8F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/30"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium focus-visible:outline-none ${VARIANT_CLASS[confirmVariant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
