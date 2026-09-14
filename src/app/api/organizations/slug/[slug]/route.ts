import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/organizations/slug/[slug] - Public: look up org by slug
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    if (!slug || slug.length < 2) {
      return Response.json(
        { success: false, error: 'Invalid slug' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()
    const { data: org, error } = await supabase
      .from('organizations')
      .select('id, name, slug, logo_url, primary_color')
      .eq('slug', slug)
      .maybeSingle()

    if (error) {
      logger.error('Organization slug fetch error', { error: error.message })
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

    return Response.json({ success: true, data: org })
  } catch (error: unknown) {
    logger.error('Organization slug error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
