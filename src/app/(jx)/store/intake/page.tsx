'use client'

/**
 * Clinical intake viewer — HappyLabs FormModal pattern.
 *
 * 1) Resolve form_url from pending-forms (order_id).
 * 2) Append order/email prefill params (same as HappyLabs).
 * 3) Embed the WLMD/Jotform URL directly in an iframe (no HTML proxy —
 *    proxying broke JotForm JS and left Submit stuck on "Please wait").
 * 4) Keep Juvenex chrome hidden; address bar stays on /store/intake.
 */
import { Suspense, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { fetchPendingForms, hasIntakeCta, intakeFormUrl, INTAKE_ENABLED } from '@/lib/jx/intake'

/** Match HappyLabs FormModal URL construction. */
function buildFormUrl(
  formUrl: string,
  opts: {
    orderId: string
    email?: string
    firstName?: string
    lastName?: string
    phone?: string
  }
): string {
  const isPrefillUrl =
    formUrl.includes('?') &&
    (formUrl.includes('jotform.com') || formUrl.includes('forms.whitelabelmd.com'))

  if (isPrefillUrl) return formUrl

  const params = new URLSearchParams()
  params.set('order_id', opts.orderId)
  if (opts.email) params.set('email', opts.email)
  if (opts.firstName) params.set('fullName[0]', opts.firstName)
  if (opts.lastName) params.set('fullName[1]', opts.lastName)
  if (opts.phone) params.set('phoneNumber', opts.phone)

  const join = formUrl.includes('?') ? '&' : '?'
  return `${formUrl}${join}${params.toString()}`
}

function IntakeEmbedInner() {
  const params = useSearchParams()
  const orderId = (params.get('order_id') || '').trim()
  const { user } = useAuth()

  const [rawFormUrl, setRawFormUrl] = useState<string | null>(null)
  const [productName, setProductName] = useState('')
  const [title, setTitle] = useState('Complete intake')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!orderId) {
      setError('Missing order. Go back to your orders and try again.')
      setLoading(false)
      return
    }
    if (!INTAKE_ENABLED) {
      setError('Clinical intake is not available right now.')
      setLoading(false)
      return
    }

    let active = true
    void fetchPendingForms(orderId).then((forms) => {
      if (!active) return
      const form =
        forms.find((f) => f.order_id === orderId && hasIntakeCta(f)) ??
        forms.find((f) => hasIntakeCta(f))
      const url = form ? intakeFormUrl(form) : null
      if (!url) {
        setError(
          form?.action === 'pending'
            ? 'Your intake form is still being prepared. Check back shortly.'
            : 'No intake form is available for this order right now.'
        )
        setLoading(false)
        return
      }
      setTitle(form?.action === 'check_in' ? 'Complete check-in' : 'Complete intake')
      setProductName(form?.product_name || '')
      setRawFormUrl(url)
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [orderId])

  const iframeSrc = useMemo(() => {
    if (!rawFormUrl || !orderId) return null
    const [first, ...rest] = (user?.name || '').trim().split(/\s+/).filter(Boolean)
    // Direct embed like HappyLabs FormModal — do not route through form-embed proxy.
    return buildFormUrl(rawFormUrl, {
      orderId,
      email: user?.email,
      firstName: first,
      lastName: rest.join(' '),
      phone: user?.phone,
    })
  }, [rawFormUrl, orderId, user?.email, user?.name, user?.phone])

  const backHref = orderId
    ? `/store/account/orders/${encodeURIComponent(orderId)}`
    : '/store/account/orders'

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  if (loading) {
    return (
      <div className="jx-shell" style={{ paddingBlock: 48 }}>
        <div className="jx-skeleton" style={{ height: 320, borderRadius: 'var(--jx-r-md)' }} />
      </div>
    )
  }

  if (error || !iframeSrc) {
    return (
      <div className="jx-shell" style={{ paddingBlock: 48, maxWidth: 480, marginInline: 'auto', textAlign: 'center' }}>
        <h1 className="jx-display" style={{ fontSize: 24, marginBottom: 12 }}>
          Intake unavailable
        </h1>
        <p style={{ color: 'var(--jx-muted)', marginBottom: 20 }}>{error || 'Form could not be loaded.'}</p>
        <Link href={backHref} className="jx-btn jx-btn-primary">
          Back to order
        </Link>
      </div>
    )
  }

  // HappyLabs FormModal layout — portaled to document.body so it escapes
  // the store layout stacking context and sits above any fixed chrome.
  const overlay = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="intake-modal-title"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 1100,
          height: 'min(92vh, 920px)',
          background: '#fff',
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid #eee',
            flexShrink: 0,
            background: '#fff',
          }}
        >
          <div>
            <h1 id="intake-modal-title" className="jx-display" style={{ fontSize: 18, margin: 0 }}>
              {productName || title}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--jx-muted)' }}>
              Order #{orderId} · Health assessment form
            </p>
          </div>
          <Link href={backHref} className="jx-btn jx-btn-ghost">
            Done
          </Link>
        </header>

        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <iframe
            title={title}
            src={iframeSrc}
            style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}
            // Same sandbox as HappyLabs FormModal (required for JotForm Submit / next step).
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation"
            allow="camera; microphone; geolocation; fullscreen"
            loading="lazy"
          />
        </div>

        <footer
          style={{
            padding: '10px 20px',
            borderTop: '1px solid #eee',
            background: '#f7f7f7',
            fontSize: 13,
            color: 'var(--jx-muted)',
            flexShrink: 0,
          }}
        >
          Your information is secure and confidential
        </footer>
      </div>
    </div>
  )

  if (!mounted) return null
  return createPortal(overlay, document.body)
}

export default function StoreIntakePage() {
  return (
    <Suspense
      fallback={
        <div className="jx-shell" style={{ paddingBlock: 48 }}>
          <div className="jx-skeleton" style={{ height: 320, borderRadius: 'var(--jx-r-md)' }} />
        </div>
      }
    >
      <IntakeEmbedInner />
    </Suspense>
  )
}
