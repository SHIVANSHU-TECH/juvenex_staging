/**
 * Landing-page copy, in one place.
 *
 * Wording, ordering and card counts are verbatim from the
 * "Juvenex Site.dc.html" design — the client signed that design off and asked
 * for it as drawn. The only things that move are hrefs: the design pointed at
 * `#anchor` placeholders and absolute `https://juvenex.app/...` URLs, and every
 * one of them here resolves to a real route in this app.
 *
 * Where the design merchandises something the live catalogue cannot sell
 * (supplements, wearables, lab testing, four non-GLP-1 peptides) the card still
 * ships as drawn but its call to action goes to `/telehealth` — never to a
 * checkout for a product that does not exist. See `recommended.ts`.
 */

import type { Molecule } from '@/lib/jx/catalog'

export interface HeroPhase {
  eyebrow: string
  headline: string
  body: string
}

/** Phases 01–03 of the hero. Phase 0 (wordmark) and 4 (CTA) live in Hero.tsx. */
export const HERO_SEQUENCE: HeroPhase[] = [
  {
    eyebrow: '01 · Sequence',
    headline: 'It starts with a single bond.',
    body: 'Every formula begins as a verified amino sequence, written to do one job.',
  },
  {
    eyebrow: '02 · Assembly',
    headline: 'Arranged with intent.',
    body: 'Chains form under controlled synthesis. Nothing else makes it into the vial.',
  },
  {
    eyebrow: '03 · Transformation',
    headline: 'The molecule becomes medicine.',
    body: 'Purified, measured and folded into its final form.',
  },
]

export interface PhotoCard {
  href: string
  title: string
  desc: string
  /** File under /public/jx/uploads. */
  image: string
  /** Non-empty only when the photo carries information; these are decorative. */
  alt: string
}

/**
 * Design lines 133–185. Photography mapping is the design's own.
 *
 * Only Peptides and Bundles & Protocols have catalogue rows behind them, so
 * the other three send the visitor to a provider rather than to an empty grid.
 */
export const CATEGORIES: PhotoCard[] = [
  {
    href: '/store',
    title: 'Peptides',
    desc: 'Clinically trusted peptides for every goal',
    image: 'n4n5h.jpg',
    alt: '',
  },
  {
    href: '/telehealth',
    title: 'Supplements',
    desc: 'Science-backed formulas for your best',
    image: 'vPN5X.jpg',
    alt: '',
  },
  {
    href: '/store?kind=program',
    title: 'Bundles & Protocols',
    desc: 'Curated protocols designed for real results',
    image: 'WOBL6.jpg',
    alt: '',
  },
  {
    href: '/telehealth',
    title: 'Wearables',
    desc: 'Track, measure, and optimize your health',
    image: 'KIb5b.jpg',
    alt: '',
  },
  {
    href: '/telehealth',
    title: 'Lab Testing',
    desc: 'Advanced testing. Personalized insights.',
    image: '7NxrC.jpg',
    alt: '',
  },
]

/** Design lines 276–315. */
export const GOALS: PhotoCard[] = [
  {
    href: '/store',
    title: 'Weight Loss',
    desc: 'GLP-1 protocols',
    image: 'sP6nn.jpg',
    alt: '',
  },
  {
    href: '/telehealth',
    title: 'Muscle & Performance',
    desc: 'Growth & recovery',
    image: 'Zv9V8.jpg',
    alt: '',
  },
  {
    href: '/telehealth',
    title: 'Sleep & Recovery',
    desc: 'Rest, repaired',
    image: 'vynSh.jpg',
    alt: '',
  },
  {
    href: '/telehealth',
    title: 'Healthy Aging',
    desc: 'Longevity & skin',
    image: 'RurP8.jpg',
    alt: '',
  },
  {
    href: '/telehealth',
    title: 'Energy & Focus',
    desc: 'Cognitive & vitality',
    image: '8XmGp.jpg',
    alt: '',
  },
]

export interface RecCard {
  /** Product name as drawn, e.g. "Tirzepatide". */
  name: string
  /** Strength as drawn, in mg. */
  doseMg: number
  /** Price as drawn. Shown only when no live product backs the card. */
  designPrice: number
  rating: number
  reviews: number
  /** Fill colour for the generated vial artwork. */
  accent: string
  /**
   * Molecule to look up in the live catalogue. Null for the four products the
   * design invented — those cards route to a consult instead of the bag.
   */
  molecule: Molecule | null
}

