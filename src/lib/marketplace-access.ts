// Marketplace access model.
//
// IMPORTANT — this is the authoritative source of membership pricing and what
// each tier unlocks. `priceCents` (never a client-supplied amount) is what the
// membership checkout charges and what the webhook/verify amount-integrity
// check compares against.
//
// ACCESS MODEL (peptide-based):
//   The catalog is organized into display GROUPS (Weight management, Energy
//   enhancement, …). Access, however, is granted at the level of an individual
//   PEPTIDE. Each paid tier lets a member choose up to N peptides from ANY
//   group (`maxSelectablePeptides`); Unlimited grants all peptides. A member's
//   chosen peptide slugs are stored in `subscriptions.selected_protocols`.
//
// BACK-COMPAT: tier SLUGS and PRICES are intentionally unchanged from the
// previous group-based model so existing subscriptions need no migration and
// are never re-charged. Old selections that stored group slugs are expanded to
// that group's peptides (capped at the tier limit) by `peptidesForPlan`, so no
// existing member loses access at cutover.

export type MarketplaceGroupSlug =
  | 'weight_management'
  | 'energy_enhancement'
  | 'growth_recovery'
  | 'sexual_health'
  | 'longevity'

export interface MarketplacePeptide {
  /** Canonical kebab-case slug, stored in selected_protocols. */
  slug: string
  /** Display name. */
  name: string
  group: MarketplaceGroupSlug
  /** Lowercase substrings used to match a catalog product to this peptide. */
  patterns: readonly string[]
}

export interface MarketplaceGroup {
  slug: MarketplaceGroupSlug
  label: string
  /** Peptide slugs that belong to this group (for the selection UI). */
  peptides: readonly string[]
}

export interface MarketplaceTier {
  slug: string
  label: string
  shortLabel?: string
  price: string
  /**
   * Authoritative monthly membership price in cents. This — never the
   * client-supplied amount — is what the membership checkout charges and what
   * the webhook/verify amount-integrity check compares against. Free tier is 0
   * (not purchasable).
   */
  priceCents: number
  tagline: string
  bullets: readonly string[]
  /** How many individual peptides this tier lets a member choose. null = all. */
  maxSelectablePeptides: number | null
  /**
   * Resolved set of accessible peptide slugs for THIS member. Base tier
   * definitions leave this empty; it is populated by `tierForPlanAndPeptides`
   * (and is what `classifyProductAccess` reads).
   */
  peptides: readonly string[]
}

export interface ProductAccessClassification {
  group: MarketplaceGroup
  peptide: MarketplacePeptide | null
  locked: boolean
  requiredTier: MarketplaceTier
}

// ============================================================================
// Catalog: peptides and their display groups
// ============================================================================

export const MARKETPLACE_PEPTIDES: readonly MarketplacePeptide[] = [
  // Weight management
  // NOTE: patterns are intentionally strict — vendor class aliases like
  // "GLP-1S" (and GLP-2T / GLP-3R) are shorthand for compounds NOT on the
  // provider-approved named list, so they must not leak into the storefront.
  // Only explicitly-named semaglutide products qualify.
  { slug: 'semaglutide', name: 'Semaglutide', group: 'weight_management', patterns: ['semaglutide', 'ozempic', 'wegovy'] },
  { slug: 'tirzepatide', name: 'Tirzepatide', group: 'weight_management', patterns: ['tirzepatide', 'mounjaro', 'zepbound'] },
  // Energy enhancement
  { slug: 'nad', name: 'NAD+', group: 'energy_enhancement', patterns: ['nad+', 'nad plus', 'nad-', 'nicotinamide', 'nad'] },
  { slug: 'glutathione', name: 'Glutathione', group: 'energy_enhancement', patterns: ['glutathione'] },
  // Growth / Recovery support
  { slug: 'tesamorelin', name: 'Tesamorelin', group: 'growth_recovery', patterns: ['tesamorelin'] },
  { slug: 'sermorelin', name: 'Sermorelin', group: 'growth_recovery', patterns: ['sermorelin', 'semorelin'] },
  { slug: 'ipamorelin', name: 'Ipamorelin', group: 'growth_recovery', patterns: ['ipamorelin'] },
  { slug: 'cjc-1295', name: 'CJC-1295', group: 'growth_recovery', patterns: ['cjc-1295', 'cjc 1295', 'cjc1295', 'cjc'] },
  // Sexual health
  { slug: 'enclomiphene', name: 'Enclomiphene', group: 'sexual_health', patterns: ['enclomiphene'] },
  { slug: 'anastrozole', name: 'Anastrozole', group: 'sexual_health', patterns: ['anastrozole', 'arimidex'] },
  { slug: 'pt-141', name: 'PT-141', group: 'sexual_health', patterns: ['pt-141', 'pt 141', 'pt141', 'bremelanotide'] },
  // Longevity
  { slug: 'thymosin-alpha-1', name: 'Thymosin Alpha-1', group: 'longevity', patterns: ['thymosin alpha-1', 'thymosin alpha 1', 'thymosin-alpha-1', 'thymosin', 'ta-1', 'ta1'] },
  { slug: 'selank', name: 'Selank', group: 'longevity', patterns: ['selank'] },
] as const

