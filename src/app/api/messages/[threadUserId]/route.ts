import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { canMessageUserTenant } from '@/lib/tenant-guard'
import type { Message, MessageThreadResponse } from '@/lib/messaging'

// /api/messages/[threadUserId]
//   GET  → Thread between current user and threadUserId, ordered by created_at ASC.
//   POST → Mark all incoming (to_user_id = current user) messages from threadUserId as read.
//          Body is ignored; this is a state-change action.

const threadIdSchema = z.string().uuid('Invalid thread user id')

interface ProfileRow {
  id: string
  email: string
  name: string | null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ threadUserId: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // GET rate limit prevents abuse from a polling client. The inbox UI
    // refreshes a thread frequently; 120/minute is enough headroom for normal
    // use while denying brute scraping of cross-user message bodies.
    const rl = rateLimit(`inbox-thread:${user.id}`, 120, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const { threadUserId } = await params
    const idParse = threadIdSchema.safeParse(threadUserId)
    if (!idParse.success) {
      return Response.json(
        { success: false, error: 'Invalid thread user id' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data: partnerData, error: partnerError } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('id', idParse.data)
      .maybeSingle()

    if (partnerError) {
      logger.error('Inbox thread partner error', {
        error: partnerError.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!partnerData) {
      return Response.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Tenant isolation: only read threads with users in your own organization.
    if (!(await canMessageUserTenant(supabase, user, idParse.data))) {
      return Response.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const partner = partnerData as ProfileRow

    // SAFETY of the .or() interpolation:
    //  - `user.id` is the auth principal from getAuthUser() (DB-validated).
    //  - `partner.id` came from a profiles row we fetched after a Zod uuid
    //    parse on the path param. It is a typed UUID, never a raw user input.
    // If either invariant changes, restructure to chained `.in()` calls.
    const { data: msgsData, error: msgsError } = await supabase
      .from('messages')
      .select('id, from_user_id, to_user_id, body, read_at, created_at')
      .or(
        `and(from_user_id.eq.${user.id},to_user_id.eq.${partner.id}),` +
          `and(from_user_id.eq.${partner.id},to_user_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true })
      .limit(500)

    if (msgsError) {
      logger.error('Inbox thread error', { error: msgsError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const response: MessageThreadResponse = {
      thread_user: {
        id: partner.id,
        email: partner.email,
        full_name: partner.name,
      },
      messages: (msgsData ?? []) as Message[],
    }

    return Response.json({ success: true, data: response })
  } catch (error: unknown) {
    logger.error('Inbox thread GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ threadUserId: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const rl = rateLimit(`inbox-mark-read:${user.id}`, 120, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const { threadUserId } = await params
    const idParse = threadIdSchema.safeParse(threadUserId)
    if (!idParse.success) {
      return Response.json(
        { success: false, error: 'Invalid thread user id' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { data: updated, error: updateError } = await supabase
      .from('messages')
      .update({ read_at: now })
      .eq('to_user_id', user.id)
      .eq('from_user_id', idParse.data)
      .is('read_at', null)
      .select('id')

    if (updateError) {
      logger.error('Inbox mark-read error', { error: updateError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      data: { marked_read: updated?.length ?? 0 },
    })
  } catch (error: unknown) {
    logger.error('Inbox mark-read POST error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
