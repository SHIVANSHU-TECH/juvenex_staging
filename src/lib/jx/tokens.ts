/**
 * Design tokens for the Juvenex storefront skin ported from the
 * "Juvenex Site.dc.html" Claude Design project.
 *
 * The CSS custom properties live in src/styles/jx.css; these constants exist so
 * TS/JSX can reference the same values (inline styles, canvas, meta theme).
 * Keep the two in sync — jx.css is the source of truth for rendering.
 */
export const jx = {
  /** Page background — warm paper. */
  bg: '#F4F2ED',
  /** Slightly lifted surface used behind hero media and product thumbs. */
  bgSoft: '#FBFAF6',
  /** Cards and chrome. */
  surface: '#FFFFFF',
  /** Hairline borders between surfaces. */
  line: '#E7E4DB',
  /** Input / pill borders (one step darker than `line`). */
  lineStrong: '#DBD8CD',

  /** Primary body text. */
  ink: '#1C221B',
  /** Brand green — buttons, links, icon strokes. */
  brand: '#2D352C',
  /** Pressed / hover state for `brand` fills. */
  brandDark: '#1F261F',
  /** Deep green used for the top bar, footer and dark tiles. */
  deep: '#232B23',
  /** Gradient partner for `deep` on dark tiles. */
  deepSoft: '#2F3A2E',
  /** Text/icon colour on dark green surfaces. */
  onDeep: '#F2F1EA',

  /** Secondary text on light surfaces (4.84:1 on #F4F2ED). */
  muted: '#666C60',
  /** Body copy that needs more weight than `muted`. */
  body: '#4A5046',
  /** Placeholder / tertiary text (4.52:1 on #F4F2ED). */
  faint: '#6C7067',

  /** Star ratings and the "most popular" badge. */
  gold: '#C9A227',
} as const

/** Height of the fixed chrome (top bar 38 + header 72 + nav 48). */
export const JX_CHROME_H = 158
/** Chrome height on small screens, where the utility bar and nav collapse. */
export const JX_CHROME_H_SM = 110

export type JxToken = keyof typeof jx
