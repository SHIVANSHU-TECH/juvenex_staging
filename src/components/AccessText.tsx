import { Fragment } from 'react'

/**
 * Renders copy while bolding every literal "ACCESS" token. We sell ACCESS to
 * provider-approved peptides — not the peptides themselves — so membership
 * verbiage emphasizes that word wherever it appears.
 *
 * Pure (no hooks), so it is safe in both server and client components.
 */
export default function AccessText({ children }: { children: string }) {
  const parts = children.split(/(ACCESS)/g)
  return (
    <>
      {parts.map((part, i) =>
        part === 'ACCESS' ? (
          <strong key={i} className="font-bold">
            {part}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}
