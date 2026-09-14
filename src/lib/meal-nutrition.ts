// Meal-plan nutrition math for the AI meal planner.
//
// Two responsibilities, both pure (no I/O) so they are unit-testable:
//   1. computeCalorieTarget() — a SAFE daily calorie target from user stats
//      (Mifflin-St Jeor BMR x activity = TDEE, then a MODERATE deficit with
//      hard floors so we never recommend a dangerously low, under-eating plan).
//   2. normalizeMealPlan() — make a model-generated plan's per-item calories
//      internally consistent (Atwater 4/4/9) AND make the day's total actually
//      sum to (≈) the target, so the numbers the user sees are accurate.

export interface CalorieTargetStats {
  current_weight: number | null // lbs
  height: number | null // inches
  age: number | null
  gender: string | null // 'male' | 'female' | 'other' | null
  activity_level: string | null
}

export interface CalorieTargetResult {
  target: number // safe daily calorie target (kcal)
  bmr: number
  tdee: number
  deficit: number // applied deficit (positive) or surplus (negative) in kcal
  floor: number // hard safety floor applied
  usedDefaults: boolean // true when core stats were missing
  basis: string // human-readable explanation, safe to surface in the UI
}

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

// Hard safety floors (kcal/day). We never recommend below these, and never
// below BMR by a large margin (the target is also floored at the user's BMR).
const FLOOR_FEMALE = 1200
const FLOOR_MALE = 1500
const FLOOR_OTHER = 1350

// Sensible defaults used when core stats (weight/height/age) are missing — a
// reasonable maintenance-ish band rather than something tiny.
const DEFAULT_TARGET_FEMALE = 1500
const DEFAULT_TARGET_MALE = 1800
const DEFAULT_TARGET_OTHER = 1650

// Assumed values purely for reporting BMR/TDEE when stats are missing.
const ASSUMED_WEIGHT_LBS = 170
const ASSUMED_HEIGHT_IN = 67
const ASSUMED_AGE = 35

// Goals that warrant a weight-loss deficit. Everything else maintains; muscle
// gain adds a modest surplus.
const WEIGHT_LOSS_GOALS = new Set(['weight_loss', 'glp1_optimize', 'blood_sugar'])

// Moderate deficit: ~18% of TDEE (squarely in the 15-20% range), capped so it
// never exceeds ~500 kcal/day even for large TDEEs.
const DEFICIT_FRACTION = 0.18
const MAX_DEFICIT = 500
const MUSCLE_GAIN_SURPLUS = 300

function genderKey(gender: string | null): 'male' | 'female' | 'other' {
  if (gender === 'male') return 'male'
  if (gender === 'female') return 'female'
  return 'other'
}

function bmrConstant(g: 'male' | 'female' | 'other'): number {
  if (g === 'male') return 5
  if (g === 'female') return -161
  return -78 // midpoint for unspecified/other
}

function floorFor(g: 'male' | 'female' | 'other'): number {
  if (g === 'male') return FLOOR_MALE
  if (g === 'female') return FLOOR_FEMALE
  return FLOOR_OTHER
}

function defaultTargetFor(g: 'male' | 'female' | 'other'): number {
  if (g === 'male') return DEFAULT_TARGET_MALE
  if (g === 'female') return DEFAULT_TARGET_FEMALE
  return DEFAULT_TARGET_OTHER
}

function mifflinBmr(
  g: 'male' | 'female' | 'other',
  weightLbs: number,
  heightIn: number,
  age: number
): number {
  const weightKg = weightLbs / 2.2
  const heightCm = heightIn * 2.54
  return 10 * weightKg + 6.25 * heightCm - 5 * age + bmrConstant(g)
}

/**
 * Compute a SAFE daily calorie target.
 *
 * - Mifflin-St Jeor BMR x activity multiplier = TDEE.
 * - Moderate ~18% deficit (capped at 500 kcal) for weight-loss goals.
 * - Modest +300 surplus for muscle gain; maintenance otherwise.
 * - Hard floor: never below the gender floor (1200 F / 1500 M / 1350 other)
 *   AND never below the user's BMR (prevents dangerous under-eating).
 * - Missing core stats fall back to a sensible default band (1500-1800).
 */
