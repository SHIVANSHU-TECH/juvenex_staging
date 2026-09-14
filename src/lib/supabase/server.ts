import { headers } from 'next/headers'
import { z } from 'zod'
import { verifyToken } from '@/lib/jwt'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  organization_id: string | null
}

// Strict Zod schema for the profile row backing every authenticated request.
// Replaces a `data as ProfileWithBan` cast — a cast would silently let a
// schema drift turn `banned_at` into `undefined`, which `!== null` evaluates
// truthy → banned account passes through. With a Zod safeParse we fail-closed
// (return null → 401) when the row shape doesn't match.
const profileWithBanSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.string(),
  organization_id: z.string().uuid().nullable(),
  banned_at: z.string().nullable(),
})

export async function getAuthUser(): Promise<AuthUser | null> {
  const headersList = await headers()
  const auth = headersList.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const payload = verifyToken(token)
  if (!payload) return null

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, organization_id, banned_at')
    .eq('id', payload.userId)
    .single()

  if (error || !data) return null

  // Validate the row against the strict schema. On drift, fail-closed: log and
  // refuse the request rather than letting a banned/incomplete profile
  // through.
  const parsed = profileWithBanSchema.safeParse(data)
  if (!parsed.success) {
    logger.error('getAuthUser: profile row failed schema validation', {
      userId: payload.userId,
      issues: parsed.error.flatten(),
    })
    return null
  }
  const profile = parsed.data

  // Hard-block banned accounts at the auth boundary so a banned user holding
  // a still-valid JWT cannot continue to access protected resources. The token
  // itself remains technically valid; ban check is server-side on every request.
  if (profile.banned_at !== null) {
    return null
  }

  // `name` may be null in the DB but the AuthUser contract has it as string;
  // coerce a null to '' so downstream code doesn't have to handle both shapes.
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name ?? '',
    role: profile.role,
    organization_id: profile.organization_id,
  }
}
