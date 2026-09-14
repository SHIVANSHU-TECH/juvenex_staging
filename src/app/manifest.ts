import type { MetadataRoute } from 'next'
import { BASE_PATH } from '@/lib/base-path'

// PWA / app-store wrapper manifest. Served at /manifest.webmanifest and
// linked automatically from every page. Wrappers (TWA / Median / Capacitor
// webview) and Android install prompts read name, icons and colors from here.
// White-label note: this is the platform (Juvenex) manifest — tenant-branded
// wrappers ship their own native icons, so no per-org branching here.
export default function manifest(): MetadataRoute.Manifest {
  const base = BASE_PATH || ''
  return {
    name: 'Juvenex — Your GLP-1 Journey Companion',
    short_name: 'Juvenex',
    description:
      'Track your weight, meals, GLP-1 protocols, and community progress with Juvenex.',
    id: `${base}/`,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAF9F6',
    theme_color: '#2D352C',
    icons: [
      {
        src: `${base}/icon-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${base}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${base}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
