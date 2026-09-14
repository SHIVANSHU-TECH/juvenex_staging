/*
 * chat-memory.ts
 * --------------
 * Server-side helpers for the normalized chat_conversations / chat_messages
 * tables (see supabase/migrations/032_chat_conversations.sql).
 *
 * The "AI memory bank" pattern that the client (Braeden) asked for:
 *   - Each turn is appended to chat_messages instead of re-encrypting a JSONB
 *     blob on every request.
 *   - The route handler loads the last N messages of the user's conversation,
 *     prepends them to the upstream LLM call (after the system prompt, before
 *     the new user message), then writes the new user+assistant turns back.
 *
 * RLS is enforced at the table level. These helpers expect a service-role
 * Supabase client (createAdminClient) because the API path verifies the user
 * via getAuthUser and then writes on their behalf with the service role.
 * Each helper still scopes its queries by user_id / conversation_id so a
 * mistakenly-passed admin client cannot leak across users.
 */
import { type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { logger } from '@/lib/logger'

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMemoryMessage {
  role: ChatRole
  content: string
}

export interface ChatConversation {
  id: string
  userId: string
  organizationId: string | null
  title: string | null
  createdAt: string
  updatedAt: string
}

// -----------------------------------------------------------------------------
// Row schemas — validate everything coming back from PostgREST before we
// hand it to the route layer. PostgREST returns `unknown`-shaped rows and a
// schema mismatch (e.g. a renamed column) would otherwise propagate silently.
// -----------------------------------------------------------------------------

const conversationRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  organization_id: z.string().uuid().nullable(),
  title: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

const messageRowSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
})

function toConversation(row: z.infer<typeof conversationRowSchema>): ChatConversation {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// -----------------------------------------------------------------------------
// getOrCreateConversation
// -----------------------------------------------------------------------------
// If `conversationId` is supplied and belongs to the caller, return it.
// Otherwise (or if it doesn't belong to the caller) create a brand-new
// conversation for the user. We deliberately do NOT throw on
// not-found-for-caller, because a stale `conversationId` cookie shouldn't be
// able to lock a user out of the assistant — we just start a fresh thread.
// -----------------------------------------------------------------------------

export interface GetOrCreateOptions {
  organizationId?: string | null
  title?: string | null
}

export async function getOrCreateConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId?: string,
  opts: GetOrCreateOptions = {}
): Promise<ChatConversation> {
  if (conversationId) {
    const existing = await fetchConversation(supabase, conversationId, userId)
    if (existing) return existing
    logger.warn('chat-memory: conversationId not found for user, creating new', {
      requestedConversationId: conversationId,
      userId,
    })
  }

  const insertPayload = {
    user_id: userId,
    organization_id: opts.organizationId ?? null,
    title: opts.title ?? null,
  }

  const { data, error } = await supabase
    .from('chat_conversations')
    .insert(insertPayload)
    .select('id, user_id, organization_id, title, created_at, updated_at')
    .single()

  if (error || !data) {
    logger.error('chat-memory: failed to create conversation', {
      error: error?.message,
      userId,
    })
    throw new Error('Failed to create chat conversation')
  }

  const parsed = conversationRowSchema.safeParse(data)
  if (!parsed.success) {
    logger.error('chat-memory: created row failed schema validation', {
      issues: parsed.error.issues.length,
      userId,
    })
    throw new Error('Created chat conversation row is malformed')
  }

  return toConversation(parsed.data)
}

async function fetchConversation(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<ChatConversation | null> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, user_id, organization_id, title, created_at, updated_at')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    logger.error('chat-memory: failed to fetch conversation', {
      error: error.message,
      conversationId,
      userId,
    })
    return null
  }
  if (!data) return null

  const parsed = conversationRowSchema.safeParse(data)
  if (!parsed.success) {
    logger.warn('chat-memory: fetched conversation row failed schema validation', {
      conversationId,
      issues: parsed.error.issues.length,
    })
    return null
  }
  return toConversation(parsed.data)
}

// -----------------------------------------------------------------------------
// loadRecentMessages
// -----------------------------------------------------------------------------
// Returns the last `limit` messages of a conversation, ordered oldest -> newest
// (the natural order for an LLM prompt). PostgREST has no native LIMIT-from-end
// so we ORDER BY created_at DESC, take `limit`, then reverse client-side.
// -----------------------------------------------------------------------------

const DEFAULT_HISTORY_LIMIT = 20
const MAX_HISTORY_LIMIT = 200

export async function loadRecentMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit: number = DEFAULT_HISTORY_LIMIT
): Promise<ChatMemoryMessage[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_HISTORY_LIMIT)

  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(boundedLimit)

  if (error) {
    logger.error('chat-memory: failed to load messages', {
      error: error.message,
      conversationId,
    })
    return []
  }

  const rows = Array.isArray(data) ? data : []
  const validated: ChatMemoryMessage[] = []
  let invalid = 0
  for (const row of rows) {
    const parsed = messageRowSchema.safeParse(row)
    if (parsed.success) {
      validated.push({ role: parsed.data.role, content: parsed.data.content })
    } else {
      invalid += 1
    }
  }
  if (invalid > 0) {
    logger.warn('chat-memory: dropped invalid message rows', {
      conversationId,
      invalid,
      validCount: validated.length,
    })
  }

  // Reverse to chronological order (oldest first) for prompt construction.
  // Immutable: build a new array, never mutate `validated`.
  return [...validated].reverse()
}

// -----------------------------------------------------------------------------
// appendMessage
// -----------------------------------------------------------------------------
// Single-row insert. The chat_messages_bump_conversation trigger keeps the
// parent's updated_at fresh so we don't need a second UPDATE here.
// -----------------------------------------------------------------------------

const appendMessageInputSchema = z.object({
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  tokenCount: z.number().int().nonnegative().nullable().optional(),
})

export async function appendMessage(
  supabase: SupabaseClient,
  conversationId: string,
  role: ChatRole,
  content: string,
  tokenCount: number | null = null
): Promise<void> {
  const parsed = appendMessageInputSchema.safeParse({
    conversationId,
    role,
    content,
    tokenCount,
  })
  if (!parsed.success) {
    logger.error('chat-memory: appendMessage rejected invalid input', {
      issues: parsed.error.issues.length,
    })
    throw new Error('Invalid appendMessage input')
  }

  const { error } = await supabase.from('chat_messages').insert({
    conversation_id: parsed.data.conversationId,
    role: parsed.data.role,
    content: parsed.data.content,
    token_count: parsed.data.tokenCount ?? null,
  })

  if (error) {
    logger.error('chat-memory: failed to append message', {
      error: error.message,
      conversationId,
      role,
    })
    throw new Error('Failed to append chat message')
  }
}
