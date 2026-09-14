'use client'

import { useEffect, useRef } from 'react'

/**
 * Fade-and-rise reveal used across the storefront sections.
 *
 * Progressive enhancement: elements render visible in the HTML and are only
 * *armed* (hidden) once this hook runs, so a failed hydration or a crawler
 * still sees the content. Reduced-motion users skip the animation entirely —
 * the CSS neutralises `.jx-reveal-armed`, and we unobserve immediately.
 *
 * Usage: put `data-reveal` on any descendant (optionally `data-reveal="140"`
 * for a stagger delay in ms) and attach the returned ref to their container.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return

    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (!targets.length) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || typeof IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.classList.add('jx-reveal-in'))
      return
    }

    targets.forEach((el) => el.classList.add('jx-reveal-armed'))

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as HTMLElement
          const delay = Number(el.dataset.reveal) || 0
          el.style.transitionDelay = `${delay}ms`
          el.classList.add('jx-reveal-in')
          observer.unobserve(el)
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    )

    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return ref
}
