import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { errorMessage } from '@/lib/error-utils'

const reportSchema = z.object({
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason must be at most 500 characters'),
})

// Zod shape for the auth-decision row we read from `posts`. Cast-only access
// would let a schema drift (e.g. is_public renamed) silently flip the
// authorization branch — fail-closed with safeParse instead.
const reportTargetPostSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  is_public: z.boolean(),
  organization_id: z.string().uuid().nullable(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Tight rate limit: reports are a moderation signal, not a normal user
    // action. 5 per 10 min discourages mass-flagging campaigns while still
    // allowing legitimate batch reporting. Idempotent on (post_id, reporter_id).
    const rl = rateLimit(`post-report:${user.id}`, 5, 600_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many reports' },
        { status: 429 }
      )
    }

    const { id: postId } = await params

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const parsed = reportSchema.safeParse(body)
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

    // Verify post exists, is public, and is not authored by the reporter.
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, user_id, is_public, organization_id')
      .eq('id', postId)
      .maybeSingle()

    if (postError) {
      logger.error('post-report post lookup failed', { error: postError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!post) {
      return Response.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      )
    }

    // Validate the row shape before relying on `is_public` for the auth
    // branch below. If the schema drifts, fail-closed with a 500.
    const postParse = reportTargetPostSchema.safeParse(post)
    if (!postParse.success) {
      logger.error('post-report target post failed schema validation', {
        postId,
        issues: postParse.error.flatten(),
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    const typedPost = postParse.data

    // Tenant isolation: 404 for posts outside the caller's organization.
    if (
      user.role !== 'super_admin' &&
      (typedPost.organization_id ?? null) !== (user.organization_id ?? null)
    ) {
      return Response.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      )
    }

    if (!typedPost.is_public) {
      return Response.json(
        { success: false, error: 'Cannot report a private post' },
        { status: 403 }
      )
    }

    if (typedPost.user_id === user.id) {
      return Response.json(
        { success: false, error: 'You cannot report your own post' },
        { status: 403 }
      )
    }

    // Idempotent insert: unique (post_id, reporter_id) — duplicate inserts
    // surface as a unique-violation we silently treat as success.
    const { error: insertError } = await supabase
      .from('post_reports')
      .insert({
        post_id: postId,
        reporter_id: user.id,
        reason: parsed.data.reason.trim(),
        status: 'pending',
      })

    if (insertError) {
      // Unique violation = already reported — treat as success.
      const isDuplicate =
        insertError.code === '23505' ||
        /duplicate|unique/i.test(insertError.message)

      if (isDuplicate) {
        return Response.json({
          success: true,
          data: { alreadyReported: true },
        })
      }

      logger.error('post-report insert failed', { error: insertError.message })
      return Response.json(
        { success: false, error: 'Failed to submit report' },
        { status: 500 }
      )
    }

    return Response.json(
      { success: true, data: { reported: true } },
      { status: 201 }
    )
  } catch (error: unknown) {
    logger.error('post-report error', { error: errorMessage(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
