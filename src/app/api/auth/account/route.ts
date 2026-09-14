import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Tables whose user rows must be removed on account deletion (user_id column).
// Verified against the live schema Jul 10, 2026 — the original list referenced
// tables that never shipped (intake_submissions, post_comments, post_likes,
// group_posts), so every deletion quietly left that data behind.
const DELETE_TABLES = [
  'patient_profiles',
  'food_logs',
  'meal_plans',
  'progress_photos',
  'weight_entries',
  'ai_conversations',
  'chat_conversations',
  'appointments',
  'shop_quiz_responses',
  'client_errors',
  // Social graph tables (group posts live in `posts` via group_id)
  'posts',
  'comments',
  'likes',
  'comment_likes',
  'group_members',
] as const

// Tables whose rows must be anonymized rather than deleted to preserve
// compliance-critical history (HIPAA requires an intact audit trail).
const ANONYMIZE_TABLES = ['audit_logs'] as const

const PROGRESS_PHOTO_BUCKET = 'progress-photos'

/**
 * Deletes all Supabase Storage objects under progress-photos/<userId>/.
 * Returns an error string on failure, or null on success.
 */
async function deleteProgressPhotoStorage(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  try {
    const { data: files, error: listError } = await supabase.storage
      .from(PROGRESS_PHOTO_BUCKET)
      .list(userId)

    if (listError) {
      return `storage list: ${listError.message}`
    }

    if (!files || files.length === 0) return null

    const paths = files.map((f) => `${userId}/${f.name}`)
    const { error: removeError } = await supabase.storage
      .from(PROGRESS_PHOTO_BUCKET)
      .remove(paths)

    if (removeError) {
      return `storage remove: ${removeError.message}`
    }

    return null
  } catch (err) {
    return err instanceof Error ? err.message : 'unknown storage error'
  }
}

/**
 * DELETE /api/auth/account — HIPAA / state-privacy right-to-erasure.
 *
 * Removes the authenticated user's personal data across PHI-bearing tables,
 * anonymizes audit logs, deletes storage objects, and deletes the Supabase
 * auth record. Rate limited to one attempt per 60 seconds per user.
 *
 * On partial failure returns HTTP 207 Multi-Status with the list of failed
 * steps so callers can retry. Auth user deletion failure is still HTTP 500.
 */
export async function DELETE() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const rl = rateLimit(`account-delete:${user.id}`, 1, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    // Log BEFORE we touch anything, so the audit event is preserved even if
    // subsequent steps partially fail.
    await logAudit({
      userId: user.id,
      action: 'account_deleted',
      resourceType: 'account',
      resourceId: user.id,
    }).catch(() => {})

    const supabase = getSupabase()
    const failures: string[] = []

    // --- Table row deletion (user_id column) ---
    for (const table of DELETE_TABLES) {
      const { error } = await supabase.from(table).delete().eq('user_id', user.id)
      if (error) {
        logger.error('Failed to delete user rows', { table, error: error.message })
        failures.push(`table:${table}`)
      }
    }

    // --- Social graph: follows — user appears in both follower_id and followed_id ---
    const { error: followerErr } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
    if (followerErr) {
      logger.error('Failed to delete follows (follower_id)', { error: followerErr.message })
      failures.push('table:follows(follower_id)')
    }

    const { error: followedErr } = await supabase
      .from('follows')
      .delete()
      .eq('following_id', user.id)
    if (followedErr) {
      logger.error('Failed to delete follows (following_id)', { error: followedErr.message })
      failures.push('table:follows(following_id)')
    }

    // --- Direct messages: user appears as sender or recipient ---
    for (const col of ['from_user_id', 'to_user_id'] as const) {
      const { error } = await supabase.from('messages').delete().eq(col, user.id)
      if (error) {
        logger.error('Failed to delete messages', { col, error: error.message })
        failures.push(`table:messages(${col})`)
      }
    }

    // --- Notifications: owned by the user or triggered by them ---
    for (const col of ['user_id', 'actor_id'] as const) {
      const { error } = await supabase.from('notifications').delete().eq(col, user.id)
      if (error) {
        logger.error('Failed to delete notifications', { col, error: error.message })
        failures.push(`table:notifications(${col})`)
      }
    }

    // --- Audit log anonymization ---
    for (const table of ANONYMIZE_TABLES) {
      const { error } = await supabase
        .from(table)
        .update({ user_id: null })
        .eq('user_id', user.id)
      if (error) {
        logger.error('Failed to anonymize user rows', { table, error: error.message })
        failures.push(`anonymize:${table}`)
      }
    }

    // --- Storage: progress-photos bucket ---
    const storageError = await deleteProgressPhotoStorage(supabase, user.id)
    if (storageError) {
      logger.error('Failed to delete progress photo storage objects', {
        userId: user.id,
        error: storageError,
      })
      failures.push('storage:progress-photos')
    }

    // --- Delete public profile mirror ---
    const { error: profileErr } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id)
    if (profileErr) {
      logger.error('Failed to delete profile row', { error: profileErr.message })
      failures.push('table:profiles')
    }

    // --- Finally drop the Supabase auth user ---
    // Done last so that row cleanup above still has a valid FK target if any
    // triggers reference profiles.
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(user.id)
    if (deleteAuthError) {
      logger.error('Failed to delete Supabase auth user', {
        userId: user.id,
        error: deleteAuthError.message,
      })
      return Response.json(
        { success: false, error: 'Failed to delete account' },
        { status: 500 }
      )
    }

    // Partial success — some ancillary tables failed but the auth user is gone.
    // Return 207 so callers know they may need to retry storage/table cleanup.
    if (failures.length > 0) {
      logger.error('Account deletion partially failed', { userId: user.id, failures })
      return Response.json(
        {
          success: false,
          error: 'Account deleted but some data cleanup steps failed. Retry DELETE to complete.',
          failures,
        },
        { status: 207 }
      )
    }

    return Response.json({ success: true })
  } catch (error: unknown) {
    logger.error('Account deletion failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
