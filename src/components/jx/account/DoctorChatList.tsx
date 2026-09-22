'use client'

/**
 * Talk to My Doctor — hub listing Juvenex orders (same APIs as My Orders).
 * Tap an order to open the secure doctor chat for that order_id.
 */
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { juvenexPortalApi } from '@/lib/api/juvenex-portal'
import { SpinnerIcon } from '@/components/jx/icons'
import {
  asArray,
  formatDate,
  friendlyError,
  hasSession,
  requireSuccess,
  statusTone,
  text,
  type JsonRecord,
} from './portal-utils'
import s from './portal.module.css'

export function DoctorChatList() {
  const [orders, setOrders] = useState<JsonRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    if (!hasSession()) {
      setError('Please sign in to talk to your doctor.')
      setLoading(false)
      return
    }
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
    } catch (cause) {
      setError(friendlyError(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className={s.grid} aria-label="Loading orders" aria-busy="true">
        {[1, 2, 3].map((i) => (
          <div className={s.skeleton} key={i} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <AccountState
        title="We couldn't load your orders"
        message={error}
        action={
          <>
            <button className="jx-btn jx-btn-primary" onClick={() => void load()}>
              Try again
            </button>
            {/sign in/i.test(error) ? (
              <Link
                className="jx-btn jx-btn-ghost"
                href="/login?next=/store/account/doctor"
              >
                Sign in
              </Link>
            ) : null}
          </>
        }
      />
    )
  }

  if (!orders.length) {
    return (
      <AccountState
        title="No orders yet"
        message="Place a treatment order first, then you can message your doctor about that order here."
        action={
          <Link className="jx-btn jx-btn-primary" href="/store">
            Browse treatments
          </Link>
        }
      />
    )
  }

  return (
    <div className={s.grid} aria-live="polite">
      {orders.map((order, index) => {
        const id = text(order.order_id, '')
        const status = text(order.order_status_meaning, 'Processing')
        return (
          <div className={`jx-card ${s.orderCard}`} key={id || index}>
            <Link
              className={s.order}
              href={`/store/account/doctor/${encodeURIComponent(id)}`}
            >
              <div>
                <div className={s.orderId}>Order #{id || 'Unknown'}</div>
                <div className={s.meta}>Placed {formatDate(order.time)}</div>
              </div>
              <span className={s.status} data-tone={statusTone(status)}>
                {status.replaceAll('_', ' ')}
              </span>
              <div>
                <div className={s.amount} style={{ fontSize: 14, fontWeight: 600 }}>
                  Talk to Doctor
                </div>
                <div className={s.meta}>Open secure chat</div>
              </div>
              <span className={s.arrow} aria-hidden="true">
                →
              </span>
            </Link>
          </div>
        )
      })}
    </div>
  )
}

function AccountState({
  title,
  message,
  action,
}: {
  title: string
  message: string
  action: React.ReactNode
}) {
  return (
    <section className={`jx-card ${s.state}`}>
      <div className={s.stateInner}>
        <SpinnerIcon size={28} style={{ animation: 'none', opacity: 0.45 }} />
        <h2 className="jx-display">{title}</h2>
        <p>{message}</p>
        <div className={s.actions} style={{ justifyContent: 'center' }}>
          {action}
        </div>
      </div>
    </section>
  )
}
