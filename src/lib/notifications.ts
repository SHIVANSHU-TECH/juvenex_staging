// Community notifications — server helper.
//
// Best-effort insert used by the social API routes after an interaction
// (like/comment) succeeds. A notification failure must never break the
// underlying action, so callers fire-and-forget and errors are only logged.

import { logger } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

// Loosely-typed service client — the social routes each build their own
// `createClient(...)` instance; we only need `.from(...).insert(...)`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = SupabaseClient<any, any, any>

export type NotificationType = 'post_like' | 'post_comment' | 'comment_like'

interface CreateNotificationInput {
  /** Recipient — the content owner being notified. */
  recipientId: string
  /** Who triggered it. */
  actorId: string
  type: NotificationType
  postId?: string | null
  commentId?: string | null
}

/**
 * Insert a notification. No-ops (and never throws) when the actor is the
 * recipient — you don't get notified about your own actions.
 */
export async function createNotification(
  supabase: ServiceClient,
  input: CreateNotificationInput
): Promise<void> {
  try {
    if (!input.recipientId || input.recipientId === input.actorId) return

    const { error } = await supabase.from('notifications').insert({
      user_id: input.recipientId,
      actor_id: input.actorId,
      type: input.type,
      post_id: input.postId ?? null,
      comment_id: input.commentId ?? null,
    })
    if (error) {
      logger.warn('createNotification failed', {
        type: input.type,
        error: error.message,
      })
    }
  } catch (error: unknown) {
    logger.warn('createNotification threw', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
