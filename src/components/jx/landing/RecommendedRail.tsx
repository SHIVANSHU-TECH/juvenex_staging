'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, Stars } from '../icons'
import { AddToCartButton } from './AddToCartButton'
import type { RecItem } from './recommended'

const CARD_WIDTH = 252
const STEP = CARD_WIDTH + 14 // card + .jx-scroller gap

const RECOMMENDED_ART: Record<string, string> = {
  Tirzepatide: '/jx/generated/recommended-tirzepatide.png',
  Semaglutide: '/jx/generated/recommended-semaglutide.png',
  'NAD+': '/jx/generated/recommended-nad.png',
  Glutathione: '/jx/generated/recommended-glutathione.png',
  'CJC-1295': '/jx/generated/recommended-cjc-1295.png',
  Ipamorelin: '/jx/generated/recommended-ipamorelin.png',
}

/**
 * "Recommended For You" — the design's six-card rail (design lines 187–257).
 *
 * The design's arrows were decorative anchors. Here they are real buttons that
 * page the rail, disable at each end, and sit beside a scroller that is itself
 * focusable (`tabindex=0` + a named region) so a keyboard user can arrow
 * through it — a scroll container that only a mouse can reach is a trap.
 *
 * Which cards can be bought is decided upstream in `resolveRecommended`.
 */
export function RecommendedRail({ items, error }: { items: RecItem[]; error: string | null }) {
  const railRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const sync = useCallback(() => {
    const el = railRef.current
    if (!el) return
    // 4px slack: sub-pixel layout means scrollLeft rarely hits the exact end.
    setAtStart(el.scrollLeft <= 4)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = railRef.current
    if (!el) return
    sync()
    let queued = 0
    const onScroll = () => {
      if (queued) return
      queued = requestAnimationFrame(() => {
        queued = 0
        sync()
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
      if (queued) cancelAnimationFrame(queued)
    }
  }, [sync])

  function page(direction: -1 | 1) {
    railRef.current?.scrollBy({ left: direction * STEP, behavior: 'smooth' })
  }

  return (
    <section className="jxl-sec" id="shop" aria-labelledby="jxl-rec-h">
      <div className="jxl-head">
        <h2 id="jxl-rec-h" className="jx-display jxl-h2">
          Recommended For You
        </h2>
        <div className="jxl-railbtns">
          <button
            type="button"
            className="jxl-railbtn"
            onClick={() => page(-1)}
            disabled={atStart}
          >
            <ArrowLeftIcon size={16} />
            <span className="jx-sr">Scroll recommendations left</span>
          </button>
          <button type="button" className="jxl-railbtn" onClick={() => page(1)} disabled={atEnd}>
            <ArrowRightIcon size={16} />
            <span className="jx-sr">Scroll recommendations right</span>
          </button>
        </div>
      </div>

      {error ? (
        <p className="jxl-note" style={{ margin: '0 0 14px' }}>
          Live pricing is temporarily unavailable — prices shown are indicative.{' '}
          <Link href="/store" style={{ color: 'var(--jx-brand)', fontWeight: 600 }}>
            Try the full store →
          </Link>
        </p>
      ) : null}

      <div
        ref={railRef}
        className="jx-scroller jxl-rail"
        tabIndex={0}
        role="region"
        aria-label="Recommended products, scrollable"
      >
        {items.map((item) => (
          <article key={item.key} className="jxl-rec">
            <div className="jxl-rec-art">
              <Image
                src={RECOMMENDED_ART[item.name]}
                alt={`${item.name} vial`}
                fill
                sizes="252px"
                style={{ objectFit: 'cover' }}
              />
            </div>
            <div className="jxl-rec-body">
              <h3 className="jx-display jxl-rec-title">{item.name}</h3>
              <p className="jxl-rec-strength">{item.strength}</p>
              <p className="jxl-rec-rating">
                <Stars rating={item.rating} count={item.reviews} />
                <span aria-hidden="true">
                  {item.rating} ({item.reviews.toLocaleString('en-US')})
                </span>
              </p>
              <p className="jxl-rec-price">{item.priceLabel}</p>
              {item.line ? (
                <AddToCartButton line={item.line} block style={{ marginTop: 'auto' }} />
              ) : (
                /*
                 * No catalogue row behind this molecule, so there is nothing to
                 * put in the bag — the visitor goes to a provider instead.
                 */
                <Link
                  href="/telehealth"
                  className="jx-btn jx-btn-primary"
                  style={{ marginTop: 'auto', width: '100%', fontSize: 13, padding: 0 }}
                >
                  Check eligibility
                  {/* Four cards carry this same label; give each link a
                      distinct accessible name. */}
                  <span className="jx-sr"> for {item.name}</span>
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
