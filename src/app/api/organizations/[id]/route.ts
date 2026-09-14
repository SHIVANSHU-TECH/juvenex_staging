import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/organizations/[id] - Organization details + stats
export async function GET(
  _request: Request,
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

    const { id } = await params

    // Tenant isolation: only the org's own members (or super_admin) may read
    // its details + stats.
    if (user.role !== 'super_admin' && (user.organization_id ?? null) !== id) {
      return Response.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    const supabase = getSupabase()

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, slug, type, logo_url, primary_color, phone, email, created_at')
      .eq('id', id)
      .maybeSingle()

    if (orgError) {
      logger.error('Organization fetch error', { error: orgError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!org) {
      return Response.json(
        { success: false, error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Fetch patient count for the organization
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id)

    const stats = { patient_count: count ?? 0 }

    return Response.json({
      success: true,
      data: { ...org, stats },
    })
  } catch (error: unknown) {
    logger.error('Organization error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
