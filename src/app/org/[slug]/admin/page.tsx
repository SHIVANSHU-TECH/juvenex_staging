'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import OverviewTab from '@/components/org-admin/OverviewTab'
import MembersTab from '@/components/org-admin/MembersTab'
import OrdersTab from '@/components/org-admin/OrdersTab'
import PostsTab from '@/components/org-admin/PostsTab'
import type {
  ApiEnvelope,
  OrgSummary,
  OrgStats,
  OrgOverviewData,
} from '@/lib/api-types'

type OrgAdminTab = 'overview' | 'members' | 'orders' | 'posts'

const DEFAULT_ACCENT = '#8FA888'

interface OrgAdminPageProps {
  params: Promise<{ slug: string }>
}

export default function OrgAdminPage({ params }: OrgAdminPageProps) {
  const { slug } = use(params)
  const router = useRouter()
  const { user, isLoading, isAuthenticated, logout } = useAuth()

  const [activeTab, setActiveTab] = useState<OrgAdminTab>('overview')
  const [org, setOrg] = useState<OrgSummary | null>(null)
  const [stats, setStats] = useState<OrgStats | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isLoading, isAuthenticated, router])

  useEffect(() => {
    let cancelled = false
    async function fetchOverview() {
      if (!isAuthenticated) return
      try {
        const res = await fetch(`/api/org/${encodeURIComponent(slug)}/admin`)
        const json = (await res.json()) as ApiEnvelope<OrgOverviewData>
        if (cancelled) return
        if (res.status === 403) {
          setForbidden(true)
          return
        }
        if (!res.ok || !json.success || !json.data) {
          setLoadError(json.error ?? 'Failed to load organization')
          return
        }
        setOrg(json.data.organization)
        setStats(json.data.stats)
      } catch (err) {
        console.error('OrgAdmin fetchOverview failed', err)
        if (!cancelled) setLoadError('Network error')
      }
    }
    fetchOverview()
    return () => {
      cancelled = true
    }
  }, [slug, isAuthenticated])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center">
        <p className="text-white/60">Loading...</p>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return null
  }

  // Client-side UX guard. Real enforcement lives in
  // /api/org/[slug]/admin/* via src/lib/org-admin-auth.ts.
  const isSuperAdmin = user.role === 'super_admin'
  const isOwningOrgAdmin =
    user.role === 'org_admin' && !!org && user.organizationId === org.id

  if (forbidden || (org && !isSuperAdmin && !isOwningOrgAdmin)) {
    return (
      <AccessDenied onHome={() => router.push('/dashboard')} />
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center">
        <div className="bg-[#FAF9F6]/80 border border-[#E5EAE3] rounded-3xl p-8 text-center max-w-md">
          <h1 className="text-2xl font-bold text-[#2D352C] mb-2">
            Unable to load
          </h1>
          <p className="text-[#2D352C]/60">{loadError}</p>
        </div>
      </div>
    )
  }

  if (!org || !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center">
        <p className="text-white/60">Loading organization…</p>
      </div>
    )
  }

  const accent = org.primary_color ?? DEFAULT_ACCENT

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-[#2D352C]"
      style={{ ['--org-accent' as string]: accent }}
    >
      <header className="p-6 border-b border-[#E5EAE3]">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-white/50">
              Admin · {org.slug}
            </p>
            <h1 className="text-2xl font-bold text-white truncate">
              {org.name}
            </h1>
            <p className="text-sm text-white/60">
              Organization administration
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/org/${encodeURIComponent(org.slug)}`}
              className="px-4 py-2 rounded-xl text-sm bg-white/10 hover:bg-white/20 text-white"
            >
              View public page
            </Link>
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 bg-white/10 rounded-xl text-sm hover:bg-white/20 text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-6">
        <div
          role="tablist"
          aria-label="Org admin sections"
          className="flex gap-2 border-b border-[#E5EAE3]"
        >
          {(
            [
              ['overview', 'Overview'],
              ['members', 'Members'],
              ['orders', 'Orders'],
              ['posts', 'Posts'],
            ] as const
          ).map(([key, label]) => {
            const active = activeTab === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(key)}
                className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
                style={{
                  borderColor: active ? accent : 'transparent',
                  color: active ? accent : 'rgba(255,255,255,0.7)',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 pb-20">
        {activeTab === 'overview' && (
          <OverviewTab
            slug={slug}
            org={org}
            stats={stats}
            accentColor={accent}
            onOrgUpdated={(updated) => setOrg(updated)}
          />
        )}
        {activeTab === 'members' && (
          <MembersTab
            slug={slug}
            currentUserId={user.id}
            accentColor={accent}
          />
        )}
        {activeTab === 'orders' && (
          <OrdersTab slug={slug} accentColor={accent} />
        )}
        {activeTab === 'posts' && (
          <PostsTab slug={slug} accentColor={accent} />
        )}
      </div>
    </div>
  )
}

function AccessDenied({ onHome }: { onHome: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center">
      <div className="bg-[#FAF9F6]/80 border border-[#E5EAE3] rounded-3xl p-8 text-center max-w-md">
        <h1 className="text-2xl font-bold text-[#2D352C] mb-2">
          Access Denied
        </h1>
        <p className="text-[#2D352C]/60 mb-6">
          You do not have permission to access this organization&apos;s admin.
        </p>
        <button
          type="button"
          onClick={onHome}
          className="px-6 py-2 bg-emerald-600 rounded-xl text-sm font-medium text-white hover:bg-emerald-500"
        >
          Go Home
        </button>
      </div>
    </div>
  )
}
