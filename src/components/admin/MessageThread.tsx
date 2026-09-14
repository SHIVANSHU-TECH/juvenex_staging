'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type AdminUserListItem,
  type Message,
  type MessageThreadResponse,
} from '@/lib/messaging'
import type { ApiEnvelope } from '@/lib/api-types'
import MessageBubble from './MessageBubble'
import MessageComposer from './MessageComposer'

interface MessageThreadProps {
  /** The selected user — admin is sending TO this user. */
  threadUser: AdminUserListItem
  /** Current admin user id, used to align bubbles. */
  adminUserId: string
}

type ThreadResponse = ApiEnvelope<MessageThreadResponse>
type SendResponse = ApiEnvelope<{ message: Message }>

interface DayGroup {
  key: string
  label: string
  messages: Message[]
}

function getInitials(name: string | null, email: string): string {
  const source = (name?.trim() || email).trim()
  if (!source) return '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function groupByDay(messages: Message[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const m of messages) {
    const key = dayKey(m.created_at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.messages.push(m)
    } else {
      groups.push({ key, label: dayLabel(m.created_at), messages: [m] })
    }
  }
  return groups
}

function SkeletonBubble({ fromAdmin }: { fromAdmin: boolean }) {
  return (
    <div className={`flex ${fromAdmin ? 'justify-end' : 'justify-start'}`}>
      <div className="flex items-end gap-2 max-w-[78%]">
        {!fromAdmin && (
          <span className="w-8 h-8 rounded-full bg-[#E5EAE3] animate-pulse" />
        )}
        <div
          className={`h-10 w-48 rounded-2xl animate-pulse ${
            fromAdmin
              ? 'bg-[var(--accent)]/30 rounded-br-md'
              : 'bg-[#E5EAE3] rounded-bl-md'
          }`}
        />
      </div>
    </div>
  )
}

function EmptyState({ name }: { name: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-6">
      <div className="w-14 h-14 rounded-full bg-[#F5F8F3] flex items-center justify-center mb-4">
        <svg
          className="w-7 h-7 text-[var(--accent)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12a9 9 0 1 1-3.5-7.1L21 4l-1 4 .9.9A8.96 8.96 0 0 1 21 12Z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-[#2D352C]">
        Send the first message to {name}
      </p>
      <p className="mt-1 text-xs text-[#2D352C]/55">
        Use the composer below to start the conversation.
      </p>
      <svg
        className="mt-4 w-5 h-5 text-[var(--accent)] animate-bounce"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 3a1 1 0 0 1 1 1v9.586l3.293-3.293a1 1 0 1 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 1 1 1.414-1.414L9 13.586V4a1 1 0 0 1 1-1Z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  )
}

export default function MessageThread({
  threadUser,
  adminUserId,
}: MessageThreadProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadThread = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/messages/${threadUser.id}`)
      const json = (await res.json()) as ThreadResponse
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'Failed to load thread')
        setMessages([])
        return
      }
      setMessages(json.data.messages)
    } catch (err) {
      console.error('MessageThread loadThread failed', err)
      setError('Network error')
      setMessages([])
    } finally {
      setIsLoading(false)
    }
  }, [threadUser.id])

  useEffect(() => {
    setSendError(null)
    void loadThread()
  }, [loadThread])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages.length, isLoading])

  const handleSend = useCallback(
    async (body: string): Promise<boolean> => {
      setSendError(null)
      try {
        const res = await fetch(`/api/admin/messages/${threadUser.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        })
        const json = (await res.json()) as SendResponse
        if (!res.ok || !json.success || !json.data) {
          setSendError(json.error ?? 'Failed to send message')
          return false
        }
        setMessages((prev) => [...prev, json.data!.message])
        return true
      } catch (err) {
        console.error('MessageThread handleSend failed', err)
        setSendError('Network error')
        return false
      }
    },
    [threadUser.id]
  )

  const displayName = threadUser.full_name?.trim() || threadUser.email
  const initials = getInitials(threadUser.full_name, threadUser.email)
  const groups = useMemo(() => groupByDay(messages), [messages])
  const showEmpty = !isLoading && !error && messages.length === 0

  return (
    <div className="flex flex-col h-full bg-white/40">
      <header className="flex-shrink-0 px-4 py-3 border-b border-[#E5EAE3] bg-[#FAF9F6] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            aria-hidden="true"
            className="w-10 h-10 rounded-full bg-[var(--accent)] text-white text-sm font-semibold flex items-center justify-center shadow-sm"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-[#2D352C] truncate text-sm">
              {displayName}
            </h3>
            <p className="text-xs text-[#2D352C]/50 truncate">
              {threadUser.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F5F8F3] text-[#5C7158] border border-[var(--accent)]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            Active member
          </span>
          <a
            href={`/community/users/${threadUser.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 rounded"
          >
            View profile
          </a>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 bg-white/40"
        aria-live="polite"
        aria-busy={isLoading}
      >
        {error && (
          <p className="text-sm text-red-600 text-center" role="alert">
            {error}
          </p>
        )}

        {isLoading && !error && (
          <div className="space-y-3">
            <SkeletonBubble fromAdmin={false} />
            <SkeletonBubble fromAdmin={true} />
            <SkeletonBubble fromAdmin={false} />
            <SkeletonBubble fromAdmin={true} />
            <SkeletonBubble fromAdmin={false} />
          </div>
        )}

        {showEmpty && <EmptyState name={displayName} />}

        {!isLoading && !error && messages.length > 0 && (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key} className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="flex-1 h-px bg-[#E5EAE3]" />
                  <span className="text-[11px] font-medium text-[#2D352C]/50 uppercase tracking-wider">
                    {group.label}
                  </span>
                  <span className="flex-1 h-px bg-[#E5EAE3]" />
                </div>
                <div className="space-y-2">
                  {group.messages.map((msg, idx) => {
                    const fromAdmin = msg.from_user_id === adminUserId
                    const prev = group.messages[idx - 1]
                    const sameSenderAsPrev =
                      prev && prev.from_user_id === msg.from_user_id
                    return (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        fromAdmin={fromAdmin}
                        showAvatar={!sameSenderAsPrev}
                        authorName={fromAdmin ? 'You' : displayName}
                      />
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <MessageComposer
        recipientName={displayName}
        disabled={isLoading || Boolean(error)}
        onSend={handleSend}
        errorMessage={sendError}
      />
    </div>
  )
}
