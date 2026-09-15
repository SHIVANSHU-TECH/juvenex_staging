'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { juvenexPortalApi } from '@/lib/api/juvenex-portal'
import { SpinnerIcon } from '@/components/jx/icons'
import { asArray, formatDate, friendlyError, hasSession, requireSuccess, statusTone, text, type JsonRecord } from './portal-utils'
import { fetchPendingForms, hasIntakeCta, INTAKE_ENABLED } from '@/lib/jx/intake'
import { saveIntakeReturnTo } from '@/lib/jx/pending-add'
import type { PendingForm } from '@/lib/juvenex/schemas'
import s from './portal.module.css'

export function OrdersList() {
  const [orders, setOrders] = useState<JsonRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [intake, setIntake] = useState<PendingForm[]>([])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    if (!hasSession()) { setError('Please sign in to view your Juvenex account.'); setLoading(false); return }
    try {
      let loaded: JsonRecord[] = []
      try {
        loaded = asArray(
          requireSuccess(await juvenexPortalApi.listLocalOrders(), 'Orders could not be loaded.').orders
        )
      } catch {
        loaded = []
      }
      if (!loaded.length) {
        loaded = asArray(
          requireSuccess(await juvenexPortalApi.listOrders(), 'Orders could not be loaded.').orders
        )
      }
      setOrders(loaded)
    } catch (cause) { setError(friendlyError(cause)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!INTAKE_ENABLED) return
    let active = true
    void fetchPendingForms().then((result) => {
      if (active) setIntake(result)
    })
    return () => { active = false }
  }, [])

  if (loading) return <div className={s.grid} aria-label="Loading orders" aria-busy="true">{[1,2,3].map((i) => <div className={s.skeleton} key={i} />)}</div>
  if (error) return <AccountState title="We couldn't load your orders" message={error} action={<><button className="jx-btn jx-btn-primary" onClick={() => void load()}>Try again</button>{/sign in/i.test(error) ? <Link className="jx-btn jx-btn-ghost" href="/login?next=/store/account/orders">Sign in</Link> : null}</>} />
  if (!orders.length) return <AccountState title="No orders yet" message="When you place a Juvenex order, its status, care timeline, and subscription details will appear here." action={<Link className="jx-btn jx-btn-primary" href="/store">Explore treatments</Link>} />

  const intakeFor = (id: string) => (id ? intake.find((form) => form.order_id === id) : undefined)

  return <div className={s.grid} aria-live="polite">{orders.map((order, index) => {
    const id = text(order.order_id, '')
    const status = text(order.order_status_meaning, 'Processing')
    return <div className={`jx-card ${s.orderCard}`} key={id || index}>
      <Link className={s.order} href={`/store/account/orders/${encodeURIComponent(id)}`}>
        <div><div className={s.orderId}>Order #{id || 'Unknown'}</div><div className={s.meta}>Placed {formatDate(order.time)}</div></div>
        <span className={s.status} data-tone={statusTone(status)}>{status.replaceAll('_', ' ')}</span>
        <div><div className={s.amount}>${Number(text(order.order_total, '0')).toFixed(2)}</div><div className={s.meta}>{text(order.order_type, 'One-time').replaceAll('_', ' ')}</div></div>
        <span className={s.arrow} aria-hidden="true">→</span>
      </Link>
      <IntakeRow form={intakeFor(id)} />
    </div>
  })}</div>
}

/**
 * Intake message + clear Complete intake button on the list (no need to open
 * order detail). Saves return path so intake Done goes back here.
 */
function IntakeRow({ form }: { form?: PendingForm }) {
  if (!form) return null

  if (hasIntakeCta(form)) {
    const href = `/store/intake?order_id=${encodeURIComponent(form.order_id)}`
    const label = form.action === 'check_in' ? 'Complete check-in' : 'Complete intake'
    return (
      <div className={s.intakeRow}>
        <span className={s.intakeNote} style={{ flex: '1 1 200px' }}>
          Your prescribing doctor needs this to review your order.
        </span>
        <Link
          className="jx-btn jx-btn-primary"
          href={href}
          style={{ fontSize: 13, padding: '8px 14px' }}
          onClick={() => saveIntakeReturnTo('/store/account/orders')}
        >
          {label}
        </Link>
      </div>
    )
  }

  if (form.action === 'pending') {
    return (
      <div className={s.intakeRow}>
        <span className={s.intakeBadge} data-tone="info">Being prepared</span>
        <span className={s.intakeNote}>Your intake form isn&rsquo;t ready yet. Check back shortly.</span>
      </div>
    )
  }

  return null
}

function AccountState({ title, message, action }: { title:string; message:string; action:React.ReactNode }) {
  return <section className={`jx-card ${s.state}`}><div className={s.stateInner}><SpinnerIcon size={28} style={{ animation:'none', opacity:.45 }} /><h2 className="jx-display">{title}</h2><p>{message}</p><div className={s.actions} style={{justifyContent:'center'}}>{action}</div></div></section>
}
