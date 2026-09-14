import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Instrument_Sans } from 'next/font/google'
import { JxStoreProvider } from '@/components/jx/JxStore'
import { JxChrome } from '@/components/jx/JxChrome'
import { JxFooter } from '@/components/jx/JxFooter'
import '@/styles/jx.css'

/**
 * Shell for the Juvenex storefront skin (`/`, `/store/**`).
 *
 * Everything is scoped to the `.jx` wrapper so the existing app shell
 * (dashboard, community, admin) keeps its own palette and typography from
 * globals.css. Fonts are self-hosted — `font-src 'self'` in the CSP (see
 * src/proxy.ts) would block a third-party font host.
 */

const instrument = Instrument_Sans({
  variable: '--font-instrument',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
})

// GC Commune is the brand display face pulled from the design project. It has
// a single 400 weight — `adjustFontFallback` is off because the serif metric
// override Next picks distorts the very wide letter-spacing of the wordmark.
const commune = localFont({
  src: '../../../public/jx/fonts/GC-Commune.woff',
  variable: '--font-commune',
  display: 'swap',
  weight: '400',
  style: 'normal',
  adjustFontFallback: false,
  fallback: ['ui-serif', 'Georgia', 'serif'],
})

export const metadata: Metadata = {
  title: {
    default: 'Juvenex — Personalized health. Elevated results.',
    template: '%s | Juvenex',
  },
  description:
    'Physician-guided compounded GLP-1 protocols, licensed 503A & 503B pharmacies, and the tracking app that keeps you on plan.',
}

export default function JxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`jx ${instrument.variable} ${commune.variable}`}>
      <JxStoreProvider>
        <JxChrome />
        <main id="main-content">{children}</main>
        <JxFooter />
      </JxStoreProvider>
    </div>
  )
}
