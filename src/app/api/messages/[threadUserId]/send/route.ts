import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { canMessageUserTenant } from '@/lib/tenant-guard'
import {
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGE_BODY_MIN_LENGTH,
  type Message,
} from '@/lib/messaging'

// POST /api/messages/[threadUserId]/send
//   Send a direct message from the current user to threadUserId.
//   Uses the service-role client (bypasses RLS), so ownership is enforced
//   here: from_user_id is always the authenticated user.

const threadIdSchema = z.string().uuid('Invalid recipient id')
const sendSchema = z.object({
  body: z.string().min(MESSAGE_BODY_MIN_LENGTH).max(MESSAGE_BODY_MAX_LENGTH),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadUserId: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`inbox-send:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const { threadUserId } = await params
    const idParse = threadIdSchema.safeParse(threadUserId)
    if (!idParse.success) {
      return Response.json({ success: false, error: 'Invalid recipient id' }, { status: 400 })
    }
    if (idParse.data === user.id) {
      return Response.json(
        { success: false, error: 'You cannot message yourself' },
        { status: 400 }
      )
    }

    const json = await request.json().catch(() => null)
    const parsed = sendSchema.safeParse(json)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const body = parsed.data.body.trim()
    if (body.length < MESSAGE_BODY_MIN_LENGTH) {
      return Response.json({ success: false, error: 'Message cannot be empty' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Recipient must exist.
    const { data: recipient } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', idParse.data)
      .maybeSingle()

    if (!recipient) {
      return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Tenant isolation: only message users in your own organization (404 — not
    // 403 — so cross-tenant existence is never disclosed).
    if (!(await canMessageUserTenant(supabase, user, idParse.data))) {
      return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('messages')
      .insert({ from_user_id: user.id, to_user_id: idParse.data, body })
      .select('id, from_user_id, to_user_id, body, read_at, created_at')
      .single()

    if (insertError || !inserted) {
      logger.error('Inbox send error', { error: insertError?.message })
      return Response.json({ success: false, error: 'Failed to send message' }, { status: 500 })
    }

    return Response.json({ success: true, data: { message: inserted as Message } }, { status: 201 })
  } catch (error: unknown) {
    logger.error('Inbox send POST error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
