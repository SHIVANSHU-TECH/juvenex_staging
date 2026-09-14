/**
 * Icon set for the Juvenex storefront skin, transcribed from the
 * "Juvenex Site.dc.html" design.
 *
 * All icons are 24×24 stroke outlines that inherit `currentColor`, sized by the
 * caller. They are decorative by default (`aria-hidden`) — every place one is
 * used either sits beside a text label or the caller supplies its own label.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const TruckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7h13v10H3z" />
    <path d="M16 10h3l2 3v4h-5" />
    <circle cx="7" cy="17" r="1.6" />
    <circle cx="17.5" cy="17" r="1.6" />
  </Icon>
)

export const SearchIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4.2-4.2" />
  </Icon>
)

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.8-3.4 4.6-5 8-5s6.2 1.6 8 5" />
  </Icon>
)

export const HeartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20s-7-4.6-9.2-9C1.2 7.6 3 4.5 6.4 4.5c2 0 3.6 1.1 5.6 3.3 2-2.2 3.6-3.3 5.6-3.3 3.4 0 5.2 3.1 3.6 6.5C19 15.4 12 20 12 20z" />
  </Icon>
)

export const BagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16l-1.4 11a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8Z" />
    <path d="M8.5 7V6a3.5 3.5 0 0 1 7 0v1" />
  </Icon>
)

export const MenuIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const PhoneIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  </Icon>
)

export const RxIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M9 7h6M9 11h6M9 15h4" />
  </Icon>
)

export const BoxIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </Icon>
)

export const PeopleIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M2.5 20c1.4-3 3.8-4.5 6.5-4.5S14.1 17 15.5 20" />
    <circle cx="17" cy="9" r="2.6" />
    <path d="M15.5 14.6c2.8-.4 5 .8 6 3.4" />
  </Icon>
)

export const PharmacyIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <path d="M4 21V9l8-5 8 5v12" />
    <path d="M9 21v-6h6v6M4 21h16" />
  </Icon>
)

export const ShieldIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z" />
    <path d="M8.5 12l2.5 2.5 4.5-4.5" />
  </Icon>
)

export const FlaskIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <path d="M9 3h6M10 3v6.3L4.7 18a2 2 0 0 0 1.8 3h11a2 2 0 0 0 1.8-3L14 9.3V3" />
    <path d="M7.5 15h9" />
  </Icon>
)

export const TrendIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <path d="M4 19h16M6 16l4-5 3.5 3L18 8" />
    <path d="M14.5 8H18v3.5" />
  </Icon>
)

export const CheckCircleIcon = (p: IconProps) => (
  <Icon strokeWidth={1.6} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5 11 15l4.5-5" />
  </Icon>
)

export const CheckIcon = (p: IconProps) => (
  <Icon strokeWidth={2.2} {...p}>
    <path d="M5 12.5 9.5 17 19 7" />
  </Icon>
)

export const ArrowRightIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Icon>
)

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M20 12H5M11 6l-6 6 6 6" />
  </Icon>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Icon>
)

export const LockIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <rect x="4.5" y="10" width="15" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Icon>
)

export const SpinnerIcon = ({ size = 18, ...rest }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    aria-hidden="true"
    focusable="false"
    style={{ animation: 'jx-spin 0.9s linear infinite' }}
    {...rest}
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.25" />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  </svg>
)

/** Five-star rating glyph row. `label` is announced; the stars are decorative. */
export function Stars({ rating, count }: { rating: number; count?: number }) {
  const label = count
    ? `Rated ${rating} out of 5 from ${count.toLocaleString('en-US')} reviews`
    : `Rated ${rating} out of 5`
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        aria-hidden="true"
        style={{ color: 'var(--jx-gold)', fontSize: 12, letterSpacing: 2 }}
      >
        {'★'.repeat(Math.round(rating))}
        {'☆'.repeat(Math.max(0, 5 - Math.round(rating)))}
      </span>
      <span className="jx-sr">{label}</span>
    </span>
  )
}
