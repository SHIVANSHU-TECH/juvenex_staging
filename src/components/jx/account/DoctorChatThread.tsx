'use client'

/**
 * Per-order doctor chat — Juvenex portal patient-message / send-patient-message.
 */
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { juvenexPortalApi, type PortalApiResponse } from '@/lib/api/juvenex-portal'
import { SpinnerIcon } from '@/components/jx/icons'
import {
  asArray,
  asRecord,
  formatDate,
  friendlyError,
  hasSession,
  requireSuccess,
  text,
  type JsonRecord,
} from './portal-utils'
import s from './portal.module.css'

function extractMessages(response: PortalApiResponse) {
  const root = asRecord(response.data)
  const nested = asRecord(root.data)
  return asArray(
    Array.isArray(root.data)
      ? root.data
      : Array.isArray(nested.data)
        ? nested.data
        : response.messages
  )
}

export function DoctorChatThread({ orderId }: { orderId: string }) {
  const [messages, setMessages] = useState<JsonRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [textValue, setTextValue] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    if (!hasSession()) {
      setError('Please sign in to talk to your doctor.')
      setLoading(false)
      return
    }
    try {
      const response = await juvenexPortalApi.patientMessages(orderId)
      if (response.status !== 0) setMessages(extractMessages(response))
    } catch (cause) {
      setError(friendlyError(cause))
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void load()
  }, [load])

  async function refresh() {
    const response = await juvenexPortalApi.patientMessages(orderId)
    if (response.status !== 0) setMessages(extractMessages(response))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!textValue.trim() && !file) {
      setSendError('Write a message or attach a file.')
      return
    }
    if (file && file.size > 10 * 1024 * 1024) {
      setSendError('Please choose a file smaller than 10 MB.')
      return
    }
    setBusy(true)
    setSendError('')
    try {
      requireSuccess(
        await juvenexPortalApi.sendPatientMessage({
          order_id: orderId,
          text: textValue.trim() || undefined,
          file: file || undefined,
        }),
        'Message could not be sent.'
      )
      setTextValue('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await refresh()
    } catch (cause) {
      setSendError(friendlyError(cause))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className={s.skeleton} style={{ height: 280 }} aria-busy="true" />
  }

  if (error) {
    return (
      <section className={`jx-card ${s.state}`}>
        <div className={s.stateInner}>
          <h2 className="jx-display">Chat unavailable</h2>
          <p>{error}</p>
          <div className={s.actions} style={{ justifyContent: 'center' }}>
            <button className="jx-btn jx-btn-primary" onClick={() => void load()}>
              Try again
            </button>
            {/sign in/i.test(error) ? (
              <Link
                className="jx-btn jx-btn-ghost"
                href={`/login?next=${encodeURIComponent(`/store/account/doctor/${orderId}`)}`}
              >
                Sign in
              </Link>
            ) : (
              <Link className="jx-btn jx-btn-ghost" href="/store/account/doctor">
                Back
              </Link>
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={`jx-card ${s.panel}`} aria-labelledby="doctor-chat-title">
      <div className={s.sectionHead}>
        <div>
          <h2 id="doctor-chat-title">Talk to Doctor</h2>
          <p>Secure messages for order #{orderId}</p>
        </div>
        <Link href="/store/account/doctor" className="jx-btn jx-btn-ghost" style={{ fontSize: 13 }}>
          ← All chats
        </Link>
      </div>

      <div className={s.messages} aria-live="polite">
        {messages.length ? (
          messages.map((message, index) => {
            const body = text(message.text ?? message.body ?? message.message, '')
            const own = String(message.channel ?? message.sender_type ?? '')
              .toLowerCase()
              .includes('patient')
            return (
              <div className={s.bubble} data-own={own} key={text(message.id, String(index))}>
                {body || 'Attachment'}
                <time>{formatDate(message.created_at ?? message.createdAt ?? message.time, true)}</time>
              </div>
            )
          })
        ) : (
          <p style={{ color: 'var(--jx-muted)', fontSize: 14 }}>
            No messages yet. Your doctor will reply here — start the conversation below.
          </p>
        )}
      </div>

      <form onSubmit={submit} style={{ marginTop: 18 }}>
        <div className={s.field}>
          <label htmlFor="doctor-message">Your message</label>
          <textarea
            id="doctor-message"
            className="jx-input"
            maxLength={10000}
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            placeholder="Ask your doctor a question…"
          />
        </div>
        <div className={s.file}>
          <label htmlFor="doctor-file" style={{ fontWeight: 600 }}>
            Optional image or PDF
          </label>
          <input
            ref={fileRef}
            id="doctor-file"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            style={{ display: 'block', marginTop: 7, maxWidth: '100%' }}
          />
          {file ? <span>Selected: {file.name}</span> : null}
        </div>
        {sendError ? (
          <div className={s.error} role="alert" style={{ marginTop: 12 }}>
            {sendError}
          </div>
        ) : null}
        <div className={s.actions}>
          <button className="jx-btn jx-btn-primary" disabled={busy}>
            {busy ? (
              <>
                <SpinnerIcon /> Sending…
              </>
            ) : (
              'Send to doctor'
            )}
          </button>
          <Link
            className="jx-btn jx-btn-ghost"
            href={`/store/account/orders/${encodeURIComponent(orderId)}`}
          >
            View order
          </Link>
        </div>
      </form>
    </section>
  )
}
