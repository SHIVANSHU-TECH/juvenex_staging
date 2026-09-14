// Shop entry quiz — data model + recommendation resolver.
//
// A short questionnaire shown when a member first enters the shop, to point
// them at the right peptide(s) instead of a wall of 50 SKUs. This is a FUNNEL
// ONLY: it recommends peptides + the membership tier that covers them, then
// hands the user into the normal shop → PrescribeRx purchase flow. It does NOT
// do any clinical gating — the licensed provider's intake inside the PRX embed
// remains the real clinical gate. Q5 is a courtesy pre-screen surfaced as a
// note, not a hard block.
//
// Peptide ids are the canonical marketplace-access slugs so recommendations map
// straight onto shop products + membership access.

import {
  MARKETPLACE_GROUPS,
  MARKETPLACE_PEPTIDES,
  tierForPlan,
  type MarketplaceTier,
} from '@/lib/marketplace-access'

/** Bump when the questions change so a stale saved response re-prompts. */
export const SHOP_QUIZ_VERSION = 1
/** localStorage key holding the last completed/skipped response (don't re-nag). */
export const SHOP_QUIZ_STORAGE_KEY = `juvenex_shop_quiz_v${SHOP_QUIZ_VERSION}`

export type ShopGoal = 'weight_loss' | 'growth' | 'sexual' | 'metabolic'

export interface GoalDef {
  id: ShopGoal
  label: string
  hint: string
}

// Q1 — up to two goals. Each selected goal adds one branch question.
export const SHOP_GOALS: readonly GoalDef[] = [
  { id: 'weight_loss', label: 'Weight loss / metabolism', hint: 'GLP-1 based fat loss' },
  { id: 'growth', label: 'Muscle, recovery, anti-aging', hint: 'Growth & repair peptides' },
  { id: 'sexual', label: 'Sexual health / hormones', hint: 'Hormone & libido support' },
  { id: 'metabolic', label: 'Energy / cellular health', hint: 'NAD+ & antioxidants' },
] as const

export const MAX_GOALS = 2

export interface BranchOption {
  key: string
  label: string
  /** Canonical peptide slugs this answer recommends (1 = single, 2 = stack). */
  peptides: readonly string[]
}

export interface BranchQuestion {
  goal: ShopGoal
  question: string
  options: readonly BranchOption[]
}

// Q2–Q4b — one per goal, only rendered for the goals picked in Q1.
export const BRANCH_QUESTIONS: Readonly<Record<ShopGoal, BranchQuestion>> = {
  weight_loss: {
    goal: 'weight_loss',
    question: 'Have you used a GLP-1 medication before (Ozempic, Wegovy, Mounjaro, or similar)?',
    options: [
      { key: 'never', label: 'Never tried one', peptides: ['semaglutide'] },
      { key: 'plateaued', label: 'Tried one — plateaued or had side effects', peptides: ['tirzepatide'] },
      { key: 'switch', label: 'Currently on one, want to switch', peptides: ['tirzepatide'] },
    ],
  },
  growth: {
    goal: 'growth',
    question: "What's the main outcome you're after?",
    options: [
      { key: 'antiaging', label: 'General anti-aging, sleep, recovery', peptides: ['sermorelin'] },
      { key: 'fatloss', label: 'Fat loss + metabolic support', peptides: ['tesamorelin'] },
      { key: 'muscle', label: 'Muscle growth + recovery (open to a combo)', peptides: ['cjc-1295', 'ipamorelin'] },
      { key: 'maxeffect', label: 'Not sure — want max effect', peptides: ['cjc-1295', 'ipamorelin'] },
    ],
  },
  sexual: {
    goal: 'sexual',
    question: "What's the primary concern?",
    options: [
      { key: 'lowt', label: 'Low testosterone symptoms (fatigue, low libido, muscle loss)', peptides: ['enclomiphene'] },
      { key: 'lowt_estrogen', label: 'Low-T symptoms + bloating / mood swings / water retention', peptides: ['enclomiphene', 'anastrozole'] },
      { key: 'performance', label: 'Sexual performance / arousal specifically', peptides: ['pt-141'] },
      { key: 'both', label: 'Both hormone symptoms and performance concerns', peptides: ['enclomiphene', 'pt-141'] },
    ],
  },
  metabolic: {
    goal: 'metabolic',
    question: "What's the focus — general cellular energy, or detox / skin support?",
    options: [
      { key: 'energy', label: 'Cellular energy / anti-aging', peptides: ['nad'] },
      { key: 'detox', label: 'Detox / skin / antioxidant support', peptides: ['glutathione'] },
      { key: 'both', label: 'Both', peptides: ['nad', 'glutathione'] },
    ],
  },
}

