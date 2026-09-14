type ProductCategory = 'peptides' | 'supplements' | 'devices' | 'bundles'

interface CategoryStyle {
  gradient: [string, string]
  icon: string
  patternOpacity: string
}

const categoryStyles: Record<ProductCategory, CategoryStyle> = {
  peptides: {
    gradient: ['#0891b2', '#0e7490'],
    icon: [
      // Medical vial icon
      'M180 120 L220 120 L220 110 C220 105 225 100 230 100 L230 90 C230 85 225 80 220 80',
      'L180 80 C175 80 170 85 170 90 L170 100 C175 100 180 105 180 110 Z',
      'M175 120 L225 120 L225 260 C225 270 215 280 200 280 C185 280 175 270 175 260 Z',
      'M185 150 L215 150',
      'M185 180 L215 180',
      'M185 210 L215 210',
    ].join(' '),
    patternOpacity: '0.06',
  },
  supplements: {
    gradient: ['#059669', '#047857'],
    icon: [
      // Capsule icon
      'M170 160 C170 130 185 110 200 110 C215 110 230 130 230 160',
      'L230 160 L170 160 Z',
      'M170 160 L230 160',
      'L230 220 C230 250 215 270 200 270 C185 270 170 250 170 220 Z',
    ].join(' '),
    patternOpacity: '0.07',
  },
  devices: {
    gradient: ['#7c3aed', '#6d28d9'],
    icon: [
      // Monitor/device icon
      'M145 100 L255 100 C260 100 265 105 265 110 L265 220 C265 225 260 230 255 230',
      'L145 230 C140 230 135 225 135 220 L135 110 C135 105 140 100 145 100 Z',
      'M150 110 L250 110 L250 215 L150 215 Z',
      'M185 230 L215 230 L220 260 L180 260 Z',
      'M170 260 L230 260',
    ].join(' '),
    patternOpacity: '0.06',
  },
  bundles: {
    gradient: ['#d97706', '#b45309'],
    icon: [
      // Package/box icon
      'M140 140 L200 110 L260 140 L200 170 Z',
      'M140 140 L140 230 L200 260 L200 170 Z',
      'M260 140 L260 230 L200 260 L200 170 Z',
      'M170 125 L200 140 L230 125',
      'M200 170 L200 260',
    ].join(' '),
    patternOpacity: '0.08',
  },
}

function resolveCategory(category: string): ProductCategory {
  const lower = category.toLowerCase()
  if (lower.includes('peptide') || lower.includes('tirzepatide') || lower.includes('semaglutide') || lower === 'medication') {
    return 'peptides'
  }
  if (lower.includes('supplement') || lower.includes('vitamin') || lower.includes('pill')) {
    return 'supplements'
  }
  if (lower.includes('device') || lower.includes('cgm') || lower.includes('glucose') || lower.includes('monitor')) {
    return 'devices'
  }
  if (lower.includes('bundle') || lower.includes('kit') || lower.includes('package')) {
    return 'bundles'
  }
  return 'supplements'
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

function truncateText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim())
      current = word
    } else {
      current = current ? current + ' ' + word : word
    }
  }
  if (current) lines.push(current.trim())
  return lines.slice(0, 2)
}

export function generateProductSVG(name: string, category: string): string {
  const resolved = resolveCategory(category)
  const style = categoryStyles[resolved]
  const seed = hashString(name)
  const hueShift = (seed % 20) - 10

  const [color1, color2] = style.gradient
  const patternRotation = seed % 360

  const nameLines = truncateText(name, 22)
  const nameY = nameLines.length === 1 ? 330 : 315

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="bg-${seed}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color1}"/>
      <stop offset="100%" stop-color="${color2}"/>
    </linearGradient>
    <linearGradient id="shine-${seed}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="white" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <pattern id="dots-${seed}" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(${patternRotation})">
      <circle cx="10" cy="10" r="1.5" fill="white" opacity="${style.patternOpacity}"/>
    </pattern>
    <filter id="shadow-${seed}">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.2)"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="400" height="400" rx="16" fill="url(#bg-${seed})"/>
  <rect width="400" height="400" rx="16" fill="url(#dots-${seed})"/>
  <rect width="400" height="200" rx="16" fill="url(#shine-${seed})"/>

  <!-- Icon container -->
  <circle cx="200" cy="175" r="85" fill="white" opacity="0.12"/>
  <circle cx="200" cy="175" r="70" fill="white" opacity="0.08"/>

  <!-- Category icon -->
  <g filter="url(#shadow-${seed})">
    <path d="${style.icon}" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" transform="translate(0, -5)"/>
  </g>

  <!-- Category label -->
  <rect x="150" y="272" width="100" height="24" rx="12" fill="white" opacity="0.15"/>
  <text x="200" y="289" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="white" opacity="0.9" letter-spacing="1.5">${resolved.toUpperCase()}</text>

  <!-- Product name -->
  ${nameLines.map((line, i) => `<text x="200" y="${nameY + i * 28}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="white">${escapeXml(line)}</text>`).join('\n  ')}

  <!-- Bottom accent line -->
  <rect x="170" y="370" width="60" height="3" rx="1.5" fill="white" opacity="0.3"/>
</svg>`

  const encoded = Buffer.from(svg).toString('base64')
  return `data:image/svg+xml;base64,${encoded}`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