export const MARKETPLACE_GROUPS: readonly MarketplaceGroup[] = [
  { slug: 'weight_management', label: 'Weight management', peptides: ['semaglutide', 'tirzepatide'] },
  { slug: 'energy_enhancement', label: 'Energy enhancement', peptides: ['nad', 'glutathione'] },
  { slug: 'growth_recovery', label: 'Growth / Recovery support', peptides: ['tesamorelin', 'sermorelin', 'ipamorelin', 'cjc-1295'] },
  { slug: 'sexual_health', label: 'Sexual health', peptides: ['enclomiphene', 'anastrozole', 'pt-141'] },
  { slug: 'longevity', label: 'Longevity', peptides: ['thymosin-alpha-1', 'selank'] },
] as const

// ============================================================================
// Tiers — slugs and prices UNCHANGED for back-compat; meaning is now peptides.
// ============================================================================

export const MARKETPLACE_TIERS: readonly MarketplaceTier[] = [
  {
    slug: 'free',
    label: 'Free app account',
    price: '$0 / mo',
    priceCents: 0,
    tagline: 'Create your profile, join the community, and explore the app before choosing a protocol.',
    bullets: ['Community access', 'Profile setup', 'Explore before upgrading'],
    maxSelectablePeptides: 0,
    peptides: [],
  },
  {
    slug: 'metabolic_reset',
    label: 'Basic',
    shortLabel: '$95',
    price: '$95 / mo',
    priceCents: 9500,
    tagline: 'The Basic Protocol provides ACCESS to one provider approved peptide based on your health goals, medical and history. Ideal for first-time peptide users seeking a focused and affordable starting point.',
    bullets: ['Choose any 1 peptide', 'From any protocol group', 'Talk to a telehealth doctor'],
    maxSelectablePeptides: 1,
    peptides: [],
  },
  {
    slug: 'optimization',
    label: 'Intermediate',
    shortLabel: '$129',
    price: '$129 / mo',
    priceCents: 12900,
    tagline: 'The Intermediate Protocol includes ACCESS to two provider-approved peptides that work synergistically to optimize outcomes. This tier allows patients to address both primary and secondary wellness goals while maintaining a manageable treatment plan.',
    bullets: ['Choose any 2 peptides', 'Mix across any protocols', 'Talk to a telehealth doctor'],
    maxSelectablePeptides: 2,
    peptides: [],
  },
  {
    slug: 'optimization_metabolic',
    label: 'Advanced',
    shortLabel: '$179',
    price: '$179 / mo',
    priceCents: 17900,
    tagline: 'The Advanced Protocol provides ACCESS to three provider-approved peptides, allowing for a more personalized and robust treatment approach. Patients can target several health objectives simultaneously under medical supervision.',
    bullets: ['Choose any 3 peptides', 'Mix across any protocols', 'Expanded marketplace access'],
    maxSelectablePeptides: 3,
    peptides: [],
  },
  {
    slug: 'completely_optimized',
    label: 'Total',
    shortLabel: '$219',
    price: '$219 / mo',
    priceCents: 21900,
    tagline: 'The Total Protocol offers the highest level of personalization, allowing patients ACCESS to multiple provider-approved peptides based on their individual needs, goals, and medical eligibility. This premium tier is designed for those seeking complete wellness optimization through a fully customized treatment plan.',
    bullets: ['All peptides included', 'Every protocol group', 'Personalized ongoing support'],
    maxSelectablePeptides: null,
    peptides: [],
  },
] as const

