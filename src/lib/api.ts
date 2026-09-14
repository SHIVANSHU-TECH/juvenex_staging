import { withBasePath } from '@/lib/base-path'

const API_BASE_URL = withBasePath(
  process.env.NEXT_PUBLIC_API_URL || '/api'
)

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// Domain interfaces
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'patient' | 'org_admin' | 'super_admin';
  organizationId?: string;
  // Slug of the user's organization (tenant). Used to enforce tenant isolation
  // and redirect a user to their own tenant when they land on another's.
  organizationSlug?: string | null;
  phone?: string;
  avatar_url?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: string;
  logo_url?: string;
  primary_color?: string;
  patientCount?: number;
  adminCount?: number;
  createdAt?: string;
  inviteCode?: string;
  // Phase 2 storefront branding overrides — see migration 021_org_branding.sql
  // and docs/PRESCRIBERX_BRANDING_AUDIT.md. These are independent of the
  // org-creation `primary_color` / `logo_url` so super_admins can iterate on
  // tenant branding without disturbing the original record.
  brand_name?: string | null;
  brand_primary_color?: string | null;
  brand_logo_url?: string | null;
  // Per-tenant PrescribeRx Client ID (migration 029). When set, every
  // PrescribeRx API call made on behalf of this org scopes to this Client
  // entity. `null` / missing means "use platform default".
  prescriberx_client_id?: string | null;
}

export interface OrgBrandingPayload {
  brand_name?: string | null;
  brand_primary_color?: string | null;
  brand_logo_url?: string | null;
}

/**
 * The server returns an `ApiEnvelope`-shaped JSON body for the branding PUT.
 * `fetchApi<T>` does NOT unwrap envelopes — it stuffs the whole parsed body
 * into `res.data`. So the generic on `updateBranding` must match the full
 * envelope, not just the inner payload.
 */
export interface OrgBrandingEnvelope {
  success: boolean;
  error?: string;
  data?: {
    organization: {
      id: string;
      name: string;
      slug: string;
      brand_name: string | null;
      brand_primary_color: string | null;
      brand_logo_url: string | null;
    };
  };
}

export interface OrganizationStats {
  totalOrganizations: number;
  organizations: Organization[];
  summary: Record<string, unknown>;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('auth_token')
    : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'An error occurred' };
    }

    return { data };
  } catch {
    return { error: 'Network error' };
  }
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export const authApi = {
  login: (email: string, password: string) =>
    fetchApi<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (data: { email: string; password: string; name: string; phone?: string; role?: string; inviteCode?: string; referralCode?: string; membershipTier?: string; selectedProtocols?: string[] }) =>
    fetchApi<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getProfile: () =>
    fetchApi<{ user: User }>('/auth/profile'),

  updateProfile: (data: { name?: string; phone?: string; fcmToken?: string }) =>
    fetchApi<{ user: User }>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ---------------------------------------------------------------------------
// Organization API
// ---------------------------------------------------------------------------

export const organizationApi = {
  getOrganizations: () =>
    fetchApi<{ organizations: Organization[] }>('/organizations'),

  getAll: () =>
    fetchApi<{ organizations: Organization[] }>('/organizations'),

  get: (id: string) =>
    fetchApi<{ organization: Organization }>(`/organizations/${id}`),

  create: (data: { name: string; type: string; address?: string; phone?: string; email?: string }) =>
    fetchApi<{ organization: Organization }>('/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<{ name: string; address: string; phone: string; email: string }>) =>
    fetchApi<{ organization: Organization }>(`/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getStats: () =>
    fetchApi<OrganizationStats>('/organizations/stats'),

  /**
   * Update per-tenant storefront branding (Phase 2). Auth: super_admin only.
   * Pass `null` for any field to clear it; omit a field to leave it unchanged.
   */
  updateBranding: (orgId: string, payload: OrgBrandingPayload) =>
    fetchApi<OrgBrandingEnvelope>(
      `/admin/organizations/${orgId}/branding`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),
};

/**
 * Standalone helper mirroring `organizationApi.updateBranding` for callers
 * that prefer a top-level import. Both routes hit
 * `PUT /api/admin/organizations/[id]/branding`.
 */
export function updateOrgBranding(orgId: string, payload: OrgBrandingPayload) {
  return organizationApi.updateBranding(orgId, payload);
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export function setAuthToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('auth_token', token);
  }
}

export function removeAuthToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token');
  }
}
