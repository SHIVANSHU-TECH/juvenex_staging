'use client'

/**
 * Client-side store for the Juvenex storefront: the bag, plus the toast the
 * design shows on add-to-cart.
 *
 * IMPORTANT — one product per order.
 * The upstream partner endpoint `Create_Order` accepts a single `product_id`
 * and has no quantity field (see docs/juvenex-api-integration.md). So the bag
 * deliberately holds at most ONE unit of each product, and checkout submits one
 * order per line, sequentially. Do not add a quantity control here without an
 * upstream endpoint that can carry it — a quantity the API silently ignores
 * would charge for one unit and ship one unit while the UI promised more.
 *
 * localStorage is the source of truth and is read through
 * `useSyncExternalStore`, so the server renders an empty bag, hydration is
 * mismatch-free, and every tab stays in sync without an effect that setStates
 * on mount.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'jx.bag.v1'
/** Guard against a corrupt or hostile localStorage payload. */
const MAX_LINES = 20

export interface BagLine {
  id: string
  title: string
  subtitle: string
  price: number
  /** Upstream product name, sent nowhere but useful for support/debugging. */
  rawName: string
}

/* ------------------------------------------------------------- the store -- */

const EMPTY: BagLine[] = []
const listeners = new Set<() => void>()

/**
 * Cached parse of the stored JSON.
 *
 * `getSnapshot` must return a referentially stable value while the underlying
 * data is unchanged, or React re-renders forever. Caching on the raw string
 * gives us that for free and makes cross-tab writes invalidate correctly.
 */
let cachedRaw: string | null = null
let cachedLines: BagLine[] = EMPTY

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Private mode / storage disabled.
    return null
  }
}

function parseLines(raw: string | null): BagLine[] {
  if (!raw) return EMPTY
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY
    const lines = parsed.filter(
      (x): x is BagLine =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as BagLine).id === 'string' &&
        typeof (x as BagLine).title === 'string' &&
        typeof (x as BagLine).price === 'number' &&
        Number.isFinite((x as BagLine).price)
    )
    return lines.length ? lines.slice(0, MAX_LINES) : EMPTY
  } catch {
    return EMPTY
  }
}

function getSnapshot(): BagLine[] {
  const raw = readRaw()
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedLines = parseLines(raw)
  }
  return cachedLines
}

/** The server has no bag; rendering empty keeps hydration mismatch-free. */
function getServerSnapshot(): BagLine[] {
  return EMPTY
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  // `storage` only fires in OTHER tabs, which is exactly the cross-tab case;
  // same-tab writes notify through `emit()`.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) emit()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

function emit() {
  for (const listener of listeners) listener()
}

function writeLines(next: BagLine[]) {
  const raw = JSON.stringify(next)
  try {
    localStorage.setItem(STORAGE_KEY, raw)
  } catch {
    // Quota/private mode: keep the in-memory snapshot so this tab still works.
  }
  cachedRaw = raw
  cachedLines = next
  emit()
}

/* ---------------------------------------------------------------- context -- */

interface JxStoreValue {
  lines: BagLine[]
  count: number
  subtotal: number
  has: (id: string) => boolean
  add: (line: BagLine) => void
  remove: (id: string) => void
  clear: () => void
  /** False during SSR and the hydration pass, so UI can avoid a flash. */
  hydrated: boolean
  toast: (message: string) => void
}

const JxStoreContext = createContext<JxStoreValue | null>(null)

const subscribeHydration = (onChange: () => void) => subscribe(onChange)

export function JxStoreProvider({ children }: { children: ReactNode }) {
  const lines = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false
  )

  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const toast = useCallback((text: string) => {
    setMessage(text)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 2600)
  }, [])

  const add = useCallback(
    (line: BagLine) => {
      const current = getSnapshot()
      if (current.some((l) => l.id === line.id)) {
        toast(`${line.title} is already in your bag`)
        return
      }
      if (current.length >= MAX_LINES) {
        toast('Your bag is full — check out or remove an item first')
        return
      }
      writeLines([...current, line])
      toast(`Added to bag — ${line.title}`)
    },
    [toast]
  )

  const remove = useCallback((id: string) => {
    writeLines(getSnapshot().filter((l) => l.id !== id))
  }, [])

  const clear = useCallback(() => writeLines(EMPTY), [])

  const value = useMemo<JxStoreValue>(
    () => ({
      lines,
      count: lines.length,
      subtotal: lines.reduce((sum, l) => sum + l.price, 0),
      has: (id: string) => lines.some((l) => l.id === id),
      add,
      remove,
      clear,
      hydrated,
      toast,
    }),
    [lines, add, remove, clear, hydrated, toast]
  )

  return (
    <JxStoreContext.Provider value={value}>
      {children}
      {/*
        Polite live region: announces bag changes to screen readers without
        interrupting, and renders the design's pill toast visually.
      */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'fixed',
          bottom: 'calc(24px + env(safe-area-inset-bottom))',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 310,
          pointerEvents: 'none',
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        {message ? (
          <span
            style={{
              display: 'inline-block',
              background: 'var(--jx-deep)',
              color: 'var(--jx-on-deep)',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '.04em',
              padding: '12px 22px',
              borderRadius: 999,
              boxShadow: 'var(--jx-shadow-lg)',
            }}
          >
            {message}
          </span>
        ) : null}
      </div>
    </JxStoreContext.Provider>
  )
}

export function useJxStore(): JxStoreValue {
  const ctx = useContext(JxStoreContext)
  if (!ctx) throw new Error('useJxStore must be used inside <JxStoreProvider>')
  return ctx
}
