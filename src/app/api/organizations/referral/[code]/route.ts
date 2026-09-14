import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/organizations/referral/[code] - Public: look up org by referral code
// Returns org name, logo, primary_color for white-label branding.
// No authentication required.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    if (!code || code.length < 2) {
      return Response.json(
        { success: false, error: 'Invalid referral code' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()
    const { data: org, error } = await supabase
      .from('organizations')
      .select('id, name, slug, logo_url, primary_color')
      .eq('referral_code', code)
      .maybeSingle()

    if (error) {
      logger.error('Organization referral fetch error', { error: error.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!org) {
      return Response.json(
        { success: false, error: 'Organization not found for this referral code' },
        { status: 404 }
      )
    }

    return Response.json({ success: true, data: org })
  } catch (error: unknown) {
    logger.error('Organization referral error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
