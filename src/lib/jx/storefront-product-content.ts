/**
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

const RAW: Record<string, Omit<StorefrontProductContent, 'faq'>> = {
  "sermorelin": {
    "description": "GHRH peptide analog. Stimulates the pituitary to release natural human growth hormone — a physiologic, not pharmacologic, approach.",
    "subtitle": "Live longer, function better.",
    "bullets": [
      "Stimulates natural HGH production",
      "Improves fat metabolism",
      "Enhances skin elasticity",
      "Supports deeper, more restorative sleep",
      "Boosts recovery and lean mass"
    ],
    "sideEffects": [
      "Injection site reactions",
      "Headache",
      "Nausea",
      "Dizziness",
      "Hyperactivity",
      "Flushing",
      "Tingling"
    ],
    "timeline": [
      {
        "label": "Week 1–2",
        "text": "Improved sleep and morning energy"
      },
      {
        "label": "Month 2",
        "text": "Fewer fine lines, better hair and nails"
      },
      {
        "label": "Month 3+",
        "text": "Fat loss, lean muscle gain, recovery"
      }
    ]
  },
  "semaglutide": {
    "description": "GLP-1 medication for weight management. Compounded, not FDA-approved. Your dose, one price — flat monthly rate with no surprises as your dose is titrated.",
    "subtitle": "Feel lighter — it works.",
    "bullets": [
      "Ongoing provider care and support",
      "Syringes and alcohol pad kit included",
      "Platform access and educational content",
      "Refrigerated, discreet shipping"
    ],
    "sideEffects": [
      "Nausea",
      "Vomiting",
      "Diarrhea",
      "Hypoglycemia risk",
      "Thyroid tumor risk (rodent studies)",
      "Not for patients with a history of pancreatitis"
    ],
    "includes": [
      "Ongoing provider care and support",
      "Syringes and alcohol pads kit",
      "Platform access and educational content"
    ],
    "storage": "Store in refrigerator between doses"
  },
  "tirzepatide": {
    "description": "Dual GLP-1 and GIP receptor therapy for weight management. Compounded, not FDA-approved. Flat monthly rate regardless of dose adjustments.",
    "subtitle": "Feel lighter — it works.",
    "bullets": [
      "Dual GLP-1 and GIP mechanism",
      "Ongoing provider care included",
      "Syringes and alcohol pads kit",
      "Flat price as dose titrates"
    ],
    "sideEffects": [
      "Nausea",
      "Vomiting",
      "Diarrhea",
      "Hypoglycemia risk",
      "Thyroid tumor risk (rodent studies)"
    ],
    "storage": "Store in refrigerator between doses"
  },
  "metformin": {
    "description": "Caloric restriction mimetic with decades of safety data, used off-label for metabolic health and longevity. Activates AMPK and supports autophagy.",
    "subtitle": "Built for better metabolism.",
    "bullets": [
      "Enhances insulin sensitivity",
      "May reduce visceral fat",
      "Supports mitochondrial function",
      "May reduce risk of age-related diseases",
      "Activates AMPK / autophagy pathways"
    ],
    "sideEffects": [
      "Nausea",
      "Diarrhea",
      "Gas",
      "Metallic taste",
      "B12 deficiency (annual check recommended)",
      "Lactic acidosis (rare)"
    ],
    "timeline": [
      {
        "label": "Week 1–2",
        "text": "Blood sugar and appetite control"
      },
      {
        "label": "Week 4+",
        "text": "Sustained energy, fat loss, mental clarity"
      }
    ]
  },
  "nad-injectable": {
    "description": "Mitochondrial support therapy. Intramuscular or subcutaneous injection. Restores cellular NAD+ to support energy production, DNA repair, and sirtuin activation.",
    "subtitle": "Brain + body energy protocol.",
    "bullets": [
      "Cellular energy and mitochondrial function",
      "DNA repair and sirtuin activation",
      "Whole-body anti-aging support",
      "Sharper focus and steady energy"
    ],
    "sideEffects": [
      "Injection site soreness",
      "Warm flushing",
      "Headache",
      "Nausea",
      "Fatigue",
      "Anxiety (rare)"
    ]
  },
  "glutathione": {
    "description": "The body's most powerful antioxidant, delivered by injection for superior bioavailability versus oral forms.",
    "subtitle": "Endurance and focus, naturally.",
    "bullets": [
      "Detoxification support",
      "Immune support",
      "Mitochondrial function",
      "Cellular repair",
      "Combats oxidative stress",
      "Liver support",
      "Skin clarity"
    ]
  },
  "pt-141": {
    "description": "Melanocortin receptor agonist that works through the central nervous system, not through blood flow.",
    "subtitle": "PT-141 Bremelanotide injection.",
    "bullets": [
      "Works centrally, not vascularly",
      "Onset 45–60 minutes",
      "6–12 hour duration",
      "1.75mg standard dose"
    ],
    "sideEffects": [
      "Nausea",
      "Flushing",
      "Headache",
      "Injection site reactions",
      "Elevated blood pressure",
      "Fatigue",
      "Skin darkening (rare)"
    ]
  },
  "skincare": {
    "description": "Custom-compounded prescription skincare. Anti-aging and dark-spot formulations matched to your skin level — sensitive, normal, or high potency — and adjusted by your physician.",
    "subtitle": "Dermatologist-formulated for younger skin.",
    "bullets": [
      "Anti-aging: tretinoin + niacinamide + hyaluronic acid",
      "Dark spots: hydroquinone blend with vitamin C",
      "Three strength levels: novice, intermediate, pro",
      "Physician-titrated based on response"
    ]
  },
  "cold-sores": {
    "description": "On-demand antiviral therapy for cold sore outbreaks.",
    "subtitle": "Faster relief. Greater control."
  },
  "erectile-dysfunction": {
    "description": "Fast-acting PDE5 inhibitor, 4–6 hour window.",
    "subtitle": "Most trusted ED medications.",
    "sideEffects": [
      "Headache",
      "Facial flushing",
      "Nasal congestion",
      "Upset stomach",
      "Dizziness",
      "Vision changes",
      "Back pain",
      "Priapism (rare)"
    ]
  },
  "hpv": {
    "description": "Antiviral suppression or episodic treatment, prescribed after physician review.",
    "subtitle": "Faster relief. Greater control."
  }
}

function buildFaq(name: string, content: Omit<StorefrontProductContent, 'faq'>): StorefrontContentFaq[] {
  const faqs: StorefrontContentFaq[] = []
  if (content.description) {
    faqs.push({ q: `Who is ${name} for?`, a: content.description })
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