// ============================================================================
// Lookups
// ============================================================================

const GROUP_BY_SLUG = new Map(MARKETPLACE_GROUPS.map((g) => [g.slug, g]))
const TIER_BY_SLUG = new Map(MARKETPLACE_TIERS.map((t) => [t.slug, t]))
const ALL_PEPTIDE_SLUGS: readonly string[] = MARKETPLACE_PEPTIDES.map((p) => p.slug)

// Legacy group slugs (previous group-based model) → current group slug, so old
// stored selections and any persisted group references still resolve.
const LEGACY_GROUP_ALIASES: Readonly<Record<string, MarketplaceGroupSlug>> = {
  weight_loss: 'weight_management',
  metabolic: 'energy_enhancement',
  metabolic_energy: 'energy_enhancement',
  growth: 'growth_recovery',
  recovery: 'growth_recovery',
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
}

// Build a normalized index (slug + every pattern) → canonical peptide slug.
const PEPTIDE_INDEX = new Map<string, string>()
for (const p of MARKETPLACE_PEPTIDES) {
  PEPTIDE_INDEX.set(normalize(p.slug), p.slug)
  for (const pat of p.patterns) PEPTIDE_INDEX.set(normalize(pat), p.slug)
}

const PLAN_ALIASES: Readonly<Record<string, string>> = {
  free: 'free',
  none: 'free',
  monthly: 'metabolic_reset',
  annual: 'metabolic_reset',
  starter: 'metabolic_reset',
  basic: 'metabolic_reset',
  base: 'metabolic_reset',
  metabolic_reset: 'metabolic_reset',
  weight_loss: 'metabolic_reset',
  glp: 'metabolic_reset',
  glp1: 'metabolic_reset',
  tier_1: 'metabolic_reset',
  tier1: 'metabolic_reset',
  plus: 'optimization',
  pro: 'optimization',
  core: 'optimization',
  growth: 'optimization',
  optimization: 'optimization',
  tier_2: 'optimization_metabolic',
  tier2: 'optimization_metabolic',
  premium: 'optimization_metabolic',
  optimization_metabolic: 'optimization_metabolic',
  complete: 'completely_optimized',
  all_access: 'completely_optimized',
  top: 'completely_optimized',
  unlimited: 'completely_optimized',
  completely_optimized: 'completely_optimized',
  tier_3: 'completely_optimized',
  tier3: 'completely_optimized',
}

const FREE_TIER = MARKETPLACE_TIERS[0]
const BASE_TIER = MARKETPLACE_TIERS.find((t) => t.slug === 'metabolic_reset') ?? FREE_TIER

// ============================================================================
// Tier / plan resolution
// ============================================================================

export function tierForPlan(plan: string | null | undefined): MarketplaceTier {
  if (!plan) return FREE_TIER
  const normalized = normalize(plan)
  const tierSlug = PLAN_ALIASES[normalized] ?? normalized
  return TIER_BY_SLUG.get(tierSlug) ?? FREE_TIER
}

/** Map a value (legacy or current group slug) → current group slug, or null. */
export function normalizeGroupSlug(value: string): MarketplaceGroupSlug | null {
  const normalized = normalize(value)
  if (LEGACY_GROUP_ALIASES[normalized]) return LEGACY_GROUP_ALIASES[normalized]
  return GROUP_BY_SLUG.has(normalized as MarketplaceGroupSlug)
    ? (normalized as MarketplaceGroupSlug)
    : null
}

/** Resolve any input string to a canonical peptide slug, or null. */
export function normalizePeptideSlug(value: string): string | null {
  if (!value) return null
  return PEPTIDE_INDEX.get(normalize(value)) ?? null
}

// Expand a stored selection (which may contain peptide slugs OR legacy/current
// group slugs) into a de-duplicated list of canonical peptide slugs.
function expandSelectionToPeptides(values: ReadonlyArray<string>): string[] {
  const out: string[] = []
  for (const v of values) {
    const pep = normalizePeptideSlug(v)
    if (pep) {
      if (!out.includes(pep)) out.push(pep)
      continue
    }
    const grp = normalizeGroupSlug(v)
    if (grp) {
      for (const slug of GROUP_BY_SLUG.get(grp)?.peptides ?? []) {
        if (!out.includes(slug)) out.push(slug)
      }
    }
  }
  return out
}

