// One-off: generate 3 SVG covers for seeded blog posts.
// Hand-crafted for reliability (no AI rate-limit / cost), 1280x720 16:9.
// Run: node scripts/generate-blog-covers.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../public/blog')
mkdirSync(OUT_DIR, { recursive: true })

const COVERS = [
  {
    slug: 'glp-1-101-what-every-beginner-should-know',
    title: 'GLP-1 101',
    subtitle: 'A Beginner’s Guide',
    eyebrow: 'PROGRAM BASICS',
    gradient: ['#9AB896', '#B5D1B5'],
    accent: '#2D352C',
    icon: `<g transform="translate(900,260)">
      <circle cx="120" cy="120" r="160" fill="#FFFFFF" opacity="0.9"/>
      <g transform="rotate(-30 120 120)">
        <rect x="40" y="105" width="180" height="30" rx="6" fill="#2D352C"/>
        <rect x="220" y="100" width="40" height="40" rx="4" fill="#2D352C"/>
        <line x1="260" y1="120" x2="295" y2="120" stroke="#2D352C" stroke-width="6" stroke-linecap="round"/>
        <rect x="55" y="115" width="70" height="10" rx="2" fill="#9AB896" opacity="0.5"/>
      </g>
    </g>`,
  },
  {
    slug: 'sleep-and-semaglutide-optimizing-recovery',
    title: 'Sleep &amp; Semaglutide',
    subtitle: 'Optimizing Recovery',
    eyebrow: 'WELLNESS',
    gradient: ['#1F2D3D', '#2C3E50'],
    accent: '#F4E6C7',
    icon: `<g transform="translate(900,200)">
      <circle cx="160" cy="160" r="130" fill="#F4E6C7"/>
      <circle cx="200" cy="120" r="120" fill="#1F2D3D"/>
      <circle cx="60" cy="60" r="3" fill="#F4E6C7"/>
      <circle cx="100" cy="40" r="2" fill="#F4E6C7"/>
      <circle cx="40" cy="100" r="2" fill="#F4E6C7"/>
      <circle cx="320" cy="50" r="3" fill="#F4E6C7"/>
      <circle cx="350" cy="120" r="2" fill="#F4E6C7"/>
      <circle cx="280" cy="280" r="3" fill="#F4E6C7"/>
    </g>`,
  },
  {
    slug: 'stacking-peptides-safely-a-practical-guide',
    title: 'Stacking Peptides',
    subtitle: 'A Practical Guide',
    eyebrow: 'ADVANCED',
    gradient: ['#F5F8F3', '#EEF1ED'],
    accent: '#2D352C',
    icon: `<g transform="translate(820,180)">
      <!-- Three hexagons in a triangle, scientific feel -->
      <g fill="none" stroke="#8FA888" stroke-width="6">
        <polygon points="120,60 180,90 180,150 120,180 60,150 60,90"/>
        <polygon points="240,180 300,210 300,270 240,300 180,270 180,210" fill="#8FA888" fill-opacity="0.15"/>
        <polygon points="60,210 120,240 120,300 60,330 0,300 0,240"/>
      </g>
      <g fill="#2D352C">
        <circle cx="120" cy="120" r="6"/>
        <circle cx="240" cy="240" r="6"/>
        <circle cx="60" cy="270" r="6"/>
      </g>
      <g stroke="#2D352C" stroke-width="3" stroke-dasharray="6 4">
        <line x1="120" y1="120" x2="240" y2="240"/>
        <line x1="240" y1="240" x2="60" y2="270"/>
        <line x1="60" y1="270" x2="120" y2="120"/>
      </g>
    </g>`,
  },
]

function buildSvg({ title, subtitle, eyebrow, gradient, accent, icon }) {
  const [c1, c2] = gradient
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <g font-family="-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif" fill="${accent}">
    <text x="80" y="220" font-size="22" font-weight="600" letter-spacing="6" opacity="0.7">${eyebrow}</text>
    <text x="80" y="340" font-size="92" font-weight="800" letter-spacing="-2">${title}</text>
    <text x="80" y="410" font-size="36" font-weight="500" opacity="0.85">${subtitle}</text>
    <line x1="80" y1="470" x2="180" y2="470" stroke="${accent}" stroke-width="4"/>
    <text x="80" y="520" font-size="20" font-weight="600" letter-spacing="3" opacity="0.7">JUVENEX · GLP-1 JOURNAL</text>
  </g>
  ${icon}
</svg>`
}

for (const cover of COVERS) {
  const svg = buildSvg(cover)
  const path = resolve(OUT_DIR, `${cover.slug}-cover.svg`)
  writeFileSync(path, svg, 'utf8')
  console.log(`wrote ${path} (${svg.length} bytes)`)
}
console.log('Done. Update DB to point cover_image at /blog/<slug>-cover.svg')
