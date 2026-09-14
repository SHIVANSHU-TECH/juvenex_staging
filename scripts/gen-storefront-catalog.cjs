/**
 * Generate storefront catalog from KoverX structure + juvenex.xlsx SKU→product_id.
 * Run: node scripts/gen-storefront-catalog.cjs
 */
const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

const koverxPath =
  'c:/Users/hp/Downloads/checkout_code_main-main/funnelll/Koverx/src/data/catalog.ts'
const excelPath =
  'c:/Users/hp/Downloads/checkout_code_main-main/funnelll/juvenex.xlsx'
const outPath = path.join(__dirname, '../src/lib/jx/storefront-catalog.generated.ts')

// Preferred product_ids when Excel has duplicates (audit special rules).
const PREFER_ID = {
  'SEMA-0.5MG-30-D': '2',
  'SG-MAINT-S3-A': '47', // 0.25 mg/week 3M — not MAINT 1mg id=13
  'SEMA-0.5MG-30-D-6M': '35',
  'SEMA-0.5MG-30-D-12M': '41',
  'TIRZ-CR1': '50',
  'TZ-MAINT-S2-A': '51',
  'TIRZ-2.5MG-30-6B': '52',
  'TIRZ-2.5MG-30-12B': '53',
  'CRM-NAD-INJ-1M': '142',
}

const DOSAGE_BY_SKU = {
  'SEMA-0.5MG-30-D': '0.5 mg/week',
  'SG-MAINT-S3-A': '0.25 mg/week',
  'SEMA-0.5MG-30-D-6M': '0.5 mg/week',
  'SEMA-0.5MG-30-D-12M': '0.5 mg/week',
  'TIRZ-CR1': '2.5 mg/week',
  'TZ-MAINT-S2-A': '2.5 mg/week',
  'TIRZ-2.5MG-30-6B': '2.5 mg/week',
  'TIRZ-2.5MG-30-12B': '2.5 mg/week',
}

const wb = XLSX.readFile(excelPath)
const bySku = new Map()
for (const sheet of wb.SheetNames) {
  for (const r of XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' })) {
    const o = {}
    for (const [k, v] of Object.entries(r)) o[k.trim()] = v
    const sku = String(o.product_sku || o.SKU || o["SKU's"] || '').trim()
    const link = String(
      o.CHECKOUT_LINKS || o['Checkout Links'] || o['checkout links'] || ''
    ).trim()
    const id = (link.match(/[?&]id=(\d+)/) || [])[1]
    if (!sku || !id) continue
    if (!bySku.has(sku)) bySku.set(sku, [])
    bySku.get(sku).push({
      id,
      link,
      price: Number(o.New_price || o.Price || o.COST || o.product_price || o.PRICE || 0) || 0,
      sheet,
    })
  }
}

function resolveSku(sku) {
  const hits = bySku.get(sku) || []
  if (!hits.length) return null
  const prefer = PREFER_ID[sku]
  const hit = prefer ? hits.find((h) => h.id === prefer) || hits[0] : hits[0]
  return hit
}

