'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { HERO_SEQUENCE } from './copy'

/**
 * The scroll-scrubbed hero — a direct port of the design's `#jx-hero`.
 *
 * Two full-bleed videos are stacked and their `currentTime` is driven by scroll
 * position rather than playback: the first plays across the opening stretch,
 * then the second cross-fades in and carries the rest. Five text phases fade
 * through on top. All of the constants below (durations, split point, easing,
 * band edges) are the design's own values from its `tick()`.
 *
 * Videos are fetched as blobs before being attached. Seeking a streamed <video>
 * is unreliable — the browser refuses `currentTime` jumps into unbuffered
 * ranges — and scrubbing is nothing but seeks, so the file has to be local
 * first. This is what the design did too.
 *
 * If the video files are absent the hero degrades to the still photograph with
 * the identical phase choreography, so the page is never broken by a missing
 * asset. Reduced-motion and no-JS visitors get a static final frame.
 *
 * One scroll listener, rAF-coalesced, writing straight to element styles —
 * React state is never touched during a scrub.
 */

/** Poster/fallback still, also the first paint before video decodes. */
const HERO_STILL = '/jx/generated/hero-poster-v2.png'

/** Fallback durations, used until metadata loads. Design's own numbers. */
const D1_FALLBACK = 15.04
const D2_FALLBACK = 12.06

/**
 * Hard stop for the second clip, in seconds — the design's `video2End`.
 *
 * DO NOT raise this to the clip's full duration. The last ~1.9s of the source
 * footage shows a vial with the WRONG BRAND on it, and this trim is the only
 * thing keeping it off the page. The scroll track maps its whole remaining
 * length onto 0 → VIDEO_B_END, so the tail is simply never reachable.
 *
 * If the source clip is ever re-cut, re-check where the bad frames start and
 * move this to just before them.
 */
const VIDEO_B_END = 10.2
/** Scrub smoothing — higher chases the scroll faster. */
const SMOOTHING = 0.14

/** Phase bands, verbatim from the design's `tick()`. */
const BANDS: [number, number, number][] = [
  [-9, 0.1, 0.04],
  [0.14, 0.3, 0.05],
  [0.34, 0.5, 0.05],
  [0.58, 0.72, 0.05],
  [0.78, 9, 0.05],
]

function band(p: number, a: number, b: number, f: number): number {
  return Math.max(0, Math.min(1, Math.min((p - a) / f, (b - p) / f)))
}

/** Per-video scrub state. */
interface Track {
  el: HTMLVideoElement | null
  cur: number
  seeking: boolean
}

export interface HeroProps {
  /**
   * Scrub clips, resolved server-side by `getHeroMedia()` so a missing file
   * never costs the visitor a 404. Null on both = still-photograph hero.
   */
  videoA?: string | null
  videoB?: string | null
}

