import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAdmin, getServiceSupabase } from '@/lib/org-admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'

// POST /api/org/[slug]/admin/members/[userId]
// Actions scoped to this organization:
//   - promote: patient -> org_admin (within this org; member must already be org member)
//   - demote: org_admin -> patient
//   - remove: set organization_id = NULL (leaves the global profile intact)

const bodySchema = z.object({
  action: z.enum(['promote', 'demote', 'remove']),
})

// Use Zod's UUID validator rather than a permissive [0-9a-f-]{36} regex —
// the regex would happily accept things like '----------------------------' or
// the all-zero Nil UUID; .uuid() applies the proper RFC 4122 shape check.
const userIdSchema = z.string().uuid()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  try {
    const { slug, userId } = await params

    const idParse = userIdSchema.safeParse(userId)
    if (!idParse.success) {
      return Response.json(
        { success: false, error: 'Invalid user id' },
        { status: 400 }
      )
    }

    const ctx = await authorizeOrgAdmin(slug)
    if (ctx instanceof Response) return ctx
    const { org, user } = ctx

    const rl = rateLimit(
      `org-admin-member-action:${user.id}:${org.id}`,
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

    // Confirm the target is a member of THIS org — org_admins cannot act on
    // users who belong to a different organization, and we refuse to act on
    // super_admins from an org_admin context.
    const { data: target, error: targetErr } = await supabase
      .from('profiles')
      .select('id, role, organization_id')
      .eq('id', idParse.data)
      .maybeSingle()

    if (targetErr) {
      logger.error('org-admin member-action fetch error', {
        error: targetErr.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!target) {
      return Response.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const targetRow = target as {
      id: string
      role: string
      organization_id: string | null
    }

    if (targetRow.organization_id !== org.id) {
      return Response.json(
        { success: false, error: 'User is not a member of this organization' },
        { status: 404 }
      )
    }

    if (targetRow.role === 'super_admin') {
      return Response.json(
        { success: false, error: 'Cannot modify a super admin' },
        { status: 403 }
      )
    }

    if (targetRow.id === user.id) {
      return Response.json(
        { success: false, error: 'Cannot modify your own membership' },
        { status: 400 }
      )
    }

    // Build patch per action.
    let patch: Record<string, string | null> = {}
    switch (action) {
      case 'promote':
        if (targetRow.role === 'org_admin') {
          return Response.json(
            { success: false, error: 'User is already an org admin' },
            { status: 409 }
          )
        }
        patch = { role: 'org_admin' }
        break
      case 'demote':
        if (targetRow.role !== 'org_admin') {
          return Response.json(
            { success: false, error: 'User is not an org admin' },
            { status: 409 }
          )
        }
        patch = { role: 'patient' }
        break
      case 'remove':
        // Null out org membership and clear any per-org ban flag so the user
        // isn't left in a weird "banned from org X but belongs to nobody"
        // state. Their global account is untouched.
        patch = { organization_id: null, banned_from_org_at: null }
        break
    }

    const { data: updated, error: updateErr } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', targetRow.id)
      .select('id, name, email, role, organization_id, banned_from_org_at')
      .single()

    if (updateErr || !updated) {
      logger.error('org-admin member-action update error', {
        error: updateErr?.message,
      })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    // HIPAA §164.312(b): record this destructive membership action.
    await logAudit({
      userId: user.id,
      action: `org_admin.member.${action}`,
      resourceType: 'profile',
      resourceId: targetRow.id,
      details: { org_id: org.id, previous_role: targetRow.role },
    })

    return Response.json({ success: true, data: { member: updated, action } })
  } catch (error: unknown) {
    logger.error('org-admin member-action error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
