import type { ReactNode } from 'react'

interface OrgLayoutProps {
  children: ReactNode
  params: Promise<{ slug: string }>
}

export default async function OrgLayout({ children, params }: OrgLayoutProps) {
  const { slug } = await params

  // Fetch org data server-side to apply branding CSS variables
  let primaryColor = '#8FA888'
  let logoUrl: string | null = null

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/organizations/slug/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    })
    if (res.ok) {
      const json = await res.json()
      const org = json?.data
      if (org?.primary_color) primaryColor = org.primary_color
      if (org?.logo_url) logoUrl = org.logo_url
    }
  } catch {
    // fall through with defaults
  }

  return (
    <div
      style={
        {
          '--org-primary-color': primaryColor,
          '--org-logo': logoUrl ? `url(${logoUrl})` : 'none',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