// Minimal product definitions mirroring KoverX structure for mappable items only.
const PRODUCTS = [
  {
    slug: 'sermorelin',
    name: 'Sermorelin',
    category: 'hrt',
    tagline: 'Growth hormone stimulation peptide',
    pricingType: 'single',
    plans: [
      { label: '1 month', sku: 'SERM-30-1B', months: 1 },
      { label: '3 months', sku: 'SERM-30-3B', months: 3 },
      { label: '6 months', sku: 'SERM-6M', months: 6 },
      { label: '12 months', sku: 'SERM-12M', months: 12 },
    ],
  },
  {
    slug: 'semaglutide',
    name: 'Semaglutide',
    category: 'weight-loss',
    tagline: 'GLP-1 weekly injectable',
    pricingType: 'single',
    plans: [
      { label: '1 month', sku: 'SEMA-0.5MG-30-D', months: 1 },
      { label: '3 months', sku: 'SG-MAINT-S3-A', months: 3 },
      { label: '6 months', sku: 'SEMA-0.5MG-30-D-6M', months: 6 },
      { label: '12 months', sku: 'SEMA-0.5MG-30-D-12M', months: 12 },
    ],
  },
  {
    slug: 'tirzepatide',
    name: 'Tirzepatide',
    category: 'weight-loss',
    tagline: 'Dual GIP/GLP-1 weekly injectable',
    pricingType: 'single',
    plans: [
      { label: '1 month', sku: 'TIRZ-CR1', months: 1 },
      { label: '3 months', sku: 'TZ-MAINT-S2-A', months: 3 },
      { label: '6 months', sku: 'TIRZ-2.5MG-30-6B', months: 6 },
      { label: '12 months', sku: 'TIRZ-2.5MG-30-12B', months: 12 },
    ],
  },
  {
    slug: 'metformin',
    name: 'Metformin',
    category: 'weight-loss',
    tagline: 'Metabolic support',
    pricingType: 'single',
    plans: [
      { label: '1 month', sku: 'METFORM-1M', months: 1 },
      { label: '3 months', sku: 'CRM-ANTIAGE-METFORM-3M', months: 3 },
      { label: '6 months', sku: 'METFORM-6M', months: 6 },
      { label: '12 months', sku: 'METFORM-12M', months: 12 }, // no Excel checkout id → skipped
    ],
  },
  {
    slug: 'nad-injectable',
    name: 'NAD+ Injectable',
    category: 'longevity',
    tagline: 'Cellular energy support',
    pricingType: 'single',
    plans: [
      { label: '1 month', sku: 'CRM-NAD-INJ-1M', months: 1 },
      { label: '3 months', sku: 'NADINJ-3M', months: 3 },
      { label: '6 months', sku: 'NADINJ-6M', months: 6 },
      { label: '12 months', sku: 'NADINJ-12M', months: 12 },
    ],
  },
  {
    slug: 'glutathione',
    name: 'Glutathione',
    category: 'longevity',
    tagline: 'Antioxidant support',
    pricingType: 'single',
    plans: [
      { label: '1 month', sku: 'CRM-GLUTATH-1M', months: 1 },
      { label: '3 months', sku: 'GLUTA-3M', months: 3 },
      { label: '6 months', sku: 'GLUTA-6M', months: 6 },
      { label: '12 months', sku: 'GLUTA-12M', months: 12 },
    ],
  },
  {
    slug: 'pt-141',
    name: 'PT-141',
    category: 'sexual-wellness',
    tagline: 'Bremelanotide',
    pricingType: 'single',
    plans: [
      { label: '1 month', sku: 'PT141-1M', months: 1 },
      { label: '3 months', sku: 'PT141-3M', months: 3 },
      { label: '6 months', sku: 'PT141-6M', months: 6 },
      { label: '12 months', sku: 'PT141-12M', months: 12 },
    ],
  },
  {
    slug: 'skincare',
    name: 'Skincare',
    category: 'hair-skin',
    tagline: 'Compounded topical treatments',
    pricingType: 'medications',
    medications: [
      { name: 'Anti-Aging (Sensitive)', sku: 'TRE-NIA-HYA-30B', months: 3 },
      { name: 'Anti-Aging (Normal)', sku: 'TRE-NIA-HYA-60B', months: 3 },
      { name: 'Anti-Aging (High Potency)', sku: 'TRE-NIA-HYA-89B', months: 3 },
      { name: 'Brightening (HQ 6%)', sku: 'HYD-VIT-NIA', months: 3 },
      { name: 'Brightening (HQ 8%)', sku: 'HYD-TRE-VIT-NIA', months: 3 },
      { name: 'Brightening (HQ 12%)', sku: 'HYD-TRE-NIA-HYD', months: 3 },
    ],
  },
  {
    slug: 'hpv',
    name: 'HPV / Genital Herpes',
    category: 'other',
    tagline: 'Valacyclovir packs',
    pricingType: 'medications',
    medications: [
      { name: 'Valacyclovir 500mg × 36', sku: 'Valacyclovir500mg', months: 1 },
      { name: 'Valacyclovir 500mg × 90', sku: 'Valacyclovir500mgx90', months: 3 },
      { name: 'Valacyclovir 1g × 90', sku: 'Valacyclovir1gx90', months: 3 },
    ],
  },
  {
    slug: 'cold-sores',
    name: 'Cold Sores',
    category: 'other',
    tagline: 'Valacyclovir 1g',
    pricingType: 'single',
    plans: [{ label: 'Supply pack', sku: 'VALA-1G-24', months: 1 }],
  },
]

