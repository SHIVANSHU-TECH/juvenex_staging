import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

// Explicit SELECT list — never use '*'. Includes blood_sugar because it is a
// real column on food_logs and is surfaced in API responses.
const FOOD_LOG_COLUMNS =
  'id, user_id, meal_type, food, calories, protein, carbs, fat, fiber, blood_sugar, logged_at, notes'

interface FoodLogRow {
  id: string
  user_id: string
  food: string
  meal_type: string
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  blood_sugar: number | null
  notes: string | null
  logged_at: string
  created_at: string
}

interface DailyTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const foodLogCreateSchema = z.object({
  food: z.string().min(1, 'Food name is required'),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  calories: z.number().int().min(0).optional(),
  protein: z.number().min(0).optional(),
  carbs: z.number().min(0).optional(),
  fat: z.number().min(0).optional(),
  fiber: z.number().min(0).optional(),
  blood_sugar: z.number().min(0).optional(),
  notes: z.string().optional(),
  logged_at: z.string().datetime().optional(),
})

const foodLogUpdateSchema = foodLogCreateSchema.partial()

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const rl = rateLimit(`food-log:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const parsed = foodLogCreateSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const d = parsed.data
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('food_logs')
      .insert({
        user_id: user.id,
        food: d.food,
        meal_type: d.meal_type,
        calories: d.calories ?? null,
        protein: d.protein ?? null,
        carbs: d.carbs ?? null,
        fat: d.fat ?? null,
        fiber: d.fiber ?? null,
        blood_sugar: d.blood_sugar ?? null,
        notes: d.notes ?? null,
        logged_at: d.logged_at ?? new Date().toISOString(),
      })
      .select(FOOD_LOG_COLUMNS)
      .single()

    if (error) {
      logger.error('food-log POST insert error', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    const row = data as FoodLogRow
    await logAudit({
      userId: user.id,
      action: 'food_log_create',
      resourceType: 'food_log',
      resourceId: row?.id,
    })

    return Response.json({ success: true, data: row }, { status: 201 })
  } catch (error: unknown) {
    logger.error('food-log POST error', { error: error instanceof Error ? error.message : String(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const rlGet = rateLimit(`food-log-get:${user.id}`, 120, 60_000)
    if (!rlGet.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const date = searchParams.get('date')
    const supabase = getSupabase()

    let entries: FoodLogRow[]

    if (date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(date)) {
        return Response.json(
          { success: false, error: 'Invalid date format. Use YYYY-MM-DD.' },
          { status: 400 }
        )
      }
      const nextDay = new Date(date + 'T00:00:00Z')
      nextDay.setUTCDate(nextDay.getUTCDate() + 1)
      const nextDayStr = nextDay.toISOString().split('T')[0]

      const { data } = await supabase
        .from('food_logs')
        .select(FOOD_LOG_COLUMNS)
        .eq('user_id', user.id)
        .gte('logged_at', `${date}T00:00:00.000Z`)
        .lt('logged_at', `${nextDayStr}T00:00:00.000Z`)
        .order('logged_at', { ascending: true })
        .limit(500)

      entries = (data ?? []) as FoodLogRow[]
    } else {
      // Default to last 30 days if no date filter
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const { data } = await supabase
        .from('food_logs')
        .select(FOOD_LOG_COLUMNS)
        .eq('user_id', user.id)
        .gte('logged_at', thirtyDaysAgo.toISOString())
        .order('logged_at', { ascending: true })
        .limit(100)

      entries = (data ?? []) as FoodLogRow[]
    }

    const dailyTotals: DailyTotals = entries.reduce(
      (acc, entry) => ({
        calories: acc.calories + (entry.calories ?? 0),
        protein: acc.protein + (entry.protein ?? 0),
        carbs: acc.carbs + (entry.carbs ?? 0),
        fat: acc.fat + (entry.fat ?? 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )

    await logAudit({
      userId: user.id,
      action: 'food_log_view',
      resourceType: 'food_log',
    })

    return Response.json({
      success: true,
      data: { entries, dailyTotals },
    })
  } catch (error: unknown) {
    logger.error('food-log GET error', { error: error instanceof Error ? error.message : String(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const rl = rateLimit(`food-log:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const entryId = searchParams.get('entryId')

    if (!entryId) {
      return Response.json(
        { success: false, error: 'entryId query parameter is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const parsed = foodLogUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    // Verify ownership
    const { data: existing } = await supabase
      .from('food_logs')
      .select('id')
      .eq('id', entryId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existing) {
      return Response.json(
        { success: false, error: 'Entry not found or access denied' },
        { status: 404 }
      )
    }

    const ALLOWED_FOOD_LOG_COLUMNS = new Set([
      'food', 'meal_type', 'calories', 'protein', 'carbs',
      'fat', 'fiber', 'blood_sugar', 'notes', 'logged_at',
    ])

    // Build update payload from validated fields
    const updateFields: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) {
        if (!ALLOWED_FOOD_LOG_COLUMNS.has(key)) {
          return Response.json(
            { success: false, error: `Invalid column: ${key}` },
            { status: 400 }
          )
        }
        updateFields[key] = value
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return Response.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('food_logs')
      .update(updateFields)
      .eq('id', entryId)
      .eq('user_id', user.id)
      .select(FOOD_LOG_COLUMNS)
      .single()

    if (error) {
      logger.error('food-log PUT update error', { error: error.message })
      return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
    }

    await logAudit({
      userId: user.id,
      action: 'food_log_update',
      resourceType: 'food_log',
      resourceId: entryId,
    })

    return Response.json({ success: true, data: data as FoodLogRow })
  } catch (error: unknown) {
    logger.error('food-log PUT error', { error: error instanceof Error ? error.message : String(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const entryId = searchParams.get('entryId')

    if (!entryId) {
      return Response.json(
        { success: false, error: 'entryId query parameter is required' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    // Verify ownership before deleting
    const { data: existing } = await supabase
      .from('food_logs')
      .select('id')
      .eq('id', entryId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existing) {
      return Response.json(
        { success: false, error: 'Entry not found or access denied' },
        { status: 404 }
      )
    }

    await supabase
      .from('food_logs')
      .delete()
      .eq('id', entryId)
      .eq('user_id', user.id)

    await logAudit({
      userId: user.id,
      action: 'food_log_delete',
      resourceType: 'food_log',
      resourceId: entryId,
    })

    return Response.json({ success: true, message: 'Entry deleted successfully' })
  } catch (error: unknown) {
    logger.error('food-log DELETE error', { error: error instanceof Error ? error.message : String(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
