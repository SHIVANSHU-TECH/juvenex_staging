import type { ReactNode } from 'react'

interface SectionProps {
  title: string
  children: ReactNode
}

/**
 * Visual grouping for drawer content. Section heading is styled as a small
 * caps label and its body sits in a low-contrast surface card.
 *
 * The dialog itself is a labeled landmark, so its child sections start the
 * heading hierarchy at <h2> rather than <h3>. Using <h3> would skip a level
 * (the dialog's labeling element acts as the implicit h1 of the dialog
 * region) and break heading-based screen reader navigation.
 */
export default function Section({ title, children }: SectionProps) {
  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7568] mb-2">
        {title}
      </h2>
      <div className="bg-[#FAFAF7] border border-[#E5EAE3] rounded-xl p-4">
        {children}
      </div>
    </section>
  )
}
