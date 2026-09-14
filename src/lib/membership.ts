'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import {
  tierForPlan,
  tierForPlanAndPeptides,
  type MarketplaceTier,
} from '@/lib/marketplace-access'

const FREE_ALLOWED_PREFIXES: ReadonlyArray<string> = [
  '/',
  '/landing',
  '/community',
  '/messages',
  '/profile',
  '/settings',
  '/legal',
  '/login',
  '/register',
  '/upgrade',
  '/blog',
  '/org',
  '/checkout',
  '/api',
  '/sitemap.xml',
  '/favicon.ico',
  '/manifest.json',
]

export function isFreeTierAllowed(pathname: string): boolean {
  if (!pathname) return true
  if (pathname === '/') return true
  return FREE_ALLOWED_PREFIXES.some(
    (prefix) =>
      prefix !== '/' &&
      (pathname === prefix || pathname.startsWith(`${prefix}/`))
  )
}

const PATH_LABELS: Readonly<Record<string, string>> = {
  '/store': 'the marketplace',
  '/telehealth': 'VIP telehealth',
  '/consult': 'VIP telehealth',
  '/intake': 'the health intake',
  '/food-log': 'the food log',
  '/meals': 'meal plans',
  '/learn': 'the learning hub',
  '/organization': 'organization features',
  '/provider': 'provider tools',
}

export function prettyPathLabel(pathname: string | null | undefined): string {
  if (!pathname) return 'this feature'
  for (const [prefix, label] of Object.entries(PATH_LABELS)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return label
    }
  }
  const segment = pathname.split('/').filter(Boolean)[0]
  return segment ? segment.replace(/-/g, ' ') : 'this feature'
}

interface SubscriptionResponse {
  success?: boolean
  subscription?: {
    plan?: string | null
    status?: string | null
    selected_protocols?: string[] | null
  } | null
  active?: boolean
  access?: { tier?: string | null; peptides?: string[] | null } | null
}

export interface MembershipState {
  loading: boolean
  active: boolean
  tier: MarketplaceTier
}

export function useMembershipGate(): MembershipState {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [state, setState] = useState<MembershipState>({
    loading: true,
    active: false,
    tier: tierForPlan(null),
  })

  useEffect(() => {
    let cancelled = false

    if (authLoading) return

    if (!isAuthenticated) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setState({ loading: false, active: false, tier: tierForPlan(null) })
        }
      })
      return
    }

    const token =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('auth_token')
        : null

    fetch('/api/payments/subscription', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(async (res) => {
        if (!res.ok) return null
        return (await res.json()) as SubscriptionResponse
      })
      .then((res) => {
        if (cancelled) return
        const active = Boolean(res?.active)
        const planSlug = res?.subscription?.plan ?? res?.access?.tier ?? null
        // Prefer the server-resolved accessible peptide slugs; fall back to the
        // stored selection on the subscription row. Either way the tier's
        // peptide set is resolved through the authoritative helper so the cap
        // and Unlimited expansion are applied consistently.
        const selected =
          res?.access?.peptides ?? res?.subscription?.selected_protocols ?? null
        const tier = active
          ? tierForPlanAndPeptides(planSlug, selected)
          : tierForPlan(null)
        setState({ loading: false, active, tier })
      })
      .catch(() => {
        if (cancelled) return
        setState({ loading: false, active: false, tier: tierForPlan(null) })
      })

    return () => {
      cancelled = true
    }
  }, [authLoading, isAuthenticated])

  return state
}
