import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const rl = rateLimit(`forgot-password:${ip}`, 5, 60_000)
  if (!rl.success) {
    return NextResponse.json(
      { success: false, error: 'Too many reset requests. Please try again later.' },
      { status: 429 }
    )
  }

  try {
    const body = await request.json()
    const parsed = forgotPasswordSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid email' },
        { status: 400 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://juvenex.space'
    const { error } = await getSupabase().auth.resetPasswordForEmail(
      parsed.data.email,
      { redirectTo: `${appUrl.replace(/\/+$/, '')}/reset-password` }
    )

    if (error) {
      logger.warn('auth/forgot-password reset request failed', {
        error: error.message,
      })
    }

    // Always return success so the endpoint cannot be used to enumerate users.
    return NextResponse.json({
      success: true,
      message: 'If an account exists for that email, a reset link has been sent.',
    })
  } catch (error: unknown) {
    logger.error('auth/forgot-password error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