// Pull ED matrix from KoverX catalog source by regex for matched SKUs only
const koverx = fs.readFileSync(koverxPath, 'utf8')
const edBlock = koverx.match(
  /slug:\s*"erectile-dysfunction"[\s\S]*?slug:\s*"premature-ejaculation"/
)
const edMeds = []
if (edBlock) {
  // Parse only inside `medications: [...]` so the product title is not treated as a med.
  const medsSection = edBlock[0].match(/medications:\s*\[([\s\S]*?)\n\s*\],\s*\n\s*description:/)
  const medsSrc = medsSection ? medsSection[1] : edBlock[0]
  const medMatches = [
    ...medsSrc.matchAll(
      /\{\s*name:\s*"([^"]+)"[\s\S]*?plans:\s*\[([\s\S]*?)\]\s*,?\s*\}/g
    ),
  ]
  for (const m of medMatches) {
    const name = m[1]
    if (name === 'Erectile Dysfunction') continue
    const plansRaw = m[2]
    const plans = [...plansRaw.matchAll(/label:\s*"([^"]+)"[\s\S]*?sku:\s*"([^"]+)"/g)].map(
      (p) => ({ label: p[1], sku: p[2] })
    )
    const mapped = plans
      .map((p) => {
        const hit = resolveSku(p.sku)
        if (!hit) return null
        const months = /(\d+)\s*month/i.test(p.label)
          ? Number(RegExp.$1)
          : 1
        return {
          label: p.label,
          sku: p.sku,
          months,
          productId: hit.id,
          checkoutUrl: hit.link,
          price: hit.price,
          dosage: DOSAGE_BY_SKU[p.sku] || '',
        }
      })
      .filter(Boolean)
    if (mapped.length) edMeds.push({ name, plans: mapped })
  }
}

if (edMeds.length) {
  PRODUCTS.push({
    slug: 'erectile-dysfunction',
    name: 'Erectile Dysfunction',
    category: 'sexual-wellness',
    tagline: 'Sildenafil & Tadalafil',
    pricingType: 'medications',
    medications: edMeds.map((m) => ({
      name: m.name,
      // flatten: use first plan sku placeholder; actual plans nested below
      sku: m.plans[0].sku,
      months: m.plans[0].months,
      plans: m.plans,
    })),
  })
}

const CATEGORIES = [
  { key: 'weight-loss', label: 'Weight Loss', navLabel: 'Weight Loss' },
  { key: 'hrt', label: 'Hormone Optimization', navLabel: 'HRT' },
  { key: 'longevity', label: 'Longevity', navLabel: 'Longevity' },
  { key: 'sexual-wellness', label: 'Sexual Wellness', navLabel: 'Sexual Wellness' },
  { key: 'hair-skin', label: 'Hair & Skin', navLabel: 'Hair & Skin' },
  { key: 'other', label: 'Lifestyle', navLabel: 'Lifestyle' },
]

function mapPlan(plan) {
  const hit = resolveSku(plan.sku)
  if (!hit) return null
  return {
    label: plan.label,
    sku: plan.sku,
    months: plan.months,
    productId: hit.id,
    checkoutUrl: hit.link,
    price: hit.price,
    dosage: DOSAGE_BY_SKU[plan.sku] || plan.dosage || '',
  }
}

const built = []
const skipped = []

// Document KoverX products with no confident Juvenex Excel checkout mapping.
const KOVERX_ONLY = [
  'premature-ejaculation',
  'mens-hair-loss',
  'womens-hair-loss',
  'eyelash-treatment',
  'birth-control',
  'acid-reflux',
  'smoking-cessation',
]
for (const slug of KOVERX_ONLY) {
  skipped.push({
    product: slug,
    reason: 'koverx_only_no_confident_excel_checkout_map',
    skus: [],
  })
}

skipped.push({
  product: 'sg-maint-s3-a-excel-duplicate',
  reason: 'ambiguous_excel_rows_prefer_productId_47_over_13',
  skus: ['SG-MAINT-S3-A'],
})