export interface PrescreenOption {
  key: string
  label: string
  /** 'none' clears the others; any other selection surfaces a review note. */
  isNone?: boolean
}

// Q5 — always shown, applies to the whole cart. Courtesy pre-screen only.
export const PRESCREEN_OPTIONS: readonly PrescreenOption[] = [
  { key: 'pregnancy', label: 'Pregnant, breastfeeding, or trying to conceive' },
  { key: 'thyroid', label: 'Personal/family history of thyroid cancer (MTC) or MEN2 syndrome' },
  { key: 'hormone_cancer', label: 'History of a hormone-sensitive cancer (e.g. breast, prostate)' },
  { key: 'cardiac', label: 'Heart condition or uncontrolled blood pressure' },
  { key: 'none', label: 'None of these', isNone: true },
] as const

export interface QuizAnswers {
  goals: ShopGoal[]
  /** Selected branch option key per goal. */
  branch: Partial<Record<ShopGoal, string>>
  /** Q5 keys (excluding 'none'). */
  prescreen: string[]
}

export interface QuizRecommendation {
  /** Canonical peptide slugs, de-duplicated, capped at 4. */
  peptides: string[]
  /** Suggested membership tier slug that covers the peptide count. */
  suggestedTier: string
  /** Q5 flags (non-'none') to surface a "may need review" note. */
  prescreenFlags: string[]
}

const PEPTIDE_NAME_BY_SLUG: Readonly<Record<string, string>> = Object.fromEntries(
  MARKETPLACE_PEPTIDES.map((p) => [p.slug, p.name])
)

/** Display name for a peptide slug (falls back to the slug). */
export function peptideName(slug: string): string {
  return PEPTIDE_NAME_BY_SLUG[slug] ?? slug
}

// Peptide count → membership tier slug. Mirrors MARKETPLACE_TIERS ladder:
// 1 → Basic, 2 → Intermediate, 3 → Advanced, 4+ → Total.
function tierSlugForCount(count: number): string {
  if (count <= 1) return 'metabolic_reset'
  if (count === 2) return 'optimization'
  if (count === 3) return 'optimization_metabolic'
  return 'completely_optimized'
}

/**
 * Pure resolver: quiz answers → recommended peptides + suggested tier. Maps each
 * selected goal's branch answer to 1–2 peptides, concatenates across goals
 * (deduped, capped at 4), derives the tier from the count, and carries the Q5
 * pre-screen flags through for display.
 */
export function resolveRecommendation(answers: QuizAnswers): QuizRecommendation {
  const peptides: string[] = []
  for (const goal of answers.goals) {
    const answerKey = answers.branch[goal]
    if (!answerKey) continue
    const option = BRANCH_QUESTIONS[goal].options.find((o) => o.key === answerKey)
    if (!option) continue
    for (const slug of option.peptides) {
      if (!peptides.includes(slug)) peptides.push(slug)
    }
  }
  const capped = peptides.slice(0, 4)
  const prescreenFlags = answers.prescreen.filter((k) => k !== 'none')
  return {
    peptides: capped,
    suggestedTier: tierSlugForCount(capped.length),
    prescreenFlags,
  }
}

/** The MarketplaceTier object for a recommendation's suggested tier. */
export function suggestedTierObject(rec: QuizRecommendation): MarketplaceTier {
  return tierForPlan(rec.suggestedTier)
}

const GROUP_LABEL_BY_SLUG: Readonly<Record<string, string>> = Object.fromEntries(
  MARKETPLACE_GROUPS.map((g) => [g.slug, g.label])
)
const GROUP_SLUG_BY_PEPTIDE: Readonly<Record<string, string>> = Object.fromEntries(
  MARKETPLACE_PEPTIDES.map((p) => [p.slug, p.group])
)

/**
 * The distinct shop SECTION label(s) a recommendation points at (e.g. "Weight
 * management"). The quiz is guidance-first: its job is to steer a newcomer to
 * the right part of the shop, so we surface the section, and — when it's a
 * single section — jump the shop's category filter straight to it.
 */
export function recommendedSectionLabels(rec: QuizRecommendation): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const slug of rec.peptides) {
    const groupSlug = GROUP_SLUG_BY_PEPTIDE[slug]
    if (!groupSlug) continue
    const label = GROUP_LABEL_BY_SLUG[groupSlug] ?? groupSlug
    if (!seen.has(label)) {
      seen.add(label)
      out.push(label)
    }
  }
  return out
}
