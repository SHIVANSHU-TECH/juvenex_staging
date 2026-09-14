'use client';

import Image from 'next/image';
import { useOrganization } from '@/lib/organization-context';
import { withBasePath } from '@/lib/base-path';

/**
 * White-label-aware brand mark. Falls back to Juvenex when there is no active
 * organization in context. Org branding is resolved by OrganizationProvider
 * (from the /org/[slug] path, a ?ref= code, or the sessionStorage cache that
 * carries across the login flow), so visiting a branded org page and then
 * signing in keeps the client's logo/name instead of reverting to Juvenex.
 */

const DEFAULT_LOGO = '/juvenex-logo.jpg';
const DEFAULT_NAME = 'Juvenex';

function resolveLogoSrc(url: string): string {
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url
  }
  return withBasePath(url)
}

export function useBrand() {
  const { organization } = useOrganization();
  return {
    logoUrl: organization?.logo_url || DEFAULT_LOGO,
    name: organization?.name || DEFAULT_NAME,
    isWhiteLabel: !!organization,
  };
}

export default function BrandLogo({
  size = 40,
  className = 'rounded-xl shadow-lg object-contain bg-white p-1',
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  const { logoUrl, name } = useBrand();
  return (
    <Image
      src={resolveLogoSrc(logoUrl)}
      alt={`${name} logo`}
      width={size}
      height={size}
      priority={priority}
      // Org logos are arbitrary external (Supabase) URLs of varying aspect
      // ratios; unoptimized avoids the optimizer cropping/caching surprises and
      // works regardless of which host the tenant logo lives on.
      unoptimized
      className={className}
    />
  );
}

/** Brand name + tagline block used in app headers. */
export function BrandTitle({
  tagline = 'Your GLP-1 Journey',
  nameClassName = 'text-lg font-bold text-[#2D352C]',
  taglineClassName = 'text-xs text-[var(--accent)]',
}: {
  tagline?: string;
  nameClassName?: string;
  taglineClassName?: string;
}) {
  const { name } = useBrand();
  return (
    <div>
      <h1 className={nameClassName}>{name}</h1>
      <p className={taglineClassName}>{tagline}</p>
    </div>
  );
}
