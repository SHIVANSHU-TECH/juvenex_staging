import { createClient } from '@supabase/supabase-js'

// Admin client with service role key - use ONLY in server-side code
export function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('SUPABASE_URL required')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SERVICE_ROLE_KEY required')

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