/**
 * Design lines 187–257, in the design's order.
 *
 * The design's five vial PNGs were lost with the source project, so the
 * artwork is `<JxVial>` with a per-product accent instead.
 */
export const REC_CARDS: RecCard[] = [
  {
    name: 'Tirzepatide',
    doseMg: 10,
    designPrice: 199,
    rating: 4.8,
    reviews: 1240,
    accent: '#4A5A48',
    molecule: 'Tirzepatide',
  },
  {
    name: 'Semaglutide',
    doseMg: 5,
    designPrice: 179,
    rating: 4.9,
    reviews: 2077,
    accent: '#63705B',
    molecule: 'Semaglutide',
  },
  {
    name: 'NAD+',
    doseMg: 500,
    designPrice: 149,
    rating: 4.7,
    reviews: 842,
    accent: '#6E8896',
    molecule: null,
  },
  {
    name: 'Glutathione',
    doseMg: 600,
    designPrice: 79,
    rating: 4.8,
    reviews: 610,
    accent: '#8FA39B',
    molecule: null,
  },
  {
    name: 'CJC-1295',
    doseMg: 5,
    designPrice: 129,
    rating: 4.9,
    reviews: 405,
    accent: '#7C8F6E',
    molecule: null,
  },
  {
    name: 'Ipamorelin',
    doseMg: 5,
    designPrice: 89,
    rating: 4.8,
    reviews: 356,
    accent: '#8A7F5C',
    molecule: null,
  },
]

export interface Tier {
  kicker: string
  name: string
  price: string
  features: string[]
  featured?: boolean
  cta: string
}

/** Design lines 352–403, verbatim. */
export const TIERS: Tier[] = [
  {
    kicker: 'Starter',
    name: 'Weight loss protocol',
    price: '$95',
    cta: 'Get started',
    features: [
      'Weight loss protocol',
      'Semaglutide & Tirzepatide access',
      'Talk to a telehealth doctor',
    ],
  },
  {
    kicker: 'Plus',
    name: 'Weight loss + 1 protocol',
    price: '$129',
    cta: 'Start consult',
    featured: true,
    features: [
      'Weight loss protocol included',
      'Choose 1 additional protocol',
      'Metabolic, growth, or sexual health',
    ],
  },
  {
    kicker: 'Recomposition',
    name: 'Choose three protocols',
    price: '$179',
    cta: 'Get started',
    features: [
      'Choose 3 protocols',
      'Weight loss, metabolic, growth, or sexual health',
      'Expanded marketplace access',
    ],
  },
  {
    kicker: 'Unlimited',
    name: 'Everything, unlimited',
    price: '$219',
    cta: 'Get started',
    features: [
      'All protocols included',
      'Unlimited marketplace access',
      'Personalized ongoing support',
    ],
  },
]

/** Design lines 405–432, verbatim. */
export const STEPS = [
  {
    n: 'Step 01',
    title: 'Sign up.',
    body: 'Create your account and get access to the full app experience.',
  },
  {
    n: 'Step 02',
    title: 'Build your profile.',
    body: 'Add goals, preferences, and the protocol you want to explore.',
  },
  {
    n: 'Step 03',
    title: 'Track and post updates.',
    body: 'Log weight, meals, and GLP-1 progress, and share your wins.',
  },
  {
    n: 'Step 04',
    title: 'See real results.',
    body: 'Learn from other members in the feed and stay accountable.',
  },
]

/** Design lines 434–473, verbatim. */
export const MEMBER_RATING = { rating: 4.9, reviews: 12400 }

export const QUOTES = [
  {
    quote: 'The app made tracking easy enough that I kept doing it past week four.',
    who: 'Sarah M.',
    initials: 'SM',
    topic: 'Tracking',
  },
  {
    quote: 'The telehealth consult was the first visit that did not feel rushed.',
    who: 'James K.',
    initials: 'JK',
    topic: 'Telehealth',
  },
  {
    quote: 'The protocol tracking alone is worth it. I never felt like I was guessing.',
    who: 'Devon R.',
    initials: 'DR',
    topic: 'Protocols',
  },
  {
    quote: 'The community feed kept me accountable when motivation dipped.',
    who: 'Priya A.',
    initials: 'PA',
    topic: 'Community',
  },
]
