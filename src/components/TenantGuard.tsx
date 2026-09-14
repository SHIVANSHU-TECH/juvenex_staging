'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useOrganization } from '@/lib/organization-context';

const ORG_CACHE_KEY = 'glp_org_branding';

// Tenant isolation guard.
//
// A user belongs to exactly one tenant (organization). The session JWT lives in
// origin-wide localStorage, so a valid token makes the user appear signed in on
// EVERY tenant's pages (cross-tenant session bleed). This guard enforces that an
// authenticated tenant member is only treated as signed in on THEIR OWN tenant:
// when the resolved tenant differs from the user's, we drop the stale tenant
// branding and send them to their own tenant's splash.
//
// - super_admins are exempt (they manage all tenants).
// - Platform users with no organization are not tenant-bound (skipped).
// - We use a full-page navigation so OrganizationProvider re-resolves the tenant
//   from the destination URL (it only resolves on mount).
export default function TenantGuard() {
  const { user, isLoading: authLoading } = useAuth();
  const { organization, isLoading: orgLoading } = useOrganization();
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (authLoading || orgLoading) return;
    if (!user) {
      redirectingRef.current = false;
      return;
    }
    if (user.role === 'super_admin') return; // manages all tenants
    if (!user.organizationId) return; // platform user — not tenant-bound
    if (!organization) return; // no tenant context resolved — neutral route

    if (organization.id === user.organizationId) {
      redirectingRef.current = false; // on their own tenant — all good
      return;
    }

    // Mismatch: this is NOT the user's tenant. Block the cross-tenant session
    // and send them to their own tenant. Guard against repeat firing.
    if (redirectingRef.current || typeof window === 'undefined') return;
    redirectingRef.current = true;
    try {
      sessionStorage.removeItem(ORG_CACHE_KEY); // drop stale tenant branding
    } catch {
      // sessionStorage unavailable — ignore
    }
    const target = user.organizationSlug ? `/org/${user.organizationSlug}` : '/dashboard';
    window.location.assign(target);
  }, [authLoading, orgLoading, user, organization]);

  return null;
}
