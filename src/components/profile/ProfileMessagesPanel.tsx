'use client'

import Link from 'next/link'
import { formatRelative } from '@/lib/format'

export interface ProfileConversation {
  user: { id: string; full_name?: string | null; email: string }
  last_message: { id: string; body: string; from_user_id: string; created_at: string }
  last_message_at: string
  unread_count: number
}

interface ProfileMessagesPanelProps {
  conversations: ProfileConversation[]
  totalUnread: number
}

export default function ProfileMessagesPanel({
  conversations,
  totalUnread,
}: ProfileMessagesPanelProps) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-xl overflow-hidden">
      <div className="p-4 border-b border-[#E5EAE3] bg-[var(--accent)]/5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#2D352C]">&#x1F4AC; Messages</h3>
          <div className="flex items-center gap-2">
            {totalUnread > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs">
                {totalUnread} new
              </span>
            )}
            <Link href="/messages" className="text-xs font-bold text-[var(--accent)] hover:underline">
              View all &rarr;
            </Link>
          </div>
        </div>
      </div>
      <div className="divide-y divide-[#E5EAE3]">
        {conversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-[#8B9B83]">No messages yet.</div>
        ) : (
          conversations.map((conv) => {
            const senderName = conv.user.full_name || conv.user.email
            const isUnread = conv.unread_count > 0
            return (
              <Link
                key={conv.user.id}
                href={`/messages/${conv.user.id}`}
                className={`block p-4 hover:bg-[#FAF9F6] ${isUnread ? 'bg-[#FAF9F6]' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-[#2D352C]">{senderName}</span>
                  <span className="text-xs text-[#8B9B83]">
                    {formatRelative(conv.last_message_at)}
                  </span>
                </div>
                <p className="text-xs text-[#8B9B83] line-clamp-1">{conv.last_message.body}</p>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
