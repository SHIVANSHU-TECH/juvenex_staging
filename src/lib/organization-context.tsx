'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
}

interface OrganizationContextType {
  organization: OrganizationData | null;
  isWhiteLabel: boolean;
  isLoading: boolean;
}

const STORAGE_KEY = 'glp_org_branding';
const DEFAULT_PRIMARY_COLOR = '#8FA888';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const OrganizationContext = createContext<OrganizationContextType | undefined>(
  undefined
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOrgIdentifierFromUrl(): { slug?: string; refCode?: string } {
  if (typeof window === 'undefined') return {};

  const { pathname, searchParams } = new URL(window.location.href);

  // /org/[slug] path
  const pathMatch = pathname.match(/^\/org\/([a-z0-9]+(?:-[a-z0-9]+)*)/);
  if (pathMatch) {
    return { slug: pathMatch[1] };
  }

  // ?ref=CODE query param
  const ref = searchParams.get('ref');
  if (ref) {
    return { refCode: ref };
  }

  return {};
}

function readSessionStorage(): OrganizationData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OrganizationData;
  } catch {
    return null;
  }
}

function writeSessionStorage(org: OrganizationData): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(org));
  } catch {
    // storage full or unavailable — ignore
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [organization, setOrganization] = useState<OrganizationData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      // 1. Check sessionStorage cache first
      const cached = readSessionStorage();
      if (cached) {
        setOrganization(cached);
        setIsLoading(false);
        // Still attempt a fresh fetch below to keep data current,
        // but the UI has something to show immediately.
      }

      const { slug, refCode } = getOrgIdentifierFromUrl();

      if (!slug && !refCode) {
        // No org identifier in URL — check if headers provided a slug
        // (set by the middleware on custom domain / subdomain)
        // In the client we cannot read request headers, but if the
        // middleware resolved an org, it would have also set a cookie or
        // the page would be under /org/[slug]. Without a slug or ref,
        // there is nothing to resolve.
        setIsLoading(false);
        return;
      }

      try {
        let url: string;
        if (slug) {
          url = `/api/organizations/slug/${encodeURIComponent(slug)}`;
        } else {
          url = `/api/organizations/referral/${encodeURIComponent(refCode!)}`;
        }

        const res = await fetch(url);
        if (!res.ok) {
          setIsLoading(false);
          return;
        }
        const json = await res.json();
        const org = json?.data as OrganizationData | undefined;
        if (org && !cancelled) {
          setOrganization(org);
          writeSessionStorage(org);
        }
      } catch {
        // Network error — fall through
      }

      if (!cancelled) setIsLoading(false);
    }

    resolve();

    return () => {
      cancelled = true;
    };
  }, []);

  // Apply CSS custom properties for theming. When a white-label org is active
  // we also override the app's interactive accent tokens (--accent,
  // --accent-strong, --accent-secondary) so buttons, links, focus rings and
  // spinners across the patient app adopt the tenant brand color — not just
  // the logo/name. These tokens are the ones the shared UI reads via
  // bg-[var(--accent-strong)] etc.; pages with hardcoded sage hex are
  // unaffected by design. When there is no org we leave the globals.css
  // defaults in place.
  useEffect(() => {
    const root = document.documentElement;
    const accentTokens = ['--accent', '--accent-strong', '--accent-secondary'];

    if (organization?.primary_color) {
      const color = organization.primary_color;
      root.style.setProperty('--org-primary-color', color);
      for (const token of accentTokens) root.style.setProperty(token, color);
    } else {
      root.style.setProperty('--org-primary-color', DEFAULT_PRIMARY_COLOR);
      for (const token of accentTokens) root.style.removeProperty(token);
    }
    root.style.setProperty(
      '--org-logo',
      organization?.logo_url ? `url(${organization.logo_url})` : 'none'
    );

    return () => {
      root.style.removeProperty('--org-primary-color');
      root.style.removeProperty('--org-logo');
      for (const token of accentTokens) root.style.removeProperty(token);
    };
  }, [organization]);

  const isWhiteLabel = organization !== null;

  return (
    <OrganizationContext.Provider
      value={{ organization, isWhiteLabel, isLoading }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOrganization(): OrganizationContextType {
  const ctx = useContext(OrganizationContext);
  if (ctx === undefined) {
    throw new Error(
      'useOrganization must be used within an OrganizationProvider'
    );
  }
  return ctx;
}
