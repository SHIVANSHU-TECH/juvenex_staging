// Daily weight tracking, decoupled from progress photos.
//   GET  /api/patient/weight        → the user's weight entries (chronological)
//   POST /api/patient/weight {weight}→ upsert today's entry (one row per day)
//
// Auth: logged-in owner only. Uses the service-role client and enforces
// ownership in code.

import { type NextRequest } from 'next/server'

import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'

interface WeightRow {
  id: string
  weight_lbs: number
  recorded_on: string
}

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('weight_entries')
      .select('id, weight_lbs, recorded_on')
      .eq('user_id', user.id)
      .order('recorded_on', { ascending: true })
      .limit(365)

    if (error) {
      logger.error('patient/weight GET failed', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }
    return Response.json({ success: true, data: { entries: (data ?? []) as WeightRow[] } })
  } catch (error: unknown) {
    logger.error('patient/weight GET threw', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const rl = rateLimit(`patient-weight:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const body = (await request.json().catch(() => null)) as { weight?: unknown } | null
    const weight = Number(body?.weight)
    if (!Number.isFinite(weight) || weight <= 0 || weight >= 2000) {
      return Response.json(
        { success: false, error: 'Enter a valid weight in pounds' },
        { status: 400 }
      )
    }
    // Round to one decimal — avoids noisy precision on the chart.
    const weightLbs = Math.round(weight * 10) / 10
    const recordedOn = new Date().toISOString().slice(0, 10)

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('weight_entries')
      .upsert(
        { user_id: user.id, weight_lbs: weightLbs, recorded_on: recordedOn },
        { onConflict: 'user_id,recorded_on' }
      )
      .select('id, weight_lbs, recorded_on')
      .single()

    if (error || !data) {
      logger.error('patient/weight POST failed', {
        userId: user.id,
        error: error?.message ?? 'no row',
      })
      return Response.json({ success: false, error: 'Could not save weight' }, { status: 500 })
    }

    // Keep the patient profile's current_weight in lockstep with the latest
    // check-in so the Profile/Dashboard stat cards (current / lbs lost / goal %)
    // reflect logged weight, not just the standalone graph. Best-effort: a
    // failure here must not fail the weight log itself.
    const { error: profileError } = await supabase
      .from('patient_profiles')
      .upsert(
        { user_id: user.id, current_weight: weightLbs, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    if (profileError) {
      logger.warn('patient/weight POST: current_weight sync failed', {
        userId: user.id,
        error: profileError.message,
      })
    }

    return Response.json({ success: true, data: { entry: data as WeightRow } })
  } catch (error: unknown) {
    logger.error('patient/weight POST threw', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/patient/weight?date=YYYY-MM-DD → remove the owner's entry for that
// day (lets a user correct a mistyped weight). Owner-scoped in code.
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const rl = rateLimit(`patient-weight-del:${user.id}`, 30, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const date = request.nextUrl.searchParams.get('date') ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json(
        { success: false, error: 'A valid date (YYYY-MM-DD) is required' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('weight_entries')
      .delete()
      .eq('user_id', user.id)
      .eq('recorded_on', date)

    if (error) {
      logger.error('patient/weight DELETE failed', { userId: user.id, error: error.message })
      return Response.json({ success: false, error: 'Could not delete entry' }, { status: 500 })
    }

    // Re-sync current_weight to the now-latest remaining entry (or clear it if
    // none remain) so the profile/dashboard stats stay consistent.
    const { data: latest } = await supabase
      .from('weight_entries')
      .select('weight_lbs')
      .eq('user_id', user.id)
      .order('recorded_on', { ascending: false })
      .limit(1)
      .maybeSingle()
    await supabase
      .from('patient_profiles')
      .upsert(
        {
          user_id: user.id,
          current_weight: (latest as { weight_lbs: number } | null)?.weight_lbs ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    return Response.json({ success: true, data: { deleted: date } })
  } catch (error: unknown) {
    logger.error('patient/weight DELETE threw', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
