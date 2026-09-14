import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'

// POST /api/admin/reports/[id]
// Body: { action: 'dismiss' | 'hide' | 'ban' }
// Auth: super_admin only.
//
// Actions:
//   dismiss → report.status = 'dismissed'
//   hide    → post.is_public = false AND report.status = 'reviewed'
//   ban     → post author's profiles.banned_at = now() AND report.status = 'reviewed'
//
// Each successful mutation writes one audit_logs row.

const bodySchema = z.object({
  action: z.enum(['dismiss', 'hide', 'ban']),
})

const idSchema = z.string().uuid('Invalid report id')

// Zod schemas for the rows we read in admin moderation. Casts on these rows
// drive destructive mutations (hide post, ban user); a silent schema drift
// must NOT slip through. Use safeParse and fail-closed (500) on mismatch.
const reportRowSchema = z.object({
  id: z.string().uuid(),
  post_id: z.string().uuid(),
  reporter_id: z.string().uuid(),
  status: z.string(),
})
type ReportRow = z.infer<typeof reportRowSchema>

const postRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  is_public: z.boolean(),
})
type PostRow = z.infer<typeof postRowSchema>

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

    if (user.role !== 'super_admin') {
      return Response.json(
        { success: false, error: 'Forbidden: super_admin role required' },
        { status: 403 }
      )
    }

    const rl = rateLimit(`admin-report-action:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const { id } = await params
    const idParse = idSchema.safeParse(id)
    if (!idParse.success) {
      return Response.json(
        { success: false, error: 'Invalid report id' },
        { status: 400 }
      )
    }

    const rawBody: unknown = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(rawBody)
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
    const supabase = createAdminClient()

    // Load the report first so downstream mutations have the needed context.
    const { data: reportData, error: reportError } = await supabase
      .from('post_reports')
      .select('id, post_id, reporter_id, status')
      .eq('id', idParse.data)
      .maybeSingle()

    if (reportError) {
      logger.error('Admin report fetch error', { error: reportError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    if (!reportData) {
      return Response.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      )
    }
    const reportParse = reportRowSchema.safeParse(reportData)
    if (!reportParse.success) {
      logger.error('Admin report row failed schema validation', {
        reportId: idParse.data,
        issues: reportParse.error.flatten(),
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    const report: ReportRow = reportParse.data

    if (action === 'dismiss') {
      const { error: updErr } = await supabase
        .from('post_reports')
        .update({ status: 'dismissed' })
        .eq('id', report.id)
      if (updErr) {
        logger.error('Admin report dismiss error', { error: updErr.message })
        return Response.json(
          { success: false, error: 'Failed to dismiss report' },
          { status: 500 }
        )
      }
      await logAudit({
        userId: user.id,
        action: 'admin.report.dismiss',
        resourceType: 'post_report',
        resourceId: report.id,
        details: { post_id: report.post_id },
      })
      return Response.json({
        success: true,
        data: { report_id: report.id, new_status: 'dismissed' },
      })
    }

    // hide and ban both require loading the post.
    const { data: postData, error: postError } = await supabase
      .from('posts')
      .select('id, user_id, is_public')
      .eq('id', report.post_id)
      .maybeSingle()

    if (postError) {
      logger.error('Admin report post fetch error', { error: postError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    if (!postData) {
      return Response.json(
        { success: false, error: 'Reported post not found' },
        { status: 404 }
      )
    }
    const postParse = postRowSchema.safeParse(postData)
    if (!postParse.success) {
      logger.error('Admin report post row failed schema validation', {
        postId: report.post_id,
        issues: postParse.error.flatten(),
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
    const post: PostRow = postParse.data

    if (action === 'hide') {
      const { error: hideErr } = await supabase
        .from('posts')
        .update({ is_public: false })
        .eq('id', post.id)
      if (hideErr) {
        logger.error('Admin report hide error', { error: hideErr.message })
        return Response.json(
          { success: false, error: 'Failed to hide post' },
          { status: 500 }
        )
      }

      const { error: updErr } = await supabase
        .from('post_reports')
        .update({ status: 'reviewed' })
        .eq('id', report.id)
      if (updErr) {
        logger.error('Admin report update-after-hide error', {
          error: updErr.message,
        })
        return Response.json(
          { success: false, error: 'Post hidden but report update failed' },
          { status: 500 }
        )
      }

      await logAudit({
        userId: user.id,
        action: 'admin.report.hide_post',
        resourceType: 'post',
        resourceId: post.id,
        details: { report_id: report.id, post_author_id: post.user_id },
      })
      return Response.json({
        success: true,
        data: { report_id: report.id, new_status: 'reviewed', post_id: post.id },
      })
    }

    // action === 'ban'
    const bannedAt = new Date().toISOString()
    const { error: banErr } = await supabase
      .from('profiles')
      .update({ banned_at: bannedAt })
      .eq('id', post.user_id)
    if (banErr) {
      logger.error('Admin report ban error', { error: banErr.message })
      return Response.json(
        { success: false, error: 'Failed to ban user' },
        { status: 500 }
      )
    }

    const { error: updErr } = await supabase
      .from('post_reports')
      .update({ status: 'reviewed' })
      .eq('id', report.id)
    if (updErr) {
      logger.error('Admin report update-after-ban error', {
        error: updErr.message,
      })
      return Response.json(
        { success: false, error: 'User banned but report update failed' },
        { status: 500 }
      )
    }

    await logAudit({
      userId: user.id,
      action: 'admin.report.ban_user',
      resourceType: 'profile',
      resourceId: post.user_id,
      details: { report_id: report.id, post_id: post.id, banned_at: bannedAt },
    })
    return Response.json({
      success: true,
      data: {
        report_id: report.id,
        new_status: 'reviewed',
        banned_user_id: post.user_id,
      },
    })
  } catch (error: unknown) {
    logger.error('Admin report action error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
