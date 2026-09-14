// USDA FoodData Central (FDC) nutrition lookup.
//
// Auto-populates calories/macros for the food log so users no longer have to
// type every number by hand. Uses the free USDA FoodData Central API:
//   https://fdc.nal.usda.gov/api-guide
//   GET https://api.nal.usda.gov/fdc/v1/foods/search?api_key=KEY&query=...
//
// The upstream key lives in USDA_FDC_API_KEY (see .env.example). If the key is
// missing the feature DEGRADES GRACEFULLY: searchNutrition() returns
// { configured: false, results: [] } and the UI silently falls back to plain
// manual entry — no crash, no error surfaced to the user.

import { logger } from '@/lib/logger'

const FDC_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'

// USDA nutrient numbers (stable identifiers, see the FDC nutrient list).
const NUTRIENT_ENERGY_KCAL = '208'
// Foundation/Survey foods (the top hits for common terms like "banana") often
// omit 208 and report energy via Atwater factors instead. Without these
// fallbacks the most common searches returned zero suggestions.
const NUTRIENT_ENERGY_ATWATER_SPECIFIC = '958'
const NUTRIENT_ENERGY_ATWATER_GENERAL = '957'
const NUTRIENT_PROTEIN = '203'
const NUTRIENT_FAT = '204'
const NUTRIENT_CARBS = '205'
const NUTRIENT_FIBER = '291'

// One suggestion the food-log UI can show and apply to the form.
export interface NutritionSuggestion {
  fdcId: number
  name: string
  brand: string | null
  // Human-readable serving the macro numbers refer to, e.g. "100 g" or
  // "1 cup (240 g)". Surfaced in the UI so the user understands the basis.
  serving: string
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
}

export interface NutritionSearchResult {
  // false when USDA_FDC_API_KEY is unset — UI should fall back to manual entry.
  configured: boolean
  results: NutritionSuggestion[]
}

interface FdcNutrient {
  nutrientNumber?: string
  unitName?: string
  value?: number
}

interface FdcFood {
  fdcId: number
  description?: string
  dataType?: string
  brandOwner?: string
  brandName?: string
  servingSize?: number
  servingSizeUnit?: string
  householdServingFullText?: string
  foodNutrients?: FdcNutrient[]
}

interface FdcSearchResponse {
  foods?: FdcFood[]
}

function isUsdaConfigured(): boolean {
  return Boolean(process.env.USDA_FDC_API_KEY && process.env.USDA_FDC_API_KEY.trim())
}

// USDA returns nutrient values per 100 g of the edible portion. Pull the value
// for a given nutrient number, defensively (the array shape varies by dataType).
function nutrientPer100g(food: FdcFood, nutrientNumber: string): number | null {
  const match = food.foodNutrients?.find((n) => n.nutrientNumber === nutrientNumber)
  if (!match || typeof match.value !== 'number' || Number.isNaN(match.value)) {
    return null
  }
  return match.value
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// Convert a USDA food (per-100g nutrients) into a suggestion. When the food
// carries a gram-based serving size (common for Branded items) we scale the
// numbers to one serving so the user sees "as you'd eat it" values; otherwise
// we report the per-100g basis and label it clearly.
function toSuggestion(food: FdcFood): NutritionSuggestion | null {
  const name = (food.description ?? '').trim()
  if (!name) return null

  const energy =
    nutrientPer100g(food, NUTRIENT_ENERGY_KCAL) ??
    nutrientPer100g(food, NUTRIENT_ENERGY_ATWATER_SPECIFIC) ??
    nutrientPer100g(food, NUTRIENT_ENERGY_ATWATER_GENERAL)
  const protein = nutrientPer100g(food, NUTRIENT_PROTEIN)
  const fat = nutrientPer100g(food, NUTRIENT_FAT)
  const carbs = nutrientPer100g(food, NUTRIENT_CARBS)
  const fiber = nutrientPer100g(food, NUTRIENT_FIBER)

  // Skip foods with no calorie data — they offer nothing to auto-populate.
  if (energy == null) return null

  const unit = food.servingSizeUnit?.toLowerCase()
  const gramServing =
    typeof food.servingSize === 'number' && food.servingSize > 0 && (unit === 'g' || unit === 'gram')
      ? food.servingSize
      : null

  const scale = gramServing ? gramServing / 100 : 1
  const scaleMacro = (v: number | null): number | null => (v == null ? null : round(v * scale, 1))

  let serving: string
  if (gramServing) {
    const household = food.householdServingFullText?.trim()
    serving = household ? `${household} (${round(gramServing)} g)` : `${round(gramServing)} g`
  } else {
    serving = 'per 100 g'
  }

  return {
    fdcId: food.fdcId,
    name,
    brand: (food.brandName ?? food.brandOwner ?? '').trim() || null,
    serving,
    calories: round(energy * scale),
    protein: scaleMacro(protein),
    carbs: scaleMacro(carbs),
    fat: scaleMacro(fat),
    fiber: scaleMacro(fiber),
  }
}

/**
 * Search USDA FoodData Central for a food name and return calorie/macro
 * suggestions. Never throws: on a missing key it returns configured:false, and
 * on any upstream/network failure it logs and returns an empty result so the
 * caller can degrade to manual entry.
 */
export async function searchNutrition(query: string, limit = 8): Promise<NutritionSearchResult> {
  if (!isUsdaConfigured()) {
    return { configured: false, results: [] }
  }

  const trimmed = query.trim()
  if (!trimmed) {
    return { configured: true, results: [] }
  }

  const pageSize = Math.min(Math.max(limit, 1), 25)
  const url = new URL(FDC_SEARCH_URL)
  url.searchParams.set('api_key', process.env.USDA_FDC_API_KEY!.trim())
  url.searchParams.set('query', trimmed)
  url.searchParams.set('pageSize', String(pageSize))
  // Prefer whole/common foods and survey (FNDDS) items, which carry reliable
  // macro data, alongside branded products for packaged-food lookups.
  url.searchParams.set('dataType', 'Foundation,SR Legacy,Survey (FNDDS),Branded')

  try {
    // Abort slow upstream calls so a typing user never waits on USDA.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6_000)
    let res: Response
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) {
      logger.warn('nutrition: USDA search non-OK response', { status: res.status })
      return { configured: true, results: [] }
    }

    const json = (await res.json()) as FdcSearchResponse
    const results = (json.foods ?? [])
      .map(toSuggestion)
      .filter((s): s is NutritionSuggestion => s !== null)
      .slice(0, pageSize)

    return { configured: true, results }
  } catch (error: unknown) {
    logger.error('nutrition: USDA search failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { configured: true, results: [] }
  }
}
