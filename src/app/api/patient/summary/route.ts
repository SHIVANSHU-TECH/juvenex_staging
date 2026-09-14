import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const FOOD_LOG_COLUMNS = 'logged_at, calories, blood_sugar'
const PROFILE_COLUMNS = 'current_weight, target_weight, starting_weight'
const WEIGHT_ENTRY_COLUMNS = 'weight_lbs, recorded_on'

interface FoodLogRow {
  logged_at: string | null
  calories: number | null
  blood_sugar: number | null
}

interface ProfileRow {
  current_weight: number | null
  target_weight: number | null
  starting_weight: number | null
}

interface WeightEntryRow {
  weight_lbs: number | null
  recorded_on: string
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfUtcDay(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function formatNumber(value: number, fractionDigits = 0): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  })
}

// Round to 1 decimal, dropping a trailing ".0" (so 5.3 → "5.3", 5 → "5").
function oneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function finiteNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export async function GET(_request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`patient-summary:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const supabase = createAdminClient()
    const now = new Date()
    const todayStart = startOfUtcDay(now)
    const tomorrowStart = addUtcDays(todayStart, 1)
    const streakWindowStart = addUtcDays(todayStart, -59)
    const glucoseWindowStart = addUtcDays(todayStart, -29)

    // Weight progress is driven by the standalone weight_entries table (migration
    // 040) — the surface the user actually logs into via the Profile weight graph.
    // Previously this derived start/current from progress_photos.weight, so logging
    // a weight never moved the dashboard "lbs Lost" stat (the logs "didn't change").
    const [foodRes, profileRes, weightsRes] = await Promise.all([
      supabase
        .from('food_logs')
        .select(FOOD_LOG_COLUMNS)
        .eq('user_id', user.id)
        .gte('logged_at', streakWindowStart.toISOString()),
      supabase
        .from('patient_profiles')
        .select(PROFILE_COLUMNS)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('weight_entries')
        .select(WEIGHT_ENTRY_COLUMNS)
        .eq('user_id', user.id)
        .order('recorded_on', { ascending: true })
        .limit(365),
    ])

    if (foodRes.error || profileRes.error || weightsRes.error) {
      logger.error('Patient summary query error', {
        foodError: foodRes.error?.message,
        profileError: profileRes.error?.message,
        weightsError: weightsRes.error?.message,
        userId: user.id,
      })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    const foodLogs = (foodRes.data ?? []) as FoodLogRow[]
    const profile = profileRes.data as ProfileRow | null
    const weightRows = (weightsRes.data ?? []) as WeightEntryRow[]

    const loggedDays = new Set(
      foodLogs
        .map((row) => (row.logged_at ? utcDayKey(new Date(row.logged_at)) : null))
        .filter((key): key is string => Boolean(key))
    )
    let streak = 0
    for (let cursor = todayStart; loggedDays.has(utcDayKey(cursor)); cursor = addUtcDays(cursor, -1)) {
      streak += 1
    }

    const todaysCalories = foodLogs
      .filter((row) => {
        if (!row.logged_at) return false
        const loggedAt = new Date(row.logged_at)
        return loggedAt >= todayStart && loggedAt < tomorrowStart
      })
      .reduce((sum, row) => sum + (finiteNumber(row.calories) ?? 0), 0)

    const glucoseReadings = foodLogs
      .filter((row) => {
        if (!row.logged_at || row.blood_sugar == null) return false
        return new Date(row.logged_at) >= glucoseWindowStart
      })
      .map((row) => finiteNumber(row.blood_sugar))
      .filter((value): value is number => value != null)
      .filter((value) => Number.isFinite(value) && value > 0)
    const estimatedA1c =
      glucoseReadings.length > 0
        ? (glucoseReadings.reduce((sum, value) => sum + value, 0) / glucoseReadings.length + 46.7) / 28.7
        : null

    const firstLoggedWeight = finiteNumber(weightRows[0]?.weight_lbs)
    const lastLoggedWeight = finiteNumber(weightRows[weightRows.length - 1]?.weight_lbs)
    // Latest check-in is the source of truth for "current"; fall back to the
    // stored profile weight when no entries exist yet.
    const currentWeight = lastLoggedWeight ?? finiteNumber(profile?.current_weight)
    // Baseline is the explicit starting weight, else the first logged entry.
    const startingWeight = finiteNumber(profile?.starting_weight) ?? firstLoggedWeight
    const targetWeight = finiteNumber(profile?.target_weight)
    const poundsLost =
      startingWeight != null && currentWeight != null ? startingWeight - currentWeight : null

    // Directional goal progress: works for both loss (start > target) and gain
    // (start < target). Moving the wrong way clamps to 0; reaching/passing the
    // target clamps to 100. Guards the degenerate start == target case so a
    // meaningless 0% is never shown just because the baseline equals the target.
    let goalPercent: number | null = null
    if (
      startingWeight != null &&
      targetWeight != null &&
      currentWeight != null &&
      Math.abs(startingWeight - targetWeight) > 0.001
    ) {
      const needed = startingWeight - targetWeight
      const achieved = startingWeight - currentWeight
      goalPercent = Math.max(0, Math.min(100, Math.round((achieved / needed) * 100)))
    }

    return Response.json({
      success: true,
      data: {
        stats: [
          { key: 'streak', value: formatNumber(streak), label: 'Day Streak' },
          {
            key: 'weight',
            // Signed weight change so both loss (−) and gain (+) show correctly.
            // Match the profile header + weight graph: 1 decimal of precision
            // but no trailing ".0" (was 0 decimals, so dashboard showed "-5"
            // while profile showed "-5.3" for the same data).
            value:
              poundsLost == null
                ? '--'
                : poundsLost > 0
                  ? `-${oneDecimal(poundsLost)}`
                  : poundsLost < 0
                    ? `+${oneDecimal(Math.abs(poundsLost))}`
                    : '0',
            label: 'lbs +/-',
          },
          {
            key: 'calories',
            value: formatNumber(todaysCalories),
            label: "Today's Cal",
          },
          {
            key: 'a1c',
            value: estimatedA1c == null ? '--' : formatNumber(estimatedA1c, 1),
            label: 'A1C Est.',
          },
        ],
        goal: {
          startingWeight,
          currentWeight,
          targetWeight,
          goalPercent,
        },
      },
    })
  } catch (error: unknown) {
    logger.error('Patient summary unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
