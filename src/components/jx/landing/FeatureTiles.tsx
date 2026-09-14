'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { BoxIcon, CheckCircleIcon } from '../icons'
import { useReveal } from '../useReveal'

/**
 * Four feature tiles with the design's tilt-on-hover (design lines 317–350).
 *
 * The tilt is bound imperatively rather than through React handlers so the
 * pointer stream never re-renders anything, and only when the device has a
 * fine pointer and the user has not asked for reduced motion — a 5° rotate
 * under a thumb is noise, and under vestibular sensitivity it is harm.
 */
export function FeatureTiles() {
  const revealRef = useReveal<HTMLDivElement>()
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    if (!window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches) {
      return
    }

    const tiles = Array.from(grid.querySelectorAll<HTMLElement>('[data-tilt]'))
    const cleanups = tiles.map((tile) => {
      const onMove = (event: MouseEvent) => {
        const r = tile.getBoundingClientRect()
        const x = (event.clientX - r.left) / r.width - 0.5
        const y = (event.clientY - r.top) / r.height - 0.5
        tile.style.transition = ''
        tile.style.transform = `perspective(900px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) translateY(-3px)`
      }
      const onLeave = () => {
        tile.style.transition = 'transform .5s cubic-bezier(.2,.6,.2,1)'
        tile.style.transform = ''
      }
      tile.addEventListener('mousemove', onMove)
      tile.addEventListener('mouseleave', onLeave)
      return () => {
        tile.removeEventListener('mousemove', onMove)
        tile.removeEventListener('mouseleave', onLeave)
        tile.style.transform = ''
        tile.style.transition = ''
      }
    })
    return () => cleanups.forEach((fn) => fn())
  }, [])

  return (
    <section className="jxl-sec" aria-label="What Juvenex includes">
      <div ref={revealRef}>
        <div ref={gridRef} className="jxl-grid jxl-grid--tile">
          <div className="jxl-tile jxl-tile--dark" data-tilt data-reveal="0">
            <CheckCircleIcon size={26} strokeWidth={1.6} style={{ color: '#D8DECF' }} />
            <div className="jxl-tile-body">
              <h3 className="jx-display jxl-tile-title">Membership Plans</h3>
              <p>
                Unlock exclusive pricing, perks, and personalized support — from $95/month.
              </p>
              <Link href="#membership" className="jxl-tile-link">
                See plans →
              </Link>
            </div>
          </div>

          <div className="jxl-tile" data-tilt data-reveal="70">
            {/* The design's assets/jx-scan.png was lost with the source
                project; KIb5b.jpg is the same idea — live health metrics read
                off a wrist. */}
            <Image
              src="/jx/uploads/KIb5b.jpg"
              alt=""
              fill
              sizes="(min-width: 1280px) 310px, (min-width: 760px) 33vw, 100vw"
            />
            <div className="jxl-tile-scrim" />
            <div className="jxl-tile-body">
              <h3 className="jx-display jxl-tile-title">Your Health Score</h3>
              <p>Connect your data and start improving what matters most.</p>
              <Link href="#quiz" className="jxl-tile-link">
                Check your score →
              </Link>
            </div>
          </div>

          <div className="jxl-tile" data-tilt data-reveal="140">
            <Image
              src="/jx/uploads/m950C.jpg"
              alt=""
              fill
              sizes="(min-width: 1280px) 310px, (min-width: 760px) 33vw, 100vw"
              style={{ objectPosition: 'top' }}
            />
            <div className="jxl-tile-scrim" />
            <div className="jxl-tile-body">
              <h3 className="jx-display jxl-tile-title">Doctor Consults</h3>
              <p>Licensed providers. Personalized care. From anywhere.</p>
              <Link href="/telehealth" className="jxl-tile-link">
                Book now →
              </Link>
            </div>
          </div>

          <div className="jxl-tile jxl-tile--dark" data-tilt data-reveal="210">
            <BoxIcon size={26} strokeWidth={1.6} style={{ color: '#D8DECF' }} />
            <div className="jxl-tile-body">
              <h3 className="jx-display jxl-tile-title">Discreet Shipping</h3>
              <p>Fast, secure, and always discreet — cold-chain included on every order.</p>
              <Link href="#footer" className="jxl-tile-link">
                Learn more →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
