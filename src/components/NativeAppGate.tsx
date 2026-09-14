'use client'

// App-shell flow control. Inside the iOS/Android wrapper (which injects
// window.__JUVENEX_NATIVE__ before every page load) the product must behave
// like an APP, not a website: opening it lands on the dashboard when signed
// in, or the sign-in screen when not — never the marketing landing page.
// Also tells the native RevenueCat SDK which Supabase user is signed in so
// App Store purchases attribute to the right account.
//
// On the normal web this component does nothing at all.

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { identifyNative, isNativeApp } from '@/lib/native-iap'

const MARKETING_PATHS = new Set(['/', '/landing', '/landing-new', '/home'])

/**
 * Route prefixes the native wrapper must never render.
 *
 * `/store/**` is the web storefront: it sells physical prescription goods with
 * a card form posting to the partner processor. Surfacing an external purchase
 * flow inside the iOS app is exactly what App Review rejects, so the wrapper
 * bounces out of it the same way it bounces off marketing pages.
 */
const BLOCKED_PREFIXES = ['/store']

function isBlocked(pathname: string): boolean {
  if (MARKETING_PATHS.has(pathname)) return true
  return BLOCKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export default function NativeAppGate() {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()

  // Marketing pages → app entry (dashboard when a session exists, else login).
  useEffect(() => {
    if (!isNativeApp()) return
    if (!isBlocked(pathname ?? '')) return
    let hasToken = false
    try {
      hasToken = Boolean(window.localStorage.getItem('auth_token'))
    } catch {
      /* storage unavailable — treat as signed out */
    }
    router.replace(hasToken ? '/dashboard' : '/login')
  }, [pathname, router])

  // Keep RevenueCat's app user id in sync with the signed-in account.
  useEffect(() => {
    if (!isNativeApp() || !user?.id) return
    identifyNative(user.id)
  }, [user?.id])

  return null
}