/**
 * The accessible peptide slugs for a plan + the member's stored selection.
 * Free → none. Unlimited → all. Otherwise the (back-compat-expanded) selection
 * clamped to the tier's peptide limit, so over-selection can't buy more access.
 */
export function peptidesForPlan(
  plan: string | null | undefined,
  selected?: ReadonlyArray<string> | null
): readonly string[] {
  const tier = tierForPlan(plan)
  if (tier.maxSelectablePeptides === 0) return []
  if (tier.maxSelectablePeptides === null) return ALL_PEPTIDE_SLUGS
  const expanded = expandSelectionToPeptides(selected ?? [])
  return expanded.slice(0, tier.maxSelectablePeptides)
}

/** A tier with its resolved accessible peptide set attached. */
export function tierForPlanAndPeptides(
  plan: string | null | undefined,
  selected?: ReadonlyArray<string> | null
): MarketplaceTier {
  const tier = tierForPlan(plan)
  return { ...tier, peptides: peptidesForPlan(plan, selected) }
}

/**
 * @deprecated Group-based name kept for existing call sites. Returns the tier
 * with its accessible peptides resolved (the selection is interpreted as
 * peptide slugs, with legacy group slugs expanded).
 */
export const tierForPlanAndProtocols = tierForPlanAndPeptides

/**
 * @deprecated Group-based helper kept for existing call sites. Returns the
 * accessible peptide slugs (NOT group slugs) for the plan + selection. New
 * code should call `peptidesForPlan`.
 */
export function groupsForPlan(
  plan: string | null | undefined,
  selected?: ReadonlyArray<string> | null
): readonly string[] {
  return peptidesForPlan(plan, selected)
}

// ============================================================================
// Product → peptide/group matching and access classification
// ============================================================================

export function peptideForProduct(product: {
  name?: string | null
  description?: string | null
  category?: string | null
}): MarketplacePeptide | null {
  const haystack = `${product.name ?? ''} ${product.description ?? ''} ${
    product.category ?? ''
  }`.toLowerCase()
  for (const peptide of MARKETPLACE_PEPTIDES) {
    if (peptide.patterns.some((pattern) => haystack.includes(pattern))) {
      return peptide
    }
  }
  return null
}

/**
 * Allowlist gate for the storefront. A product may appear in the shop ONLY if
 * it maps to a peptide on the approved MARKETPLACE_PEPTIDES list. Anything the
 * upstream vendor catalog returns that we cannot map to an approved peptide
 * (e.g. GHK-Cu and other unlisted research compounds) is excluded — both for
 * compliance and because unmapped products would otherwise fall into the
 * default group and mis-render under "Weight management".
 */
export function isApprovedMarketplaceProduct(product: {
  name?: string | null
  description?: string | null
  category?: string | null
}): boolean {
  return peptideForProduct(product) !== null
}

export function groupForProduct(product: {
  name?: string | null
  description?: string | null
  category?: string | null
}): MarketplaceGroup {
  const peptide = peptideForProduct(product)
  if (peptide) return GROUP_BY_SLUG.get(peptide.group) ?? MARKETPLACE_GROUPS[0]
  return MARKETPLACE_GROUPS[0]
}

export function canAccessPeptide(tier: MarketplaceTier, peptideSlug: string): boolean {
  if (tier.maxSelectablePeptides === null) return true
  return tier.peptides.includes(peptideSlug)
}

/** The cheapest paid tier — any single peptide is buyable from Basic upward. */
export function minimumTierForPeptide(): MarketplaceTier {
  return BASE_TIER
}

export function classifyProductAccess(
  product: {
    name?: string | null
    description?: string | null
    category?: string | null
  },
  tier: MarketplaceTier
): ProductAccessClassification {
  const peptide = peptideForProduct(product)
  const group = peptide
    ? GROUP_BY_SLUG.get(peptide.group) ?? MARKETPLACE_GROUPS[0]
    : MARKETPLACE_GROUPS[0]

  // Unlimited tier (null limit) unlocks everything. Otherwise a product is
  // locked unless its peptide is in the member's resolved accessible set. A
  // product we can't map to a known peptide is treated as locked for non-
  // unlimited tiers (fail closed).
  const locked =
    tier.maxSelectablePeptides === null
      ? false
      : !peptide || !tier.peptides.includes(peptide.slug)

  return { group, peptide, locked, requiredTier: BASE_TIER }
}
