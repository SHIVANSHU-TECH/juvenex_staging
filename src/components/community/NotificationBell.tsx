'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { formatRelative } from '@/lib/format'
import { Avatar } from '@/components/community/PostCard'

interface NotificationActor {
  id: string
  name: string | null
  avatar_url: string | null
}

interface NotificationItem {
  id: string
  type: 'post_like' | 'post_comment' | 'comment_like' | string
  post_id: string | null
  comment_id: string | null
  read: boolean
  created_at: string
  actor: NotificationActor | null
}

function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function actionText(type: string): string {
  switch (type) {
    case 'post_like':
      return 'liked your post'
    case 'post_comment':
      return 'commented on your post'
    case 'comment_like':
      return 'liked your comment'
    default:
      return 'interacted with your content'
  }
}

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/social/notifications', { headers: authHeaders() })
      if (!res.ok) return
      const json = (await res.json()) as {
        success?: boolean
        data?: { notifications?: NotificationItem[]; unreadCount?: number }
      }
      if (json.success && json.data) {
        setItems(json.data.notifications ?? [])
        setUnread(json.data.unreadCount ?? 0)
      }
    } catch {
      /* silent — the bell is best-effort */
    }
  }, [])

  // Initial load + light polling so the badge stays fresh. `load` only calls
  // setState after awaiting fetch (never synchronously in the effect body).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    // Opening the panel marks everything read.
    if (next && unread > 0) {
      setUnread(0)
      setItems((prev) => prev.map((n) => ({ ...n, read: true })))
      try {
        await fetch('/api/social/notifications', {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({}),
        })
      } catch {
        /* best-effort */
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#E5EAE3] bg-white text-[#2D352C] shadow-sm hover:border-[var(--accent)] transition-colors"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        // Mobile: fixed to the viewport so the 320px panel can't hang off the
        // left edge (the bell anchor sits mid-header, not at the screen edge).
        // sm+: anchored dropdown as before.
        <div className="fixed inset-x-4 top-16 z-50 w-auto overflow-hidden rounded-2xl border border-[#E5EAE3] bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-80 sm:max-w-[calc(100vw-2rem)]">
          <div className="border-b border-[#E5EAE3] px-4 py-3">
            <p className="text-sm font-bold text-[#2D352C]">Notifications</p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[#8B9B83]">
                No notifications yet.
              </p>
            ) : (
              <ul className="divide-y divide-[#F0F2EF]">
                {items.map((n) => {
                  const name = n.actor?.name ?? 'Someone'
                  const inner = (
                    <div className={`flex items-start gap-3 px-4 py-3 ${n.read ? '' : 'bg-[#F5F8F3]'}`}>
                      <Avatar name={name} url={n.actor?.avatar_url ?? undefined} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[#2D352C]">
                          <span className="font-semibold">{name}</span>{' '}
                          {actionText(n.type)}
                        </p>
                        <p className="text-xs text-[#8B9B83]">{formatRelative(n.created_at)}</p>
                      </div>
                      {!n.read && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
                      )}
                    </div>
                  )
                  return (
                    <li key={n.id}>
                      {n.actor?.id ? (
                        <Link
                          href={`/community/users/${n.actor.id}`}
                          onClick={() => setOpen(false)}
                          className="block hover:bg-[#FAFBF9]"
                        >
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
