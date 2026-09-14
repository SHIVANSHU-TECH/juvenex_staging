// Bridge to the native app shell (juvenex-mobile WebView wrapper).
//
// Inside the iOS/Android app, digital membership must be sold through Apple/
// Google in-app purchase (StoreKit), not the web Kurv checkout. The native
// shell injects `window.__JUVENEX_NATIVE__ = { iap: true, ... }` and exposes
// `window.juvenexPurchase(plan)` / `window.juvenexRestore()`, then posts the
// result back on a `juvenex-native` window MessageEvent. On the web (no shell)
// these helpers report "not native" and callers fall back to Kurv.

export interface NativeInfo {
  platform: string
  iap: boolean
  version: number
}

interface NativeWindow extends Window {
  __JUVENEX_NATIVE__?: NativeInfo
  juvenexPurchase?: (plan: string, userId?: string) => void
  juvenexRestore?: () => void
  ReactNativeWebView?: { postMessage: (msg: string) => void }
}

/** The native shell info if we're running inside the app with IAP, else null. */
export function nativeIap(): NativeInfo | null {
  if (typeof window === 'undefined') return null
  const w = window as NativeWindow
  return w.__JUVENEX_NATIVE__?.iap ? w.__JUVENEX_NATIVE__ : null
}

/** True when running inside the iOS/Android app shell (IAP or not). */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as NativeWindow).__JUVENEX_NATIVE__)
}

/** Tell the native shell which Supabase user is logged in (for RC attribution). */
export function identifyNative(userId: string): void {
  if (typeof window === 'undefined') return
  const w = window as NativeWindow
  w.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'identify', userId }))
}

interface PurchaseResult {
  ok: boolean
  plan?: string
  entitlements?: string[]
  error?: string
}

/**
 * Run a native StoreKit purchase for a plan slug and resolve with the result.
 * The server-side RevenueCat webhook activates the membership; the caller just
 * needs to know success/cancel/failure to update the UI. Times out defensively
 * so the UI never hangs if the shell never answers.
 */
export function purchaseNative(
  plan: string,
  userId?: string,
  timeoutMs = 180_000
): Promise<PurchaseResult> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve({ ok: false, error: 'not_native' })
      return
    }
    const w = window as NativeWindow
    if (!w.__JUVENEX_NATIVE__?.iap) {
      resolve({ ok: false, error: 'not_native' })
      return
    }

    let done = false
    const finish = (r: PurchaseResult) => {
      if (done) return
      done = true
      window.removeEventListener('juvenex-native', onEvent as EventListener)
      clearTimeout(timer)
      resolve(r)
    }

    const onEvent = (e: MessageEvent) => {
      let data: { type?: string; ok?: boolean; plan?: string; entitlements?: string[]; error?: string }
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (data?.type === 'purchase_result') {
        finish({ ok: !!data.ok, plan: data.plan, entitlements: data.entitlements, error: data.error })
      }
    }

    window.addEventListener('juvenex-native', onEvent as EventListener)
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs)

    // Pass userId ON the purchase so the native shell can await Purchases.logIn
    // before the StoreKit sheet opens — a separate identify can race and leave
    // the charge attributed to an anonymous RevenueCat id.
    if (typeof w.juvenexPurchase === 'function') {
      if (userId) identifyNative(userId)
      w.juvenexPurchase(plan, userId)
    } else {
      w.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'purchase', plan, userId }))
    }
  })
}

interface RestoreResult {
  ok: boolean
  entitlements?: string[]
  error?: string
}

/**
 * Restore previous App Store purchases (guideline 3.1.1 requirement). Resolves
 * with the active entitlements; the server webhook re-activates membership.
 */
export function restoreNative(timeoutMs = 60_000): Promise<RestoreResult> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve({ ok: false, error: 'not_native' })
      return
    }
    const w = window as NativeWindow
    if (!w.__JUVENEX_NATIVE__?.iap) {
      resolve({ ok: false, error: 'not_native' })
      return
    }
    let done = false
    const finish = (r: RestoreResult) => {
      if (done) return
      done = true
      window.removeEventListener('juvenex-native', onEvent as EventListener)
      clearTimeout(timer)
      resolve(r)
    }
    const onEvent = (e: MessageEvent) => {
      let data: { type?: string; ok?: boolean; entitlements?: string[]; error?: string }
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (data?.type === 'restore_result') {
        finish({ ok: !!data.ok, entitlements: data.entitlements, error: data.error })
      }
    }
    window.addEventListener('juvenex-native', onEvent as EventListener)
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs)
    if (typeof w.juvenexRestore === 'function') w.juvenexRestore()
    else w.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'restore' }))
  })
}
