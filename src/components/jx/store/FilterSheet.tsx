'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CloseIcon } from '../icons'
import s from './store.module.css'

/**
 * Presents the filter rail as a sidebar on desktop and a bottom sheet on
 * phones, from one copy of the markup.
 *
 * It is a disclosure, not a dialog: the panel contains links, so choosing an
 * option navigates and the sheet goes away with the page. Claiming
 * `role="dialog"` would promise a focus trap this does not implement — Escape,
 * the scrim, a real close button and focus return cover the actual need.
 *
 * The panel is only ever collapsed below 900px (the CSS pins it open above
 * that), which is why the toggle can be hidden there without stranding anyone.
 */
export function FilterSheet({
  activeCount,
  children,
}: {
  /** Shown on the toggle so the sheet's contents are not a mystery box. */
  activeCount: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  function close() {
    setOpen(false)
    toggleRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    // The sheet covers the viewport on phones; scroll it, not the grid behind.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Rotating to a tablet width turns the sheet back into a sidebar, which
    // would otherwise leave the scrim and the scroll lock hanging around.
    const wide = window.matchMedia('(min-width: 900px)')
    const onWide = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false)
    }
    wide.addEventListener('change', onWide)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      wide.removeEventListener('change', onWide)
    }
  }, [open])

  // Move focus into the sheet so the next Tab lands on a filter, not on the
  // page behind it.
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className={`jx-btn jx-btn-ghost ${s.toggle}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        Filters &amp; sort
        {activeCount > 0 ? <span className="jx-badge">{activeCount}</span> : null}
      </button>

      {open ? <div className={s.scrim} onClick={close} /> : null}

      <div id={panelId} ref={panelRef} tabIndex={-1} className={s.panel} data-open={open}>
        <div className={s.panelHead}>
          <h2 className={`jx-display ${s.panelTitle}`}>Filters</h2>
          <button type="button" className={s.closeBtn} onClick={close}>
            <CloseIcon size={20} />
            <span className="jx-sr">Close filters</span>
          </button>
        </div>
        {children}
      </div>
    </>
  )
}
