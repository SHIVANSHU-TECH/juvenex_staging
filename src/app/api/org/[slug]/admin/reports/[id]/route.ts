import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAdmin, getServiceSupabase } from '@/lib/org-admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'

// POST /api/org/[slug]/admin/reports/[id]
// Moderation actions scoped to THIS organization. The reported post's author
// must be a member of this org; otherwise the action is rejected.
//
//   - dismiss: post_reports.status = 'dismissed' (no post change)
//   - hide:    post.is_public = false AND post_reports.status = 'reviewed'
//   - ban:     profiles.banned_from_org_at = now() for the post's author
//              AND hide the post AND mark the report 'reviewed'.
//              This is a PER-ORG ban, not a global ban — profiles.banned_at
//              is untouched.

const bodySchema = z.object({
  action: z.enum(['dismiss', 'hide', 'ban']),
})

// Use Zod's built-in UUID validator instead of a hand-rolled regex — it
// correctly rejects the Nil UUID and enforces the version/variant nibbles
// where appropriate, and surfaces the same input through .safeParse so
// downstream usage sees a typed string.
const reportIdSchema = z.string().uuid()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params

    const idParse = reportIdSchema.safeParse(id)
    if (!idParse.success) {
      return Response.json(
        { success: false, error: 'Invalid report id' },
        { status: 400 }
      )
    }

    const ctx = await authorizeOrgAdmin(slug)
    if (ctx instanceof Response) return ctx
    const { org, user } = ctx

    const rl = rateLimit(
      `org-admin-report-action:${user.id}:${org.id}`,
      30,
      60_000
    )
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const body: unknown = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(body)
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

    const { action } = parsed.data
    const supabase = getServiceSupabase()

    // Fetch report + its post + author
    const { data: report, error: reportErr } = await supabase
      .from('post_reports')
      .select('id, post_id, status')
      .eq('id', idParse.data)
      .maybeSingle()

    if (reportErr) {
      logger.error('org-admin report-action fetch error', {
        error: reportErr.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!report) {
      return Response.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      )
    }

    const reportRow = report as {
      id: string
      post_id: string
      status: string
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, user_id')
      .eq('id', reportRow.post_id)
      .maybeSingle()

    // A DB error here would otherwise masquerade as a 404 — destructure and
    // surface as 500 so we don't conflate "not found" with "lookup failed".
    if (postError) {
      logger.error('org-admin report-action post fetch error', {
        error: postError.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!post) {
      return Response.json(
        { success: false, error: 'Reported post not found' },
        { status: 404 }
      )
    }

    const postRow = post as { id: string; user_id: string }

    // Verify the post author is a member of THIS org (scope enforcement).
    const { data: author, error: authorError } = await supabase
      .from('profiles')
      .select('id, role, organization_id')
      .eq('id', postRow.user_id)
      .maybeSingle()

    if (authorError) {
      logger.error('org-admin report-action author fetch error', {
        error: authorError.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!author) {
      return Response.json(
        { success: false, error: 'Post author not found' },
        { status: 404 }
      )
    }

    const authorRow = author as {
      id: string
      role: string
      organization_id: string | null
    }

    if (authorRow.organization_id !== org.id) {
      return Response.json(
        {
          success: false,
          error: 'Post author is not a member of this organization',
        },
        { status: 403 }
      )
    }

    // Never let an org_admin moderate a super_admin.
    if (authorRow.role === 'super_admin') {
      return Response.json(
        { success: false, error: 'Cannot moderate a super admin' },
        { status: 403 }
      )
    }

    // Apply the action.
    switch (action) {
      case 'dismiss': {
        const { error } = await supabase
          .from('post_reports')
          .update({ status: 'dismissed' })
          .eq('id', reportRow.id)
        if (error) {
          logger.error('org-admin report dismiss error', {
            error: error.message,
          })
          return Response.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
          )
        }
        // HIPAA §164.312(b): record this destructive moderation action.
        await logAudit({
          userId: user.id,
          action: 'org_admin.report.dismiss',
          resourceType: 'post_report',
          resourceId: reportRow.id,
          details: { org_id: org.id, post_id: postRow.id },
        })
        break
      }
      case 'hide': {
        const { error: postErr } = await supabase
          .from('posts')
          .update({ is_public: false })
          .eq('id', postRow.id)
        if (postErr) {
          logger.error('org-admin report hide error', {
            error: postErr.message,
          })
          return Response.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
          )
        }
        const { error: reportErr2 } = await supabase
          .from('post_reports')
          .update({ status: 'reviewed' })
          .eq('id', reportRow.id)
        if (reportErr2) {
          logger.error('org-admin report hide report-update error', {
            error: reportErr2.message,
          })
          return Response.json(
            { success: false, error: 'Post hidden but report update failed' },
            { status: 500 }
          )
        }
        // HIPAA §164.312(b): record this destructive moderation action.
        await logAudit({
          userId: user.id,
          action: 'org_admin.report.hide_post',
          resourceType: 'post',
          resourceId: postRow.id,
          details: {
            org_id: org.id,
            report_id: reportRow.id,
            post_author_id: postRow.user_id,
          },
        })
        break
      }
      case 'ban': {
        // Per-org ban: set banned_from_org_at only. Do NOT touch
        // profiles.banned_at (that's super_admin-only, global).
        const { error: banErr } = await supabase
          .from('profiles')
          .update({ banned_from_org_at: new Date().toISOString() })
          .eq('id', authorRow.id)
        if (banErr) {
          logger.error('org-admin report ban error', { error: banErr.message })
          return Response.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
          )
        }

        // Hide the offending post — explicit error check, no fire-and-forget.
        const { error: hideErr } = await supabase
          .from('posts')
          .update({ is_public: false })
          .eq('id', postRow.id)
        if (hideErr) {
          logger.error('org-admin report ban hide-post error', {
            error: hideErr.message,
          })
          return Response.json(
            { success: false, error: 'User banned but post hide failed' },
            { status: 500 }
          )
        }

        // Mark the report reviewed — same: no fire-and-forget.
        const { error: reportUpdErr } = await supabase
          .from('post_reports')
          .update({ status: 'reviewed' })
          .eq('id', reportRow.id)
        if (reportUpdErr) {
          logger.error('org-admin report ban report-update error', {
            error: reportUpdErr.message,
          })
          return Response.json(
            {
              success: false,
              error: 'User banned and post hidden, but report update failed',
            },
            { status: 500 }
          )
        }
        // HIPAA §164.312(b): record this destructive moderation + ban action.
        await logAudit({
          userId: user.id,
          action: 'org_admin.report.ban_user',
          resourceType: 'profile',
          resourceId: authorRow.id,
          details: {
            org_id: org.id,
            report_id: reportRow.id,
            post_id: postRow.id,
          },
        })
        break
      }
    }

    return Response.json({ success: true, data: { action } })
  } catch (error: unknown) {
    logger.error('org-admin report-action error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
