import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { chatCompletion, isAIConfigured } from '@/lib/ai-client'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(_request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const rl = rateLimit(`ai-insights:${user.id}`, 10, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests.' }, { status: 429 })
    }

    if (!isAIConfigured()) {
      return Response.json({ success: false, error: 'AI service not configured' }, { status: 500 })
    }

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const supabase = getSupabase()

    const [foodLogsResult, profileResult] = await Promise.all([
      supabase
        .from('food_logs')
        .select('food, meal_type, calories, protein, carbs, fat, fiber, logged_at')
        .eq('user_id', user.id)
        .gte('logged_at', sevenDaysAgo.toISOString())
        .order('logged_at', { ascending: true }),
      supabase
        .from('patient_profiles')
        .select('current_weight, target_weight, height, age, gender, activity_level, diet_type, primary_goal')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    const foodLogs = (foodLogsResult.data ?? []) as Array<Record<string, unknown>>
    const profile = profileResult.data

    if (foodLogs.length === 0) {
      return Response.json({
        success: true,
        data: {
          insights: [{ type: 'getting_started', title: 'Start Logging Your Meals', message: 'Log your meals for at least a few days so we can provide personalized insights.' }],
          disclaimer:
            'This is not medical advice. Consult your healthcare provider for personalized guidance.',
        },
      })
    }

    const dailySummaries: Record<string, { calories: number; protein: number; carbs: number; fat: number; meals: number }> = {}
    for (const log of foodLogs) {
      const day = (log.logged_at as string).slice(0, 10)
      if (!dailySummaries[day]) dailySummaries[day] = { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 }
      dailySummaries[day].calories += (log.calories as number) ?? 0
      dailySummaries[day].protein += (log.protein as number) ?? 0
      dailySummaries[day].carbs += (log.carbs as number) ?? 0
      dailySummaries[day].fat += (log.fat as number) ?? 0
      dailySummaries[day].meals += 1
    }

    const dailyData = Object.entries(dailySummaries)
      .map(([date, t]) => `${date}: ${t.calories} kcal, ${t.protein}g protein, ${t.carbs}g carbs, ${t.fat}g fat (${t.meals} meals)`)
      .join('\n')

    const p = profile as Record<string, unknown> | null
    const profileContext = p
      ? `User Profile:\n- Goal: ${p.primary_goal ?? 'not set'}\n- Current weight: ${p.current_weight ?? 'not set'} lbs\n- Target weight: ${p.target_weight ?? 'not set'} lbs\n- Diet type: ${p.diet_type ?? 'not set'}`
      : 'No profile data available.'

    // These fields (weight, diet type, nutrition totals) are clinical facts,
    // NOT HIPAA identifiers — safe to send after the phi-sanitizer pass in
    // src/lib/ai-client.ts. Do not add clinic_name, provider_name, dob, or any
    // identifier here; the sanitizer runs on free text only.
    const prompt = `Analyze this GLP-1 medication user's recent food log data and provide exactly 2-3 actionable insights.\n\n${profileContext}\n\nFood Log (last 7 days):\n${dailyData}\n\nTotal meals logged: ${foodLogs.length}\n\nProvide 2-3 brief, specific insights. Each: { "type": "positive"|"improvement"|"tip", "title": "...", "message": "..." }\n\nReturn as JSON: { "insights": [...] }`

    const response = await chatCompletion({
      system: 'You are a supportive health coach. Analyze nutrition data and provide brief, encouraging insights. Always return valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 512,
    })

    const responseText = response.text
    let insights: Array<{ type: string; title: string; message: string }>
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON')
      insights = (JSON.parse(jsonMatch[0]) as { insights: typeof insights }).insights
    } catch {
      insights = [{ type: 'tip', title: 'Keep Up the Good Work', message: 'Continue tracking to get more detailed insights.' }]
    }

    const disclaimer =
      'This is not medical advice. Consult your healthcare provider for personalized guidance.'

    await logAudit({
      userId: user.id,
      action: 'ai_insights_view',
      resourceType: 'ai_conversation',
    })

    return Response.json({ success: true, data: { insights, disclaimer } })
  } catch (error: unknown) {
    logger.error('ai/insights error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
