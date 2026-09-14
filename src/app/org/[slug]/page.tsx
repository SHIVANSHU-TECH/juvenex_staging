import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import AdminShortcut from './AdminShortcut'

interface OrgData {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string | null
  referral_code?: string
}

interface OrgPageProps {
  params: Promise<{ slug: string }>
}

async function fetchOrg(slug: string): Promise<OrgData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const res = await fetch(
      `${baseUrl}/api/organizations/slug/${encodeURIComponent(slug)}`,
      { next: { revalidate: 60 } }
    )
    if (!res.ok) return null
    const json = await res.json()
    return (json?.data as OrgData) ?? null
  } catch {
    return null
  }
}

export default async function OrgLandingPage({ params }: OrgPageProps) {
  const { slug } = await params
  const org = await fetchOrg(slug)

  if (!org) {
    notFound()
  }

  const primaryColor = org.primary_color ?? '#8FA888'
  const registerHref = org.referral_code
    ? `/register?ref=${encodeURIComponent(org.referral_code)}`
    : '/register'

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-center gap-4 border-b border-[#E5EAE3]">
        {org.logo_url ? (
          <Image
            src={org.logo_url}
            alt={`${org.name} logo`}
            className="w-12 h-12 rounded-xl object-contain bg-white p-1 shadow"
            width={48}
            height={48}
          />
        ) : (
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow"
            style={{ backgroundColor: primaryColor }}
          >
            {org.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-xl font-bold text-[#2D352C]">{org.name}</span>
        <div className="ml-auto">
          <AdminShortcut
            orgId={org.id}
            orgSlug={org.slug}
            primaryColor={primaryColor}
          />
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-2xl mx-auto space-y-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#2D352C] leading-tight">
            Welcome to{' '}
            <span style={{ color: primaryColor }}>{org.name}</span>
          </h1>

          <p className="text-lg text-[#6B7567] max-w-lg mx-auto leading-relaxed">
            Your personalized GLP-1 companion — meal tracking, smart
            nutrition, telehealth, and expert dosing guidance all in one place.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link
              href={registerHref}
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-white font-bold text-lg shadow-lg hover:opacity-90 transition-opacity"
              style={{ backgroundColor: primaryColor }}
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl font-bold text-lg border-2 hover:bg-[#F0F2EE] transition-colors"
              style={{ borderColor: primaryColor, color: primaryColor }}
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl w-full">
          {[
            {
              title: 'Meal Plans',
              description:
                'Personalized nutrition optimized for your GLP-1 journey.',
              icon: '🥗',
            },
            {
              title: 'Telehealth',
              description:
                'Connect with healthcare providers from the comfort of home.',
              icon: '🩺',
            },
            {
              title: 'Dosing Protocols',
              description:
                'Expert-guided titration schedules and medication tracking.',
              icon: '📋',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="bg-white rounded-2xl p-6 shadow-md border border-[#E5EAE3] text-left"
            >
              <div className="text-3xl mb-3">{feature.icon}</div>
              <h3 className="font-bold text-[#2D352C] text-lg mb-1">
                {feature.title}
              </h3>
              <p className="text-sm text-[#6B7567] leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 text-center text-sm text-[#8B9B83] border-t border-[#E5EAE3]">
        Powered by Juvenex &middot; {org.name}
      </footer>
    </div>
  )
}
