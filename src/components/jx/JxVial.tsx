/**
 * Generated product artwork.
 *
 * The upstream catalogue ships no images — `product_img` is empty on all 60
 * rows — and the design's five vial renders could not be recovered from the
 * source project. So product visuals are drawn as SVG instead: it is ~1 KB
 * rather than ~200 KB per render, scales to any card size, matches the brand
 * palette exactly, and covers every product rather than five hand-made ones.
 *
 * If the client later uploads artwork, `JxProduct.images` picks it up and
 * callers should prefer that over this component.
 */

interface JxVialProps {
  /** Fill colour for the solution — use `accentFor(product)`. */
  accent: string
  /** Short text printed on the label, e.g. "10 mg". Omitted when empty. */
  label?: string
  /** Rendered height in px. Width follows the 5:6 aspect ratio. */
  height?: number
  className?: string
}

export function JxVial({ accent, label, height = 180, className }: JxVialProps) {
  const width = Math.round((height * 5) / 6)
  // Unique-ish gradient ids so several vials on one page do not collide.
  const uid = `${accent.replace('#', '')}-${label?.replace(/\W/g, '') || 'x'}`

  return (
    <svg
      viewBox="0 0 100 120"
      width={width}
      height={height}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`jxGlass-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="28%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="70%" stopColor="#c9cec2" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8e968a" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={`jxFluid-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity="0.95" />
          <stop offset="45%" stopColor={accent} stopOpacity="0.72" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id={`jxCap-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e9ece4" />
          <stop offset="35%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#b9c0b2" />
        </linearGradient>
        <clipPath id={`jxBody-${uid}`}>
          <path d="M26 34h48v58a10 10 0 0 1-10 10H36a10 10 0 0 1-10-10z" />
        </clipPath>
      </defs>

      {/* soft ground shadow */}
      <ellipse cx="50" cy="107" rx="26" ry="4.5" fill="#1c221b" opacity="0.12" />

      {/* crimp cap */}
      <rect x="33" y="6" width="34" height="15" rx="3.5" fill={`url(#jxCap-${uid})`} />
      <rect x="33" y="6" width="34" height="15" rx="3.5" fill="none" stroke="#9aa093" strokeWidth="0.7" />
      <path d="M39 6v15M45 6v15M55 6v15M61 6v15" stroke="#9aa093" strokeWidth="0.6" opacity="0.55" />
      <rect x="41" y="9" width="18" height="9" rx="2" fill={accent} opacity="0.85" />

      {/* neck + shoulder */}
      <path d="M38 21h24v6l12 9H26l12-9z" fill={`url(#jxGlass-${uid})`} stroke="#9aa093" strokeWidth="0.7" strokeLinejoin="round" />

      {/* body */}
      <path
        d="M26 34h48v58a10 10 0 0 1-10 10H36a10 10 0 0 1-10-10z"
        fill={`url(#jxGlass-${uid})`}
        stroke="#9aa093"
        strokeWidth="0.8"
      />

      {/* solution, filling the lower two-thirds */}
      <g clipPath={`url(#jxBody-${uid})`}>
        <rect x="26" y="55" width="48" height="47" fill={`url(#jxFluid-${uid})`} />
        {/* meniscus */}
        <ellipse cx="50" cy="55" rx="24" ry="3.2" fill="#ffffff" opacity="0.28" />
      </g>

      {/* label */}
      <rect x="30" y="62" width="40" height="26" rx="3" fill="#faf8f3" opacity="0.96" />
      <rect x="30" y="62" width="40" height="26" rx="3" fill="none" stroke="#d9d5c9" strokeWidth="0.6" />
      <rect x="30" y="62" width="3" height="26" fill={accent} opacity="0.8" />
      {label ? (
        <text
          x="52"
          y="75.5"
          textAnchor="middle"
          fontSize="9"
          fontWeight="600"
          fill="#1c221b"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {label}
        </text>
      ) : null}
      <path d="M38 81h28" stroke="#b9bdb1" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M38 84.5h19" stroke="#ccd0c4" strokeWidth="1.2" strokeLinecap="round" />

      {/* specular highlight */}
      <rect x="32" y="40" width="4.5" height="52" rx="2.25" fill="#ffffff" opacity="0.5" />
    </svg>
  )
}