export function Hero({ videoA = null, videoB = null }: HeroProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const videoARef = useRef<HTMLVideoElement>(null)
  const videoBRef = useRef<HTMLVideoElement>(null)
  const phaseRefs = useRef<(HTMLDivElement | null)[]>([])
  const hintRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // Tells the stylesheet the scrub is live; without it the phases stay at
    // opacity 0 and a no-JS visitor would see an empty hero.
    root.dataset.ready = 'true'

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const a: Track = { el: videoARef.current, cur: 0, seeking: false }
    const b: Track = { el: videoBRef.current, cur: 0, seeking: false }
    const objectUrls: string[] = []
    let dead = false

    for (const track of [a, b]) {
      track.el?.addEventListener('seeked', () => {
        track.seeking = false
      })
    }

    // Fetch to a blob so seeking is instant and reliable. A 404 simply leaves
    // the still photograph in place.
    // `host` is passed in rather than closed over: TypeScript does not carry
    // the `if (!root) return` narrowing into a hoisted function declaration.
    async function attach(track: Track, src: string, host: HTMLDivElement) {
      if (!track.el) return
      try {
        const response = await fetch(src)
        if (!response.ok) return
        const url = URL.createObjectURL(await response.blob())
        if (dead) {
          URL.revokeObjectURL(url)
          return
        }
        objectUrls.push(url)
        track.el.src = url
        track.el.load()
        track.cur = 0
        host.dataset.video = 'on'
      } catch {
        // Offline or blocked: keep the still.
      }
    }

    if (videoA) void attach(a, videoA, root)
    if (videoB) void attach(b, videoB, root)

    // iOS will not honour `currentTime` until the element has been played once
    // inside a user gesture. Prime both on the first touch.
    const prime = () => {
      for (const track of [a, b]) {
        const played = track.el?.play()
        if (played) played.then(() => track.el?.pause()).catch(() => {})
      }
    }
    window.addEventListener('touchstart', prime, { once: true, passive: true })

    function scrub(track: Track, target: number) {
      const el = track.el
      if (!el || !el.duration || Number.isNaN(el.duration)) return
      track.cur += (target - track.cur) * SMOOTHING
      if (!track.seeking && Math.abs(track.cur - el.currentTime) > 0.016) {
        track.seeking = true
        try {
          el.currentTime = track.cur
        } catch {
          track.seeking = false
        }
      }
    }

    function park(track: Track, at: number) {
      const el = track.el
      if (!el || !el.duration || Number.isNaN(el.duration)) return
      track.cur = at
      if (!track.seeking && Math.abs(el.currentTime - at) > 0.2) {
        track.seeking = true
        try {
          el.currentTime = at
        } catch {
          track.seeking = false
        }
      }
    }

    let frame = 0
    function tick() {
      if (dead) return
      frame = requestAnimationFrame(tick)
      const host = rootRef.current
      if (!host) return

      const viewport = window.innerHeight
      const total = Math.max(1, host.offsetHeight - viewport)
      const p = Math.min(1, Math.max(0, -host.getBoundingClientRect().top / total))

      const d1 = a.el?.duration && !Number.isNaN(a.el.duration) ? a.el.duration : D1_FALLBACK
      const d2raw = b.el?.duration && !Number.isNaN(b.el.duration) ? b.el.duration : D2_FALLBACK
      const d2 = Math.min(VIDEO_B_END, d2raw - 0.08)
      const split = d1 / (d1 + d2)

      if (reduced) {
        if (b.el) b.el.style.opacity = '1'
        park(b, d2)
      } else if (p < split) {
        scrub(a, (p / split) * (d1 - 0.08))
        park(b, 0.03)
        if (b.el) b.el.style.opacity = '0'
      } else {
        scrub(b, ((p - split) / (1 - split)) * d2)
        park(a, d1 - 0.08)
        if (b.el) {
          b.el.style.opacity = Math.min(
            1,
            Math.max(0, (p - (split - 0.012)) / 0.024)
          ).toFixed(3)
        }
      }

      // Still-image parallax for the no-video fallback: the same settle the
      // video would have given, so the phases never sit on a dead frame.
      const still = host.querySelector<HTMLElement>('[data-hero-still]')
      if (still && host.dataset.video !== 'on') {
        still.style.transform = `scale(${(1.16 - p * 0.16).toFixed(4)})`
      }

      for (let i = 0; i < BANDS.length; i += 1) {
        const el = phaseRefs.current[i]
        if (!el) continue
        const value = reduced ? (i === 4 ? 1 : 0) : band(p, ...BANDS[i])
        el.style.opacity = value.toFixed(3)
        el.style.transform = `translateY(${((1 - value) * 16).toFixed(1)}px)`
        el.style.pointerEvents = value > 0.5 ? 'auto' : 'none'
      }

      if (hintRef.current) {
        hintRef.current.style.opacity = Math.max(0, 1 - p * 14).toFixed(3)
      }
    }

    frame = requestAnimationFrame(tick)

    return () => {
      dead = true
      cancelAnimationFrame(frame)
      window.removeEventListener('touchstart', prime)
      for (const url of objectUrls) URL.revokeObjectURL(url)
    }
  }, [videoA, videoB])

  return (
    <div ref={rootRef} className="jxl-hero" data-screen-label="Hero — scroll scrub">
      <div className="jxl-hero__stage">
        {/* Still: the first paint, the poster behind the videos, and the
            complete fallback when the clips are absent. */}
        <div data-hero-still className="jxl-hero__still">
          <Image
            src={HERO_STILL}
            alt=""
            fill
            priority
            sizes="100vw"
            style={{ objectFit: 'cover' }}
          />
        </div>

        <video
          ref={videoARef}
          className="jxl-hero__video"
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
        />
        <video
          ref={videoBRef}
          className="jxl-hero__video jxl-hero__video--b"
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* Phase 0 — the wordmark */}
        <div
          ref={(el) => {
            phaseRefs.current[0] = el
          }}
          className="jxl-hero__phase jxl-hero__phase--center"
        >
          <div>
            <p className="jx-eyebrow">GLP-1 · Peptides · Wellness</p>
            <h1 className="jx-display jxl-hero__wordmark">JUVENEX</h1>
            <p className="jxl-hero__lede">Personalized health. Elevated results.</p>
          </div>
        </div>

        {/* Phases 1–3 — the sequence story, alternating left / right / left */}
        {HERO_SEQUENCE.map((phase, index) => (
          <div
            key={phase.headline}
            ref={(el) => {
              phaseRefs.current[index + 1] = el
            }}
            className={`jxl-hero__phase ${index === 1 ? 'jxl-hero__phase--end' : 'jxl-hero__phase--start'}`}
          >
            <div className="jxl-hero__copy">
              <p className="jx-eyebrow">{phase.eyebrow}</p>
              <h2 className="jx-display jxl-hero__headline">{phase.headline}</h2>
              <p className="jxl-hero__body">{phase.body}</p>
            </div>
          </div>
        ))}

        {/* Phase 4 — the call to action */}
        <div
          ref={(el) => {
            phaseRefs.current[4] = el
          }}
          className="jxl-hero__phase jxl-hero__phase--start"
        >
          <div className="jxl-hero__copy jxl-hero__copy--wide">
            <p className="jx-eyebrow">Ready when you are</p>
            <h2 className="jx-display jxl-hero__headline jxl-hero__headline--lg">
              Precision, sealed.
            </h2>
            <p className="jxl-hero__body">
              Create your account or shop treatments — personalized care built around your goals.
            </p>
            <div className="jxl-hero__actions">
              <Link href="/register" className="jx-btn jx-btn-primary">
                Get started →
              </Link>
              <Link href="/store" className="jx-btn jx-btn-ghost">
                Shop treatments
              </Link>
              <Link href="/telehealth" className="jx-btn jx-btn-ghost">
                Start VIP consult
              </Link>
            </div>
            <p className="jxl-hero__note">
              Account required to order · Personalized plan · 100% confidential
            </p>
          </div>
        </div>

        <div ref={hintRef} className="jxl-hero__hint" aria-hidden="true">
          <span className="jxl-hero__hint-label">Scroll</span>
          <span className="jxl-hero__hint-arrow">↓</span>
        </div>
      </div>
    </div>
  )
}
