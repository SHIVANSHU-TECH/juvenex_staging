'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ConfirmDialog from '../ConfirmDialog'
import DrawerHeader from './DrawerHeader'
import SummarySection from './SummarySection'
import CustomerSection from './CustomerSection'
import ItemsSection from './ItemsSection'
import IntakeSection from './IntakeSection'
import PaymentSection from './PaymentSection'
import FulfillmentSection from './FulfillmentSection'
import NotesSection from './NotesSection'
import Toast from './Toast'
import type {
  AdminOrderDetail,
  DetailResponse,
  OrderDetailDrawerProps,
  PatchResponse,
  ToastState,
} from './types'

// Re-export types for callers that still import them from the drawer module.
export type { AdminOrderDetail, OrderDetailDrawerProps } from './types'

// ---------------------------------------------------------------------------
// Confirm dialog state — destructive / terminal actions surface a confirm
// before the PATCH fires (FIX 3). We model these as a discriminated union so
// only one prompt can be live at a time.
// ---------------------------------------------------------------------------

type ConfirmAction =
  | { kind: 'mark_fulfilled' }
  | { kind: 'mark_failed' }
  | null

const isProd =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'production'

function logDev(...args: unknown[]) {
  // FIX 6 — keep server-side dev signal, but stay quiet in production.
  if (isProd) return
  // eslint-disable-next-line no-console
  console.error(...args)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrderDetailDrawer({
  orderId,
  onClose,
  onMutated,
}: OrderDetailDrawerProps) {
  const [order, setOrder] = useState<AdminOrderDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  // Local form state — reset whenever a new order loads so admins can edit
  // drafts without a page refresh.
  const [refInput, setRefInput] = useState('')
  const [notesInput, setNotesInput] = useState('')

  // Refs for focus management.
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const isOpen = orderId !== null

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchOrder = useCallback(async (id: string) => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/orders/${id}`)
      const json = (await res.json()) as DetailResponse
      if (!res.ok || !json.success || !json.data) {
        setLoadError(json.error ?? 'Failed to load order')
        setOrder(null)
        return
      }
      setOrder(json.data)
      setRefInput(json.data.prescriberx_reference ?? '')
      setNotesInput(json.data.admin_notes ?? '')
    } catch (err) {
      logDev('OrderDetailDrawer fetch failed', err)
      setLoadError('Network error')
      setOrder(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!orderId) {
      setOrder(null)
      setLoadError(null)
      return
    }
    fetchOrder(orderId)
  }, [orderId, fetchOrder])

  // -------------------------------------------------------------------------
  // Auto-dismiss toast
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // -------------------------------------------------------------------------
  // FIX 1 — focus trap + restore focus + scroll lock
  // -------------------------------------------------------------------------

  // Capture previously-focused element + lock body scroll on open. Restore
  // both on close. Done via a ref-based effect so we don't tear down focus
  // when re-rendering for unrelated reasons (e.g. toast tick).
  useEffect(() => {
    if (!isOpen) return
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus the close button on the next paint so the panel has rendered.
    const raf = requestAnimationFrame(() => {
      closeButtonRef.current?.focus()
    })

    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = previousOverflow
      // Use optional chaining + try/catch in case the previously-focused
      // node was removed from the DOM while the drawer was open.
      try {
        previouslyFocusedRef.current?.focus()
      } catch {
        // ignore
      }
      previouslyFocusedRef.current = null
    }
  }, [isOpen])

  // Esc closes the drawer. When a confirm dialog is layered above us it
  // owns Escape — bail out to avoid double-close.
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (confirmAction) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose, confirmAction])

  // Manual focus trap — cycle Tab / Shift+Tab among focusable descendants of
  // the panel so keyboard users cannot tab into the page behind the drawer.
  // Suspend trapping while a confirm dialog is on top (it owns its own trap).
  useEffect(() => {
    if (!isOpen) return
    const handleTab = (e: KeyboardEvent) => {
      if (confirmAction) return
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      )
      const enabled = Array.from(focusables).filter(
        (el) => !el.hasAttribute('disabled')
      )
      if (enabled.length === 0) return
      const first = enabled[0]
      const last = enabled[enabled.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleTab)
    return () => window.removeEventListener('keydown', handleTab)
  }, [isOpen, confirmAction])

  // -------------------------------------------------------------------------
  // PATCH helper
  // -------------------------------------------------------------------------

  const patch = useCallback(
    async (
      label: string,
      body: Record<string, unknown>
    ): Promise<AdminOrderDetail | null> => {
      if (!orderId) return null
      setBusy(label)
      try {
        const res = await fetch(`/api/admin/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = (await res.json()) as PatchResponse
        if (!res.ok || !json.success || !json.data) {
          setToast({
            kind: 'error',
            message: json.error ?? 'Update failed',
          })
          return null
        }
        setOrder(json.data)
        setRefInput(json.data.prescriberx_reference ?? '')
        setNotesInput(json.data.admin_notes ?? '')
        setToast({ kind: 'success', message: `${label} saved` })
        onMutated?.(json.data)
        return json.data
      } catch (err) {
        logDev('OrderDetailDrawer patch failed', err)
        setToast({ kind: 'error', message: 'Network error' })
        return null
      } finally {
        setBusy(null)
      }
    },
    [orderId, onMutated]
  )

  // -------------------------------------------------------------------------
  // Action handlers
  // -------------------------------------------------------------------------

  const handleMarkSent = useCallback(() => {
    // Mark Sent flips PrescribeRx status to 'sent'. The patient/encounter
    // reference is captured AFTER PrescribeRx returns it (next state).
    void patch('Mark Sent', { mark_sent: true })
  }, [patch])

  const handleMarkConfirmed = useCallback(() => {
    // No confirm dialog here — Mark Confirmed is reversible (admin can flip
    // back to failed if PrescribeRx ends up rejecting). Validate the
    // reference inline and fire the PATCH directly.
    const reference = refInput.trim()
    if (!reference) {
      setToast({
        kind: 'error',
        message:
          'Enter the PrescribeRx patient/encounter reference before confirming.',
      })
      return
    }
    void patch('Mark Confirmed', {
      prescriberx_status: 'confirmed',
      prescriberx_reference: reference,
    })
  }, [patch, refInput])

  const requestMarkFulfilled = useCallback(() => {
    setConfirmAction({ kind: 'mark_fulfilled' })
  }, [])

  const requestMarkFailed = useCallback(() => {
    setConfirmAction({ kind: 'mark_failed' })
  }, [])

  const handleRetryMarkSent = useCallback(() => {
    void patch('Mark Sent', { mark_sent: true })
  }, [patch])

  const handleConfirm = useCallback(() => {
    if (!confirmAction) return
    const action = confirmAction
    setConfirmAction(null)
    if (action.kind === 'mark_fulfilled') {
      void patch('Mark Fulfilled', { mark_fulfilled: true })
    } else if (action.kind === 'mark_failed') {
      void patch('Mark Failed', { prescriberx_status: 'failed' })
    }
  }, [confirmAction, patch])

  const handleCancelConfirm = useCallback(() => {
    setConfirmAction(null)
  }, [])

  if (!orderId) return null

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const confirmCopy = (() => {
    if (!confirmAction) {
      return {
        open: false,
        title: '',
        message: '',
        confirmLabel: 'Confirm',
        variant: 'default' as const,
      }
    }
    if (confirmAction.kind === 'mark_fulfilled') {
      return {
        open: true,
        title: 'Mark order as fulfilled?',
        message:
          'Confirm this order has been fulfilled. Status will be terminal — the order will move out of the active fulfillment queue.',
        confirmLabel: 'Mark Fulfilled',
        variant: 'destructive' as const,
      }
    }
    return {
      open: true,
      title: 'Mark order as failed?',
      message:
        'This will move the order into the Failed bucket so you can retry once the issue is resolved on PrescribeRx. The patient is not notified automatically — follow up out-of-band.',
      confirmLabel: 'Mark Failed',
      variant: 'destructive' as const,
    }
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Order details"
    >
      {/* Backdrop — non-focusable div per FIX 1. Click still closes. */}
      <div
        onClick={onClose}
        className="flex-1 bg-[#2D352C]/40 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />
      {/* Panel */}
      <section
        ref={panelRef}
        className="w-full max-w-xl h-full bg-white border-l border-[#E5EAE3] shadow-xl flex flex-col"
      >
        <DrawerHeader
          ref={closeButtonRef}
          order={order}
          isLoading={isLoading}
          onClose={onClose}
        />

        <div className="flex-1 overflow-y-auto">
          {loadError ? (
            <div className="p-6 text-sm text-red-600" role="alert">
              {loadError}
            </div>
          ) : isLoading || !order ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-xl bg-[#F5F8F3] animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="px-5 py-5 space-y-6">
              <SummarySection order={order} />
              <CustomerSection order={order} />
              <ItemsSection items={order.items} currency={order.currency} />
              <IntakeSection order={order} />
              <PaymentSection order={order} />
              <FulfillmentSection
                order={order}
                refInput={refInput}
                onRefChange={setRefInput}
                busy={busy}
                onMarkSent={handleMarkSent}
                onMarkConfirmed={handleMarkConfirmed}
                onMarkFulfilled={requestMarkFulfilled}
                onMarkFailed={requestMarkFailed}
                onRetryMarkSent={handleRetryMarkSent}
              />
              <NotesSection
                value={notesInput}
                onChange={setNotesInput}
                busy={busy}
                onSave={() => patch('Notes', { admin_notes: notesInput })}
              />
            </div>
          )}
        </div>

        {toast && <Toast kind={toast.kind} message={toast.message} />}
      </section>

      <ConfirmDialog
        open={confirmCopy.open}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.confirmLabel}
        confirmVariant={confirmCopy.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
      />
    </div>
  )
}
