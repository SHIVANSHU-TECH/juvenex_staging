'use client'

/**
 * Add-to-bag with sign-in gate: guests save pending line + return path, then
 * go to login. After auth, consumePendingAdd completes the add and sends
 * them to /store/cart.
 */

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useJxStore, type BagLine } from '@/components/jx/JxStore'
import {
  clearPendingAdd,
  loginUrlForReturn,
  readPendingAdd,
  savePendingAdd,
} from '@/lib/jx/pending-add'

function currentReturnPath(): string {
  if (typeof window === 'undefined') return '/store'
  const path = `${window.location.pathname}${window.location.search}`
  if (!path.startsWith('/') || path.startsWith('//')) return '/store'
  // Strip basePath if present in pathname — Next router paths are app-relative.
  // window.location includes basePath (/staging); login ?next= should be app path.
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
  if (base && path.startsWith(base)) {
    const stripped = path.slice(base.length) || '/'
    return stripped.startsWith('/') ? stripped : `/${stripped}`
  }
  return path
}

export function useAuthGatedAdd() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { add, hydrated } = useJxStore()
  const router = useRouter()
  const consumed = useRef(false)

  const addOrSignIn = useCallback(
    (line: BagLine) => {
      if (authLoading || !hydrated) return

      if (!isAuthenticated) {
        const returnPath = currentReturnPath()
        savePendingAdd(line)
        router.push(loginUrlForReturn(returnPath))
        return
      }

      add(line)
      router.push('/store/cart')
    },
    [authLoading, hydrated, isAuthenticated, add, router]
  )

  /** After login lands back on shop/PDP, finish pending add → cart. */
  useEffect(() => {
    if (authLoading || !hydrated || !isAuthenticated || consumed.current) return
    const pending = readPendingAdd()
    if (!pending) return
    consumed.current = true
    clearPendingAdd()
    add(pending)
    router.replace('/store/cart')
  }, [authLoading, hydrated, isAuthenticated, add, router])

  return { addOrSignIn, isAuthenticated, authLoading, hydrated }
}
