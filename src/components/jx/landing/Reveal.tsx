'use client'

import type { ReactNode } from 'react'
import { useReveal } from '../useReveal'

/**
 * Client boundary for the fade-and-rise reveal so the sections themselves can
 * stay server components: `useReveal` needs an effect, but its children are
 * plain markup streamed from the server.
 */
export function Reveal({
  children,
  className,
  id,
}: {
  children: ReactNode
  className?: string
  id?: string
}) {
  const ref = useReveal<HTMLDivElement>()
  return (
    <div ref={ref} className={className} id={id}>
      {children}
    </div>
  )
}
