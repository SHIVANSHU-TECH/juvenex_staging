import type { Metadata } from 'next'
import { getCatalog } from '@/lib/jx/server'
import { getHeroMedia } from '@/lib/jx/hero-media'
import { CategoryGrid } from '@/components/jx/landing/CategoryGrid'
import { FeatureTiles } from '@/components/jx/landing/FeatureTiles'
import { FeaturedBanner, pickFeatured } from '@/components/jx/landing/FeaturedBanner'
import { GoalGrid } from '@/components/jx/landing/GoalGrid'
import { Hero } from '@/components/jx/landing/Hero'
import { HowItWorks } from '@/components/jx/landing/HowItWorks'
import { Membership } from '@/components/jx/landing/Membership'
import { QuizCta } from '@/components/jx/landing/QuizCta'
import { RecommendedRail } from '@/components/jx/landing/RecommendedRail'
import { resolveRecommended } from '@/components/jx/landing/recommended'
import { Testimonials } from '@/components/jx/landing/Testimonials'
import { TrustStrip } from '@/components/jx/landing/TrustStrip'
import { ValueProps } from '@/components/jx/landing/ValueProps'
import '@/components/jx/landing/landing.css'

export const metadata: Metadata = {
  title: 'Personalized health. Elevated results.',
  description:
    'Compounded Semaglutide and Tirzepatide from licensed 503A & 503B pharmacies, physician-guided protocols, and the app that keeps you on plan.',
  alternates: { canonical: 'https://juvenex.space' },
}

/**
 * The Juvenex landing page — a port of the signed-off "Juvenex Site" design,
 * section for section.
 *
 * A server component that reads the live catalogue once and hands plain data
 * to the sections; only the hero (scroll choreography), the recommendation
 * rail (scroll buttons) and the feature tiles (tilt) cross into the client.
 *
 * `getCatalog()` is cached for five minutes upstream and never throws, so a
 * partner-API outage degrades to design pricing with no add-to-cart rather
 * than a 500 — `resolveRecommended` only wires the bag to real rows.
 */
export default async function HomePage() {
  const [{ unique, error }, heroMedia] = await Promise.all([getCatalog(), getHeroMedia()])
  const recommended = resolveRecommended(unique)
  const featured = pickFeatured(unique)

  return (
    <>
      <Hero videoA={heroMedia.videoA} videoB={heroMedia.videoB} />
      <TrustStrip />
      <CategoryGrid />
      <RecommendedRail items={recommended} error={error} />
      <FeaturedBanner product={featured} />
      <GoalGrid />
      <FeatureTiles />
      <Membership />
      <HowItWorks />
      <Testimonials />
      <QuizCta />
      <ValueProps />
    </>
  )
}
