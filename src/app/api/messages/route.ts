import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import type {
  ConversationSummary,
  Message,
  MessageUser,
} from '@/lib/messaging'

// GET /api/messages
// Returns the current user's inbox: one entry per conversation partner with
// the most recent message and unread count. Powers both the inbox page and
// the unread-count badge logic.

interface MessageRow {
  id: string
  from_user_id: string
  to_user_id: string
  body: string
  read_at: string | null
  created_at: string
}

interface ProfileRow {
  id: string
  email: string
  name: string | null
}

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const rl = rateLimit(`inbox-list:${user.id}`, 120, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const supabase = createAdminClient()

    // Fetch every message the user is involved in, newest first. 500-row cap
    // keeps the inbox bounded for MVP; pagination can land later.
    const { data: msgsData, error: msgsError } = await supabase
      .from('messages')
      .select('id, from_user_id, to_user_id, body, read_at, created_at')
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(500)

    if (msgsError) {
      logger.error('Inbox list error', { error: msgsError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const messages = (msgsData ?? []) as MessageRow[]

    // Fold into per-partner conversation summaries.
    const byPartner = new Map<
      string,
      { last: MessageRow; unread: number }
    >()
    for (const msg of messages) {
      const partnerId =
        msg.from_user_id === user.id ? msg.to_user_id : msg.from_user_id
      const existing = byPartner.get(partnerId)
      const isUnreadIncoming = msg.to_user_id === user.id && !msg.read_at
      if (!existing) {
        byPartner.set(partnerId, {
          last: msg,
          unread: isUnreadIncoming ? 1 : 0,
        })
      } else {
        if (msg.created_at > existing.last.created_at) {
          existing.last = msg
        }
        if (isUnreadIncoming) existing.unread += 1
      }
    }

    const partnerIds = Array.from(byPartner.keys())
    const profileById = new Map<string, ProfileRow>()
    if (partnerIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, email, name')
        .in('id', partnerIds)
      for (const row of (profilesData ?? []) as ProfileRow[]) {
        profileById.set(row.id, row)
      }
    }

    const conversations: ConversationSummary[] = partnerIds
      .flatMap<ConversationSummary>((partnerId) => {
        const summary = byPartner.get(partnerId)
        // Defensive: partnerIds is derived from byPartner.keys() so the map
        // always has an entry. Replace the previous non-null assertion with
        // a safe lookup so a future refactor that decouples partnerIds from
        // byPartner can't crash this handler at runtime.
        if (!summary) return []
        const profile = profileById.get(partnerId)
        const partner: MessageUser = {
          id: partnerId,
          email: profile?.email ?? '',
          full_name: profile?.name ?? null,
        }
        const lastMessage: Message = summary.last
        return [
          {
            user: partner,
            last_message: lastMessage,
            last_message_at: lastMessage.created_at,
            unread_count: summary.unread,
          },
        ]
      })
      .sort((a, b) =>
        (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')
      )

    const totalUnread = conversations.reduce(
      (sum, c) => sum + c.unread_count,
      0
    )

    return Response.json({
      success: true,
      data: {
        conversations,
        total_unread: totalUnread,
      },
    })
  } catch (error: unknown) {
    logger.error('Inbox error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