for (const p of PRODUCTS) {
  if (p.pricingType === 'single') {
    const plans = p.plans.map(mapPlan).filter(Boolean)
    const missing = p.plans.filter((pl) => !resolveSku(pl.sku)).map((pl) => pl.sku)
    if (missing.length) skipped.push({ product: p.slug, skus: missing })
    if (!plans.length) continue
    built.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tagline: p.tagline,
      pricingType: 'single',
      plans,
      startingPrice: Math.min(...plans.map((x) => x.price)),
    })
  } else if (p.slug === 'erectile-dysfunction') {
    built.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tagline: p.tagline,
      pricingType: 'medications',
      medications: p.medications,
      startingPrice: Math.min(
        ...p.medications.flatMap((m) => (m.plans || []).map((x) => x.price))
      ),
    })
  } else {
    const meds = []
    for (const m of p.medications) {
      if (m.plans) {
        meds.push(m)
        continue
      }
      const hit = resolveSku(m.sku)
      if (!hit) {
        skipped.push({ product: p.slug, skus: [m.sku] })
        continue
      }
      meds.push({
        name: m.name,
        sku: m.sku,
        months: m.months,
        productId: hit.id,
        checkoutUrl: hit.link,
        price: hit.price,
        dosage: '',
        plans: [
          {
            label: `${m.months} month${m.months > 1 ? 's' : ''}`,
            sku: m.sku,
            months: m.months,
            productId: hit.id,
            checkoutUrl: hit.link,
            price: hit.price,
            dosage: '',
          },
        ],
      })
    }
    if (!meds.length) continue
    const prices = meds.flatMap((m) =>
      (m.plans || [{ price: m.price }]).map((x) => x.price)
    )
    built.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tagline: p.tagline,
      pricingType: 'medications',
      medications: meds,
      startingPrice: Math.min(...prices),
    })
  }
}

const usedCategories = CATEGORIES.filter((c) =>
  built.some((p) => p.category === c.key)
)

const header = `/**
 * AUTO-GENERATED storefront merchandising catalog.
 * Sources: KoverX product organization + juvenex.xlsx SKU→checkout id mapping.
 * Do not edit by hand — regenerate via scripts/gen-storefront-catalog.cjs
 *
 * Checkout still uses WhiteLabelMD productId (Excel ?id=). Prices shown here
 * are Excel display prices; create-intent re-prices from Get_Product_Details.
 */

export type StorefrontCategoryKey =
${usedCategories.map((c) => `  | '${c.key}'`).join('\n')}

export interface StorefrontCategory {
  key: StorefrontCategoryKey
  label: string
  navLabel: string
}

export interface StorefrontPlan {
  label: string
  sku: string
  months: number
  productId: string
  checkoutUrl: string
  price: number
  dosage: string
}

export interface StorefrontMedication {
  name: string
  sku?: string
  months?: number
  productId?: string
  checkoutUrl?: string
  price?: number
  dosage?: string
  plans?: StorefrontPlan[]
}

export interface StorefrontProduct {
  slug: string
  name: string
  category: StorefrontCategoryKey
  tagline: string
  pricingType: 'single' | 'medications'
  plans?: StorefrontPlan[]
  medications?: StorefrontMedication[]
  startingPrice: number
}

export const STOREFRONT_CATEGORIES: StorefrontCategory[] = ${JSON.stringify(usedCategories, null, 2)}

export const STOREFRONT_PRODUCTS: StorefrontProduct[] = ${JSON.stringify(built, null, 2)}

export const STOREFRONT_SKIPPED = ${JSON.stringify(skipped, null, 2)} as const

export function getStorefrontProduct(slug: string): StorefrontProduct | undefined {
  return STOREFRONT_PRODUCTS.find((p) => p.slug === slug)
}

export function getStorefrontProductsByCategory(
  key: StorefrontCategoryKey | null
): StorefrontProduct[] {
  if (!key) return STOREFRONT_PRODUCTS
  return STOREFRONT_PRODUCTS.filter((p) => p.category === key)
}

export function findStorefrontPlanByProductId(
  productId: string
): { product: StorefrontProduct; plan: StorefrontPlan } | undefined {
  for (const product of STOREFRONT_PRODUCTS) {
    for (const plan of product.plans ?? []) {
      if (plan.productId === productId) return { product, plan }
    }
    for (const med of product.medications ?? []) {
      for (const plan of med.plans ?? []) {
        if (plan.productId === productId) return { product, plan }
      }
      if (med.productId === productId && med.plans?.[0]) {
        return { product, plan: med.plans[0] }
      }
    }
  }
  return undefined
}
`

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, header)
console.log('Wrote', outPath)
console.log('Products', built.length, 'Skipped', skipped)
console.log('Categories', usedCategories.map((c) => c.key))