export function computeCalorieTarget(
  stats: CalorieTargetStats,
  goal: string | null
): CalorieTargetResult {
  const g = genderKey(stats.gender)
  const floor = floorFor(g)
  const effectiveGoal = goal ?? 'weight_loss'

  const missingCoreStats =
    stats.current_weight == null || stats.height == null || stats.age == null

  const activity = stats.activity_level ?? 'moderate'
  const multiplier = ACTIVITY_MULTIPLIERS[activity] ?? ACTIVITY_MULTIPLIERS.moderate

  if (missingCoreStats) {
    // Not enough data for a personalized number — use a safe default band and
    // still report an estimated BMR/TDEE from assumed values for transparency.
    const bmr = mifflinBmr(g, ASSUMED_WEIGHT_LBS, ASSUMED_HEIGHT_IN, ASSUMED_AGE)
    const tdee = bmr * multiplier
    const target = defaultTargetFor(g)
    return {
      target,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      deficit: 0,
      floor,
      usedDefaults: true,
      basis:
        'Using a safe default target — add your weight, height and age in your profile for a personalized number.',
    }
  }

  const bmr = mifflinBmr(
    g,
    stats.current_weight as number,
    stats.height as number,
    stats.age as number
  )
  const tdee = bmr * multiplier

  let deficit = 0
  if (WEIGHT_LOSS_GOALS.has(effectiveGoal)) {
    deficit = Math.min(Math.round(tdee * DEFICIT_FRACTION), MAX_DEFICIT)
  } else if (effectiveGoal === 'muscle_gain') {
    deficit = -MUSCLE_GAIN_SURPLUS
  }

  const rawTarget = Math.round(tdee - deficit)
  // Floor at the higher of the gender floor and BMR so we never starve the user.
  const effectiveFloor = Math.max(floor, Math.round(bmr))
  const target = Math.max(rawTarget, effectiveFloor)

  const floored = target > rawTarget
  let basis: string
  if (effectiveGoal === 'muscle_gain') {
    basis = `Maintenance ${Math.round(tdee)} kcal + ${MUSCLE_GAIN_SURPLUS} kcal surplus for muscle gain.`
  } else if (deficit > 0) {
    basis = floored
      ? `Maintenance ${Math.round(tdee)} kcal; deficit reduced to keep you at or above your BMR (${Math.round(bmr)} kcal) for safe weight loss.`
      : `Maintenance ${Math.round(tdee)} kcal − ${deficit} kcal moderate deficit for steady weight loss.`
  } else {
    basis = `Maintenance target of ${Math.round(tdee)} kcal.`
  }

  return {
    target,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    deficit,
    floor: effectiveFloor,
    usedDefaults: false,
    basis,
  }
}

export interface NormalizableMeal {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

export interface NormalizeResult<T> {
  meals: T[]
  totalCalories: number
  adjusted: boolean
  scaleFactor: number
}

// Atwater factors (kcal per gram).
const KCAL_PER_G_PROTEIN = 4
const KCAL_PER_G_CARB = 4
const KCAL_PER_G_FAT = 9

function caloriesFromMacros(protein: number, carbs: number, fat: number): number {
  return (
    protein * KCAL_PER_G_PROTEIN + carbs * KCAL_PER_G_CARB + fat * KCAL_PER_G_FAT
  )
}

/**
 * Make a generated meal plan's calories accurate.
 *
 * Step 1 — internal consistency: recompute each meal's calories from its macros
 * via Atwater factors (calories ARE defined by macros), so per-item numbers are
 * realistic instead of whatever the model guessed.
 *
 * Step 2 — total accuracy: if the day's total is outside `tolerance` of the
 * target, scale every meal's macros (and recomputed calories) by a clamped
 * factor so the total lands on the target without producing absurd portions.
 *
 * Generic over the meal shape so extra fields (name, ingredients, ...) are
 * preserved on the returned copies.
 */
export function normalizeMealPlan<T extends NormalizableMeal>(
  meals: T[],
  target: number,
  tolerance = 0.08
): NormalizeResult<T> {
  if (meals.length === 0 || target <= 0) {
    return { meals, totalCalories: 0, adjusted: false, scaleFactor: 1 }
  }

  let adjusted = false

  // Step 1: reconcile per-meal calories with macros.
  const reconciled = meals.map((m) => {
    const protein = Math.max(0, m.protein)
    const carbs = Math.max(0, m.carbs)
    const fat = Math.max(0, m.fat)
    const macroSum = protein + carbs + fat
    let calories = m.calories
    if (macroSum > 0) {
      const fromMacros = Math.round(caloriesFromMacros(protein, carbs, fat))
      if (fromMacros !== Math.round(m.calories)) adjusted = true
      calories = fromMacros
    }
    return { ...m, protein, carbs, fat, calories }
  })

  const total = reconciled.reduce((s, m) => s + m.calories, 0)

  // Step 2: scale to hit the target if we're outside tolerance.
  if (total > 0 && Math.abs(total - target) / target > tolerance) {
    // Clamp to avoid grotesque portion sizes from a wildly-off model response.
    const scaleFactor = Math.min(1.8, Math.max(0.5, target / total))
    const scaled = reconciled.map((m) => {
      const protein = Math.round(m.protein * scaleFactor)
      const carbs = Math.round(m.carbs * scaleFactor)
      const fat = Math.round(m.fat * scaleFactor)
      const fiber = Math.round(m.fiber * scaleFactor)
      const calories = Math.round(caloriesFromMacros(protein, carbs, fat))
      return { ...m, protein, carbs, fat, fiber, calories }
    })
    const totalCalories = scaled.reduce((s, m) => s + m.calories, 0)
    return { meals: scaled, totalCalories, adjusted: true, scaleFactor }
  }

  return { meals: reconciled, totalCalories: total, adjusted, scaleFactor: 1 }
}
