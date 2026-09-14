import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// GET   /api/social/notifications        — recent notifications + unread count
// PATCH /api/social/notifications        — mark read (all, or a list of ids)

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface NotificationRow {
  id: string
  actor_id: string | null
  type: string
  post_id: string | null
  comment_id: string | null
  read: boolean
  created_at: string
}

const PAGE_LIMIT = 30

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`notifications:${user.id}`, 120, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const supabase = getSupabase()

    const [{ data: rows, error }, { count: unreadCount }] = await Promise.all([
      supabase
        .from('notifications')
        .select('id, actor_id, type, post_id, comment_id, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_LIMIT),
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false),
    ])

    if (error) {
      logger.error('Notifications list error', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    const list = (rows ?? []) as NotificationRow[]
    const actorIds = Array.from(
      new Set(list.map((n) => n.actor_id).filter((v): v is string => Boolean(v)))
    )

    const actorMap = new Map<string, { id: string; name: string | null; avatar_url: string | null }>()
    if (actorIds.length > 0) {
      const { data: actors } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', actorIds)
      for (const a of (actors ?? []) as Array<{ id: string; name: string | null; avatar_url: string | null }>) {
        actorMap.set(a.id, a)
      }
    }

    const notifications = list.map((n) => ({
      id: n.id,
      type: n.type,
      post_id: n.post_id,
      comment_id: n.comment_id,
      read: n.read,
      created_at: n.created_at,
      actor: n.actor_id ? actorMap.get(n.actor_id) ?? null : null,
    }))

    return Response.json({
      success: true,
      data: { notifications, unreadCount: unreadCount ?? 0 },
    })
  } catch (error: unknown) {
    logger.error('Notifications error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

const patchSchema = z.object({
  // When omitted, marks ALL of the caller's notifications read.
  ids: z.array(z.string().uuid()).max(100).optional(),
})

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`notifications-read:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }

    const supabase = getSupabase()
    let query = supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)
    if (parsed.data.ids && parsed.data.ids.length > 0) {
      query = query.in('id', parsed.data.ids)
    }

    const { error } = await query
    if (error) {
      logger.error('Notifications mark-read error', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error: unknown) {
    logger.error('Notifications mark-read error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
