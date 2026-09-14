import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { chatCompletion, isAIConfigured } from '@/lib/ai-client'
import { computeCalorieTarget, normalizeMealPlan } from '@/lib/meal-nutrition'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const generateRequestSchema = z.object({
  goal: z.string().optional(),
  dietary_restrictions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  meal_count: z.number().int().min(1).max(6).optional(),
  include_snacks: z.boolean().optional(),
  calorie_override: z.number().int().min(800).max(5000).optional(),
  // Optional body stats from the meal wizard. When present they override the
  // saved patient_profile for THIS plan's calorie-target computation, so a
  // user's in-wizard edits actually change the target (fixes the case where
  // the wizard collected stats that never reached the calculation).
  current_weight: z.number().positive().max(1500).optional(),
  height: z.number().positive().max(120).optional(),
  age: z.number().int().positive().max(120).optional(),
  gender: z.string().max(20).optional(),
  activity_level: z.string().max(40).optional(),
})

interface PatientProfile {
  current_weight: number | null
  target_weight: number | null
  height: number | null
  age: number | null
  gender: string | null
  activity_level: string | null
  diet_type: string | null
  primary_goal: string | null
  allergies: string[] | null
  restrictions: string[] | null
  conditions: string[] | null
  medications: string[] | null
}

const mealPlanJsonSchema = {
  type: 'object' as const,
  properties: {
    meals: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          meal_type: { type: 'string' as const, enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
          calories: { type: 'number' as const },
          protein: { type: 'number' as const },
          carbs: { type: 'number' as const },
          fat: { type: 'number' as const },
          fiber: { type: 'number' as const },
          ingredients: { type: 'array' as const, items: { type: 'string' as const } },
          prep_time: { type: 'string' as const },
          instructions: { type: 'string' as const },
        },
        required: ['name', 'meal_type', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'ingredients', 'prep_time', 'instructions'],
      },
    },
    recommendations: { type: 'array' as const, items: { type: 'string' as const } },
  },
  required: ['meals', 'recommendations'],
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })

    const rl = rateLimit(`meals-generate:${user.id}`, 10, 60_000)
    if (!rl.success) return Response.json({ success: false, error: 'Too many requests.' }, { status: 429 })

    const body = await request.json()
    const parsed = generateRequestSchema.safeParse(body)
    if (!parsed.success) return Response.json({ success: false, error: 'Validation failed', details: parsed.error.issues }, { status: 400 })

    const supabase = getSupabase()
    const { data: profile } = await supabase
      .from('patient_profiles')
      .select('current_weight, target_weight, height, age, gender, activity_level, diet_type, primary_goal, allergies, restrictions, conditions, medications')
      .eq('user_id', user.id)
      .single()

    const patientProfile: PatientProfile = profile ?? {
      current_weight: null, target_weight: null, height: null, age: null,
      gender: null, activity_level: null, diet_type: null, primary_goal: null,
      allergies: null, restrictions: null, conditions: null, medications: null,
    }

    // Wizard-supplied stats override the saved profile for this generation so
    // the user's in-wizard edits actually drive the target + the plan. gender
    // is normalized to lowercase (the wizard sends 'Male'/'Female').
    if (parsed.data.current_weight != null) patientProfile.current_weight = parsed.data.current_weight
    if (parsed.data.height != null) patientProfile.height = parsed.data.height
    if (parsed.data.age != null) patientProfile.age = parsed.data.age
    if (parsed.data.gender) patientProfile.gender = parsed.data.gender.toLowerCase()
    if (parsed.data.activity_level) patientProfile.activity_level = parsed.data.activity_level

    const goal = parsed.data.goal ?? patientProfile.primary_goal ?? 'weight_loss'
    const targetResult = computeCalorieTarget(patientProfile, goal)
    const calorieTarget = parsed.data.calorie_override ?? targetResult.target
    const allAllergies = [...(patientProfile.allergies ?? []), ...(parsed.data.allergies ?? [])]
    const allRestrictions = [...(patientProfile.restrictions ?? []), ...(parsed.data.dietary_restrictions ?? [])]
    const mealCount = parsed.data.meal_count ?? 3

    if (!isAIConfigured()) {
      // Fallback: generate a template meal plan without AI, then normalize so the
      // per-item calories are consistent and the day's total hits the target.
      const rawFallback = generateFallbackMealPlan(calorieTarget, goal, allAllergies, mealCount)
      const fallbackMeals = normalizeMealPlan(rawFallback, calorieTarget).meals
      const nutritionSummary = {
        daily_calories: calorieTarget,
        total_calories: fallbackMeals.reduce((s, m) => s + m.calories, 0),
        total_protein: fallbackMeals.reduce((s, m) => s + m.protein, 0),
        total_carbs: fallbackMeals.reduce((s, m) => s + m.carbs, 0),
        total_fat: fallbackMeals.reduce((s, m) => s + m.fat, 0),
      }

      const { data: savedPlan } = await supabase
        .from('meal_plans')
        .insert({
          user_id: user.id,
          plan: JSON.stringify({ meals: fallbackMeals, nutrition_summary: nutritionSummary }),
          request_params: JSON.stringify({ goal, allergies: allAllergies, restrictions: allRestrictions, meal_count: mealCount, calorie_target: calorieTarget }),
        })
        .select('id, created_at')
        .single()

      await logAudit({
        userId: user.id,
        action: 'meal_plan_generate',
        resourceType: 'meal_plan',
        resourceId: savedPlan?.id,
      })

      return Response.json({
        success: true,
        data: {
          id: savedPlan?.id,
          meals: fallbackMeals,
          nutrition_summary: nutritionSummary,
          recommendations: [
            'Drink at least 8 glasses of water daily',
            'Eat protein with every meal to stay fuller longer on GLP-1',
            'Take small bites and eat slowly — GLP-1 medications reduce appetite',
            'Personalized recommendations will be available soon for even better results',
          ],
          calorie_target: calorieTarget,
          target_basis: targetResult.basis,
          created_at: savedPlan?.created_at,
        },
      })
    }

    // These fields (weight, medications, diet type, etc.) are clinical facts,
    // NOT HIPAA identifiers — safe to send after the phi-sanitizer pass in
    // src/lib/ai-client.ts. Do not add clinic_name, provider_name, dob, or any
    // identifier here; the sanitizer runs on free text only.
    const prompt = `Generate a personalized daily meal plan with exactly ${mealCount} meals${parsed.data.include_snacks ? ' plus 1-2 snacks' : ''}.

User Profile:
- Goal: ${goal}
- Daily calorie target: ${calorieTarget} kcal
- Current weight: ${patientProfile.current_weight ?? 'not specified'} lbs
- Target weight: ${patientProfile.target_weight ?? 'not specified'} lbs
- Diet type: ${patientProfile.diet_type ?? 'no preference'}
- Medications: ${(patientProfile.medications ?? []).join(', ') || 'none'}

Allergies: ${allAllergies.length > 0 ? allAllergies.join(', ') : 'none'}
Restrictions: ${allRestrictions.length > 0 ? allRestrictions.join(', ') : 'none'}

CALORIE ACCURACY (critical — the user relies on these numbers):
- The day MUST total ${calorieTarget} kcal. The sum of every meal's "calories" must be within 5% of ${calorieTarget} (between ${Math.round(calorieTarget * 0.95)} and ${Math.round(calorieTarget * 1.05)} kcal). Do NOT come in low — under-eating is harmful.
- For EACH meal, "calories" MUST equal 4*protein + 4*carbs + 9*fat (grams), rounded. Verify this for every meal before answering.
- Use realistic per-item calories and portion sizes for the foods you list. A typical full meal is 350-700 kcal; a snack is 100-250 kcal. Distribute the ${calorieTarget} kcal across the meals so they add up correctly.

Other requirements:
- High protein (aim ~30% of calories), moderate carbs — ideal for GLP-1 users.
- Practical, easy-to-prepare meals that respect the allergies and restrictions above.
- Include 2-3 actionable recommendations.`

    const response = await chatCompletion({
      system:
        'You are a clinical nutritionist specializing in meal plans for GLP-1 medication users. ' +
        'You are meticulous about calorie math: every meal\'s calories equal 4*protein + 4*carbs + 9*fat (grams), ' +
        'and the meals sum to the requested daily target. Always return valid JSON via the provided tool.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2048,
      temperature: 0.4,
      tool: {
        name: 'output_meal_plan',
        description: 'Output the structured meal plan',
        parameters: mealPlanJsonSchema,
      },
    })

    if (!response.toolInput) {
      return Response.json({ success: false, error: 'Failed to generate meal plan' }, { status: 500 })
    }

    const mealPlanSchema = z.object({
      meals: z.array(
        z.object({
          name: z.string(),
          meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
          calories: z.number(),
          protein: z.number(),
          carbs: z.number(),
          fat: z.number(),
          fiber: z.number(),
          ingredients: z.array(z.string()),
          prep_time: z.string(),
          instructions: z.string(),
        })
      ),
      recommendations: z.array(z.string()),
    })

    const mealPlanParsed = mealPlanSchema.safeParse(response.toolInput)
    if (!mealPlanParsed.success) {
      return Response.json({ success: false, error: 'Failed to generate meal plan' }, { status: 500 })
    }
    const mealPlanData = mealPlanParsed.data

    // Validate + correct the model's calorie math: recompute each meal's calories
    // from its macros and scale the day to land on the target. This guarantees the
    // numbers the user sees are accurate even if the model's arithmetic drifted.
    const normalized = normalizeMealPlan(mealPlanData.meals, calorieTarget)
    if (normalized.adjusted) {
      logger.warn('meals/generate calorie math corrected', {
        userId: user.id,
        target: calorieTarget,
        modelTotal: mealPlanData.meals.reduce((s, m) => s + m.calories, 0),
        correctedTotal: normalized.totalCalories,
        scaleFactor: normalized.scaleFactor,
      })
    }
    const finalMeals = normalized.meals

    const nutritionSummary = {
      daily_calories: calorieTarget,
      total_calories: finalMeals.reduce((s, m) => s + m.calories, 0),
      total_protein: finalMeals.reduce((s, m) => s + m.protein, 0),
      total_carbs: finalMeals.reduce((s, m) => s + m.carbs, 0),
      total_fat: finalMeals.reduce((s, m) => s + m.fat, 0),
    }

    const { data: savedPlan } = await supabase
      .from('meal_plans')
      .insert({
        user_id: user.id,
        plan: JSON.stringify({ meals: finalMeals, nutrition_summary: nutritionSummary }),
        request_params: JSON.stringify({ goal, allergies: allAllergies, restrictions: allRestrictions, meal_count: mealCount, calorie_target: calorieTarget }),
      })
      .select('id, created_at')
      .single()

    await logAudit({
      userId: user.id,
      action: 'meal_plan_generate',
      resourceType: 'meal_plan',
      resourceId: savedPlan?.id,
    })

    return Response.json({
      success: true,
      data: {
        id: savedPlan?.id,
        meals: finalMeals,
        nutrition_summary: nutritionSummary,
        recommendations: mealPlanData.recommendations,
        calorie_target: calorieTarget,
        target_basis: targetResult.basis,
        created_at: savedPlan?.created_at,
      },
    })
  } catch (error: unknown) {
    logger.error('meals/generate POST error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 50)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)

    if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
      return Response.json({ success: false, error: 'Invalid pagination parameters' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data: plans } = await supabase
      .from('meal_plans')
      .select('id, plan, request_params, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { count } = await supabase
      .from('meal_plans')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    return Response.json({
      success: true,
      data: plans ?? [],
      meta: { total: count ?? 0, limit, offset },
    })
  } catch (error: unknown) {
    logger.error('meals/generate GET error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

function generateFallbackMealPlan(
  calorieTarget: number,
  goal: string,
  allergies: string[],
  mealCount: number
) {
  const allergySet = new Set(allergies.map(a => a.toLowerCase()))
  const breakfastCal = Math.round(calorieTarget * 0.25)
  const lunchCal = Math.round(calorieTarget * 0.35)
  const dinnerCal = Math.round(calorieTarget * 0.3)
  const snackCal = Math.round(calorieTarget * 0.1)

  const proteinRatio = goal === 'muscle_gain' ? 0.35 : 0.3
  const carbRatio = goal === 'weight_loss' ? 0.3 : 0.4
  const fatRatio = 1 - proteinRatio - carbRatio

  function macros(cal: number) {
    return {
      protein: Math.round((cal * proteinRatio) / 4),
      carbs: Math.round((cal * carbRatio) / 4),
      fat: Math.round((cal * fatRatio) / 9),
      fiber: Math.round(cal / 100),
    }
  }

  const breakfastOptions = [
    { name: 'Greek Yogurt Power Bowl', ingredients: ['Greek yogurt', 'mixed berries', 'chia seeds', 'honey', 'granola'], prep_time: '5 min', instructions: 'Layer Greek yogurt in a bowl, top with berries, chia seeds, a drizzle of honey, and granola.' },
    { name: 'Veggie Egg Scramble', ingredients: ['eggs', 'spinach', 'bell peppers', 'onions', 'olive oil', 'whole wheat toast'], prep_time: '10 min', instructions: 'Sauté veggies in olive oil, add beaten eggs, scramble until cooked. Serve with toast.' },
    { name: 'Overnight Oats', ingredients: ['rolled oats', 'almond milk', 'banana', 'peanut butter', 'cinnamon'], prep_time: '5 min (prep night before)', instructions: 'Mix oats with almond milk, refrigerate overnight. Top with sliced banana, peanut butter, and cinnamon.' },
  ]

  const lunchOptions = [
    { name: 'Grilled Chicken Salad', ingredients: ['chicken breast', 'mixed greens', 'cherry tomatoes', 'cucumber', 'avocado', 'olive oil vinaigrette'], prep_time: '15 min', instructions: 'Grill chicken, slice over bed of greens with vegetables. Drizzle with olive oil vinaigrette.' },
    { name: 'Turkey & Avocado Wrap', ingredients: ['whole wheat tortilla', 'turkey breast', 'avocado', 'lettuce', 'tomato', 'mustard'], prep_time: '5 min', instructions: 'Layer turkey, mashed avocado, lettuce, and tomato in tortilla. Add mustard and roll up.' },
    { name: 'Quinoa Buddha Bowl', ingredients: ['quinoa', 'chickpeas', 'roasted sweet potato', 'kale', 'tahini dressing'], prep_time: '20 min', instructions: 'Cook quinoa, roast sweet potato. Assemble bowl with kale, chickpeas, and drizzle with tahini.' },
  ]

  const dinnerOptions = [
    { name: 'Baked Salmon with Vegetables', ingredients: ['salmon fillet', 'broccoli', 'sweet potato', 'lemon', 'olive oil', 'garlic'], prep_time: '25 min', instructions: 'Season salmon with lemon and garlic, bake at 400°F for 15 min. Roast broccoli and sweet potato alongside.' },
    { name: 'Lean Beef Stir-Fry', ingredients: ['lean beef strips', 'brown rice', 'bell peppers', 'snap peas', 'soy sauce', 'ginger'], prep_time: '20 min', instructions: 'Stir-fry beef strips with vegetables, season with soy sauce and ginger. Serve over brown rice.' },
    { name: 'Herb-Crusted Chicken Thighs', ingredients: ['chicken thighs', 'rosemary', 'thyme', 'roasted asparagus', 'wild rice'], prep_time: '30 min', instructions: 'Season chicken with herbs, bake at 375°F for 25 min. Serve with roasted asparagus and wild rice.' },
  ]

  const snackOptions = [
    { name: 'Apple & Almond Butter', ingredients: ['apple', 'almond butter'], prep_time: '2 min', instructions: 'Slice apple and serve with 2 tablespoons of almond butter for dipping.' },
    { name: 'Protein Smoothie', ingredients: ['protein powder', 'banana', 'spinach', 'almond milk'], prep_time: '3 min', instructions: 'Blend all ingredients until smooth. Add ice for thickness.' },
  ]

  // Simple random pick with deep clone to prevent mutation of module-level options
  const pick = <T,>(arr: readonly T[]): T => {
    const chosen = arr[Math.floor(Math.random() * arr.length)]
    return structuredClone(chosen)
  }

  const meals: Array<{
    name: string
    ingredients: string[]
    prep_time: string
    instructions: string
    meal_type: string
    calories: number
    protein: number
    carbs: number
    fat: number
    fiber: number
  }> = []

  if (mealCount >= 1) {
    const b = pick(breakfastOptions)
    meals.push({ ...b, meal_type: 'breakfast', calories: breakfastCal, ...macros(breakfastCal) })
  }
  if (mealCount >= 2) {
    const l = pick(lunchOptions)
    meals.push({ ...l, meal_type: 'lunch', calories: lunchCal, ...macros(lunchCal) })
  }
  if (mealCount >= 3) {
    const d = pick(dinnerOptions)
    meals.push({ ...d, meal_type: 'dinner', calories: dinnerCal, ...macros(dinnerCal) })
  }
  // Add a snack
  const s = pick(snackOptions)
  meals.push({ ...s, meal_type: 'snack', calories: snackCal, ...macros(snackCal) })

  // Filter out allergen-containing meals (basic check) - returns new meals, no in-place mutation
  if (allergySet.size > 0) {
    return meals.map(meal => ({
      ...meal,
      ingredients: meal.ingredients.filter(ing => {
        const lower = ing.toLowerCase()
        if (allergySet.has('dairy') && (lower.includes('yogurt') || lower.includes('cheese') || lower.includes('milk'))) return false
        if (allergySet.has('nuts') && (lower.includes('almond') || lower.includes('peanut') || lower.includes('walnut'))) return false
        if (allergySet.has('gluten') && (lower.includes('bread') || lower.includes('tortilla') || lower.includes('toast') || lower.includes('oats'))) return false
        if (allergySet.has('eggs') && lower.includes('egg')) return false
        if (allergySet.has('soy') && lower.includes('soy')) return false
        if (allergySet.has('shellfish') && (lower.includes('shrimp') || lower.includes('crab'))) return false
        return true
      }),
    }))
  }

  return meals
}
