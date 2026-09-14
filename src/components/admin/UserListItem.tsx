'use client'

import type { AdminUserListItem } from '@/lib/messaging'
import { formatRelative } from '@/lib/format'

interface UserListItemProps {
  user: AdminUserListItem
  isActive: boolean
  /** Optional preview line. Falls back to email when omitted. */
  preview?: string | null
  /** Optional unread message count (>0 = bold + dot). */
  unreadCount?: number
  onSelect: (user: AdminUserListItem) => void
}

function getInitials(name: string | null, email: string): string {
  const source = (name?.trim() || email).trim()
  if (!source) return '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export default function UserListItem({
  user,
  isActive,
  preview,
  unreadCount = 0,
  onSelect,
}: UserListItemProps) {
  const displayName = user.full_name?.trim() || user.email
  const initials = getInitials(user.full_name, user.email)
  const previewText = preview?.trim() || user.email
  const hasUnread = unreadCount > 0

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(user)}
        role="option"
        aria-selected={isActive}
        className={`w-full text-left px-3 py-3 flex items-start gap-3 transition-colors border-l-2 ${
          isActive
            ? 'bg-[#F5F8F3] border-[var(--accent)]'
            : 'border-transparent hover:bg-[#FAF9F6]'
        }`}
      >
        <span
          aria-hidden="true"
          className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--accent)] text-white text-sm font-semibold flex items-center justify-center shadow-sm"
        >
          {initials}
        </span>

        <span className="flex-1 min-w-0">
          <span className="flex items-center justify-between gap-2">
            <span
              className={`truncate text-sm ${
                hasUnread
                  ? 'font-semibold text-[#2D352C]'
                  : 'font-medium text-[#2D352C]'
              }`}
            >
              {displayName}
            </span>
            {user.last_message_at && (
              <span className="flex-shrink-0 text-[11px] text-[#2D352C]/45">
                {formatRelative(user.last_message_at)}
              </span>
            )}
          </span>

          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span
              className={`block truncate text-xs line-clamp-1 ${
                hasUnread ? 'text-[#2D352C]/80' : 'text-[#2D352C]/55'
              }`}
            >
              {previewText}
            </span>
            {hasUnread && (
              <span
                aria-label={`${unreadCount} unread`}
                className="flex-shrink-0 min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-full bg-[var(--accent)] text-white text-[10px] font-semibold"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  )
}
