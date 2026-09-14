import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import {
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGE_BODY_MIN_LENGTH,
  type Message,
  type MessageThreadResponse,
} from '@/lib/messaging'

// /api/admin/messages/[userId]
//   GET  → Thread between current admin and userId, ordered created_at ASC.
//   POST → Send new message from admin to userId. Body: { body: string }.
// Both gated by super_admin role.

const sendBodySchema = z.object({
  body: z
    .string()
    .min(MESSAGE_BODY_MIN_LENGTH, 'Message body is required')
    .max(MESSAGE_BODY_MAX_LENGTH, `Max ${MESSAGE_BODY_MAX_LENGTH} characters`),
})

const userIdSchema = z.string().uuid('Invalid user id')

interface ProfileRow {
  id: string
  email: string
  name: string | null
}

async function requireSuperAdmin() {
  const user = await getAuthUser()
  if (!user) {
    return {
      ok: false as const,
      response: Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    }
  }
  if (user.role !== 'super_admin') {
    return {
      ok: false as const,
      response: Response.json(
        { success: false, error: 'Forbidden: super_admin role required' },
        { status: 403 }
      ),
    }
  }
  return { ok: true as const, user }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return auth.response

    // Cap GET polling — the admin UI can refresh threads on focus/interval,
    // and the bound also limits enumeration of arbitrary userId paths.
    const rl = rateLimit(`admin-messages-get:${auth.user.id}`, 120, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const { userId } = await params
    const idParse = userIdSchema.safeParse(userId)
    if (!idParse.success) {
      return Response.json(
        { success: false, error: 'Invalid user id' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data: targetData, error: targetError } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('id', idParse.data)
      .maybeSingle()

    if (targetError) {
      logger.error('Admin messages target lookup error', {
        error: targetError.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!targetData) {
      return Response.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const target = targetData as ProfileRow

    // SAFETY of the .or() interpolation:
    //  - `auth.user.id` came from getAuthUser() (DB-validated profiles.id).
    //  - `target.id` came from a profiles row we just selected by uuid.
    //  - `target.id` is reused, NOT the raw path param, after a maybeSingle()
    //    on the validated UUID parse above.
    // Both are typed UUIDs and cannot contain PostgREST control characters.
    const { data: msgsData, error: msgsError } = await supabase
      .from('messages')
      .select('id, from_user_id, to_user_id, body, read_at, created_at')
      .or(
        `and(from_user_id.eq.${auth.user.id},to_user_id.eq.${target.id}),` +
          `and(from_user_id.eq.${target.id},to_user_id.eq.${auth.user.id})`
      )
      .order('created_at', { ascending: true })
      .limit(500)

    if (msgsError) {
      logger.error('Admin messages thread error', { error: msgsError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const response: MessageThreadResponse = {
      thread_user: {
        id: target.id,
        email: target.email,
        full_name: target.name,
      },
      // safe: SELECT clause above lists exactly the Message columns; rows are
      // display-only here and never drive an authorization branch.
      messages: (msgsData ?? []) as Message[],
    }

    return Response.json({ success: true, data: response })
  } catch (error: unknown) {
    logger.error('Admin messages GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`admin-messages:${auth.user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const { userId } = await params
    const idParse = userIdSchema.safeParse(userId)
    if (!idParse.success) {
      return Response.json(
        { success: false, error: 'Invalid user id' },
        { status: 400 }
      )
    }

    if (idParse.data === auth.user.id) {
      return Response.json(
        { success: false, error: 'Cannot send a message to yourself' },
        { status: 400 }
      )
    }

    const rawBody: unknown = await request.json().catch(() => null)
    const parsed = sendBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Confirm recipient exists before insert (better error than FK failure).
    const { data: targetData, error: targetError } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('id', idParse.data)
      .maybeSingle()

    if (targetError) {
      logger.error('Admin messages target lookup error', {
        error: targetError.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!targetData) {
      return Response.json(
        { success: false, error: 'Recipient not found' },
        { status: 404 }
      )
    }

    const trimmedBody = parsed.data.body.trim()
    if (trimmedBody.length < MESSAGE_BODY_MIN_LENGTH) {
      return Response.json(
        { success: false, error: 'Message body is required' },
        { status: 400 }
      )
    }

    const { data: inserted, error: insertError } = await supabase
      .from('messages')
      .insert({
        from_user_id: auth.user.id,
        to_user_id: idParse.data,
        body: trimmedBody,
      })
      .select('id, from_user_id, to_user_id, body, read_at, created_at')
      .single()

    if (insertError || !inserted) {
      logger.error('Admin messages insert error', {
        error: insertError?.message,
      })
      return Response.json(
        { success: false, error: 'Failed to send message' },
        { status: 500 }
      )
    }

    return Response.json(
      { success: true, data: { message: inserted as Message } },
      { status: 201 }
    )
  } catch (error: unknown) {
    logger.error('Admin messages POST error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
