/**
 * Extract KoverX catalog content fields for Juvenex storefront slugs.
 * Run: node scripts/extract-koverx-content.cjs
 */
const fs = require('fs')
const path = require('path')

const catalogPath = path.join(__dirname, '..', '..', '..', 'Koverx', 'src', 'data', 'catalog.ts')
const t = fs.readFileSync(catalogPath, 'utf8')

const jxSlugs = [
  'sermorelin',
  'semaglutide',
  'tirzepatide',
  'metformin',
  'nad-injectable',
  'glutathione',
  'pt-141',
  'skincare',
  'cold-sores',
  'erectile-dysfunction',
  'herpes',
]

function extractBlock(slug) {
  const marker = `slug: "${slug}"`
  const start = t.indexOf(marker)
  if (start < 0) return null
  // walk back to opening brace of this product object
  let i = start
  while (i > 0 && t[i] !== '{') i--
  // find matching closing brace at product depth
  let depth = 0
  let end = i
  for (; end < t.length; end++) {
    if (t[end] === '{') depth++
    else if (t[end] === '}') {
      depth--
      if (depth === 0) {
        end++
        break
      }
    }
  }
  return t.slice(i, end)
}

function strField(block, key) {
  const m = block.match(new RegExp(key + ':\\s*"((?:\\\\.|[^"\\\\])*)"'))
  return m ? m[1].replace(/\\"/g, '"') : null
}

function arrField(block, key) {
  const m = block.match(new RegExp(key + ':\\s*\\[([\\s\\S]*?)\\]'))
  if (!m) return null
  return [...m[1].matchAll(/"((?:\\\\.|[^"\\\\])*)"/g)].map((x) => x[1].replace(/\\"/g, '"'))
}

function timelineField(block) {
  const m2 = block.match(/timeline:\s*\[([\s\S]*?)\]/)
  if (!m2) return null
  const items = []
  const re =
    /\{\s*period:\s*"((?:\\.|[^"\\])*)"\s*,\s*result:\s*"((?:\\.|[^"\\])*)"\s*\}/g
  let mm
  while ((mm = re.exec(m2[1]))) {
    items.push({ label: mm[1].replace(/\\"/g, '"'), text: mm[2].replace(/\\"/g, '"') })
  }
  return items.length ? items : null
}

const out = {}
for (const slug of jxSlugs) {
  const block = extractBlock(slug)
  if (!block) {
    console.error('missing', slug)
    continue
  }
  const key = slug === 'herpes' ? 'hpv' : slug
  out[key] = {
    description: strField(block, 'description') || undefined,
    subtitle: strField(block, 'subtitle') || undefined,
    bullets: arrField(block, 'bullets') || undefined,
    sideEffects: arrField(block, 'sideEffects') || undefined,
    includes: arrField(block, 'includes') || undefined,
    storage: strField(block, 'storage') || undefined,
    timeline: timelineField(block) || undefined,
  }
  // drop undefined keys for cleaner output
  for (const k of Object.keys(out[key])) {
    if (out[key][k] == null) delete out[key][k]
  }
}

const dest = path.join(__dirname, '..', 'src', 'lib', 'jx', 'storefront-product-content.ts')
const body = `/**
 * Product page informational content imported from KoverX catalog.ts.
 * Juvenex styling/layout only — this file is content, not presentation.
 * Keys match Juvenex storefront slugs (herpes → hpv).
 */

export interface StorefrontContentFaq {
  q: string
  a: string
}

export interface StorefrontContentTimelineItem {
  label: string
  text: string
}

export interface StorefrontProductContent {
  description?: string
  subtitle?: string
  bullets?: string[]
  sideEffects?: string[]
  includes?: string[]
  storage?: string
  timeline?: StorefrontContentTimelineItem[]
  faq?: StorefrontContentFaq[]
}

const RAW: Record<string, Omit<StorefrontProductContent, 'faq'>> = ${JSON.stringify(out, null, 2)}

function buildFaq(name: string, content: Omit<StorefrontProductContent, 'faq'>): StorefrontContentFaq[] {
  const faqs: StorefrontContentFaq[] = []
  if (content.description) {
    faqs.push({ q: \`Who is \${name} for?\`, a: content.description })
  }
  faqs.push({
    q: 'How is it shipped?',
    a: 'Discreetly, in unbranded packaging. Temperature-sensitive items ship with appropriate cold-chain handling when required.',
  })
  faqs.push({
    q: 'Can I cancel?',
    a: 'Yes. You can cancel anytime from your account. Ongoing prescriptions require provider review for refills.',
  })
  if (content.storage) {
    faqs.push({ q: 'How should I store this?', a: content.storage })
  }
  return faqs
}

/** Display names for FAQ personalization when product object is not passed. */
const NAMES: Record<string, string> = {
  sermorelin: 'Sermorelin',
  semaglutide: 'Semaglutide',
  tirzepatide: 'Tirzepatide',
  metformin: 'Metformin',
  'nad-injectable': 'NAD+',
  glutathione: 'Glutathione',
  'pt-141': 'PT-141',
  skincare: 'Skincare',
  'cold-sores': 'Cold Sores',
  'erectile-dysfunction': 'Erectile Dysfunction',
  hpv: 'HPV / Genital Herpes',
}

export function getStorefrontProductContent(slug: string): StorefrontProductContent | null {
  const raw = RAW[slug]
  if (!raw) return null
  const name = NAMES[slug] || slug
  return {
    ...raw,
    faq: buildFaq(name, raw),
  }
}
`

fs.writeFileSync(dest, body)
console.log('Wrote', dest, 'products:', Object.keys(out).length)
for (const [k, v] of Object.entries(out)) {
  console.log(k, {
    desc: !!v.description,
    bullets: v.bullets?.length,
    side: v.sideEffects?.length,
    timeline: v.timeline?.length,
    includes: v.includes?.length,
    storage: !!v.storage,
  })
}
