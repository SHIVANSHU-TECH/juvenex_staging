'use client'

import type { Message } from '@/lib/messaging'
import { formatChatTime } from '@/lib/format'

interface MessageBubbleProps {
  message: Message
  /** True when the message was sent by the current admin user. */
  fromAdmin: boolean
  /** Show avatar — only true on the first bubble of a sender sequence. */
  showAvatar: boolean
  /** Display name + initials source for the avatar/aria. */
  authorName: string
}

function initialsFor(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function formatTimeOnly(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function MessageBubble({
  message,
  fromAdmin,
  showAvatar,
  authorName,
}: MessageBubbleProps) {
  const initials = initialsFor(authorName)
  const align = fromAdmin ? 'justify-end' : 'justify-start'
  const bubbleStyle = fromAdmin
    ? 'bg-[var(--accent)] text-white rounded-2xl rounded-br-md'
    : 'bg-white border border-[#E5EAE3] text-[#2D352C] rounded-2xl rounded-bl-md'
  const metaStyle = fromAdmin
    ? 'text-[#2D352C]/45 justify-end'
    : 'text-[#2D352C]/45 justify-start'

  // Avatar slot is always rendered (with width) so consecutive bubbles align.
  const avatar = (
    <span
      aria-hidden={showAvatar ? undefined : true}
      className="flex-shrink-0 w-8 h-8"
    >
      {showAvatar && (
        <span
          className="w-8 h-8 rounded-full bg-[var(--accent)] text-white text-[11px] font-semibold flex items-center justify-center shadow-sm"
          title={authorName}
        >
          {initials}
        </span>
      )}
    </span>
  )

  return (
    <div className={`flex ${align}`}>
      <div
        className={`flex items-end gap-2 max-w-[78%] ${
          fromAdmin ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {avatar}
        <div
          className={`flex flex-col ${
            fromAdmin ? 'items-end' : 'items-start'
          }`}
        >
          <div
            className={`px-4 py-2 shadow-sm ${bubbleStyle}`}
            role="article"
            aria-label={`Message from ${authorName}`}
          >
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {message.body}
            </p>
          </div>
          <div
            className={`mt-1 flex items-center gap-1 text-[11px] ${metaStyle}`}
          >
            <span>{formatTimeOnly(message.created_at)}</span>
            {fromAdmin && message.read_at && (
              <>
                <span aria-hidden="true">·</span>
                <span title={`Read ${formatChatTime(message.read_at)}`}>
                  Read {formatTimeOnly(message.read_at)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
