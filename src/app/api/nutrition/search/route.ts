// GET /api/nutrition/search?q=<food name>
//
// Proxies a food-name lookup to USDA FoodData Central (see src/lib/nutrition.ts)
// and returns calorie + macro suggestions the food-log UI auto-fills into the
// add-meal form. Authenticated + rate-limited like the rest of the patient API.
//
// Degrades gracefully: when USDA_FDC_API_KEY is unset the route still returns
// 200 with { configured: false, results: [] } so the client keeps working as
// plain manual entry.

import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { searchNutrition } from '@/lib/nutrition'
import { getAuthUser } from '@/lib/supabase/server'

const querySchema = z.object({
  q: z.string().trim().min(2, 'Enter at least 2 characters').max(100),
})

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    // Search runs on every keystroke (debounced client-side) — keep the burst
    // limit generous but bounded to avoid hammering the upstream USDA quota.
    const rl = rateLimit(`nutrition-search:${user.id}`, 60, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const parsed = querySchema.safeParse({ q: request.nextUrl.searchParams.get('q') ?? '' })
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { configured, results } = await searchNutrition(parsed.data.q)

    return Response.json({ success: true, data: { configured, results } })
  } catch (error: unknown) {
    logger.error('nutrition/search GET error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
