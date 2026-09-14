import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { signToken } from '@/lib/jwt'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

// Hash email for audit logs — keeps forensic correlation across failed attempts
// without persisting a direct HIPAA identifier. First 16 hex chars is
// sufficient for bucketing; full hash kept for joins if ever needed.
function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16)
}

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown'
  const rateLimitKey = `login:${ip}`
  const rl = rateLimit(rateLimitKey, 5, 60_000)
  if (!rl.success) {
    return NextResponse.json(
      { success: false, error: 'Too many login attempts. Please try again later.' },
      { status: 429 }
    )
  }

  try {
    const body = await request.json()
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { email, password } = parsed.data
    const supabase = createAdminClient()

    // Sign in via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.user) {
      await logAudit({ userId: undefined, action: 'login_failed', resourceType: 'auth', details: { email_hash: hashEmail(email), reason: authError?.message || 'unknown' }, ipAddress: ip })
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Get profile from profiles table — including ban state so we can reject
    // suspended accounts before issuing a JWT. We MUST destructure the error
    // here: a transient DB error returning `data: null, error: <DBErr>` would
    // otherwise mean `bannedAt === null` and a banned user could be issued a
    // JWT. Fail-closed (500) instead of admitting a possibly-banned account.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email, phone, avatar_url, role, organization_id, banned_at')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      logger.error('auth/login profile fetch failed', {
        userId: authData.user.id,
        error: profileError?.message ?? 'profile missing',
      })
      // Best-effort: invalidate the just-issued Supabase session before
      // returning so we never leave a live session for a user we couldn't
      // verify.
      const accessToken = authData.session?.access_token
      if (accessToken) {
        try {
          await supabase.auth.admin.signOut(accessToken)
        } catch (signOutErr: unknown) {
          logger.warn('auth/login profile-error signout failed', {
            error: signOutErr instanceof Error ? signOutErr.message : 'unknown',
          })
        }
      }
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    // Banned accounts MUST NOT be allowed to obtain a session, regardless of
    // valid credentials. Invalidate the just-issued Supabase session via the
    // admin client and audit the rejection. We deliberately use a generic
    // "Account suspended" message to avoid leaking exact ban policy detail.
    const bannedAt = (profile as { banned_at: string | null }).banned_at ?? null
    if (bannedAt !== null) {
      // Guard the signOut call: passing an empty string when no session is
      // present would NOT invalidate the just-issued token (admin.signOut
      // requires a non-empty token), leaving a live JWT for a banned account.
      const accessToken = authData.session?.access_token
      if (accessToken) {
        try {
          await supabase.auth.admin.signOut(accessToken)
        } catch (signOutErr: unknown) {
          // Don't block the rejection on sign-out best-effort failure.
          logger.warn('auth/login banned signout failed', {
            error: signOutErr instanceof Error ? signOutErr.message : 'unknown',
          })
        }
      } else {
        logger.warn('auth/login banned user had no session to invalidate', {
          userId: authData.user.id,
        })
      }

      await logAudit({
        userId: authData.user.id,
        action: 'login_blocked_banned',
        resourceType: 'auth',
        details: { email_hash: hashEmail(email), banned_at: bannedAt },
        ipAddress: ip,
      })

      return NextResponse.json(
        { success: false, error: 'Account suspended. Contact support if you believe this is a mistake.' },
        { status: 403 }
      )
    }

    const token = signToken(authData.user.id)

    await logAudit({
      userId: authData.user.id,
      action: 'login',
      resourceType: 'auth',
      ipAddress: ip,
    })

    // Resolve the user's tenant slug so the client can enforce tenant isolation
    // (block being treated as signed-in on a different tenant).
    let organizationSlug: string | null = null
    if (profile.organization_id) {
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', profile.organization_id)
        .maybeSingle()
      organizationSlug = (orgRow?.slug as string | undefined) ?? null
    }

    const userPayload = {
      id: authData.user.id,
      email: authData.user.email || email,
      name: profile.name || authData.user.user_metadata?.name || '',
      role: profile.role || 'patient',
      organizationId: profile.organization_id || null,
      organizationSlug,
      phone: profile.phone || null,
      avatarUrl: profile.avatar_url || null,
    }

    // Envelope: `success` + `data` is the project standard. We also spread
    // `user` and `token` at the top level so existing clients reading
    // `json.user` / `json.token` continue to work during the transition.
    return NextResponse.json({
      success: true,
      data: { user: userPayload, token },
      user: userPayload,
      token,
    })
  } catch (error: unknown) {
    logger.error('auth/login error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
