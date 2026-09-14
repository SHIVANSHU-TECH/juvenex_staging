'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, setAuthToken, removeAuthToken } from '@/lib/api';

// Patch global fetch (browser-only, idempotent) so every client-initiated
// request to our own /api/* routes automatically carries the JWT stored in
// localStorage. Without this, pages that call fetch('/api/...') directly
// (instead of going through fetchApi) hit getAuthUser() with no Authorization
// header and get 401s. See src/lib/supabase/server.ts:getAuthUser.
if (typeof window !== 'undefined') {
  const w = window as Window & { __authFetchPatched?: boolean };
  if (!w.__authFetchPatched) {
    w.__authFetchPatched = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const isInternalApi =
          url.startsWith('/api/') ||
          url.startsWith(`${window.location.origin}/api/`);
        if (isInternalApi) {
          const token = localStorage.getItem('auth_token');
          if (token) {
            const merged = new Headers(init?.headers || {});
            if (input instanceof Request && !merged.has('authorization')) {
              const reqAuth = input.headers.get('authorization');
              if (reqAuth) merged.set('authorization', reqAuth);
            }
            if (!merged.has('authorization')) {
              merged.set('Authorization', `Bearer ${token}`);
            }
            return originalFetch(input, { ...(init || {}), headers: merged });
          }
        }
      } catch {
        // Fall through to the original fetch on any unexpected error.
      }
      return originalFetch(input, init);
    };
  }
}

interface User {
  id: string;
  email: string;
  name: string;
  role: 'patient' | 'org_admin' | 'super_admin';
  organizationId?: string;
  organizationSlug?: string | null;
  phone?: string;
  // Populated by /api/auth/login and /api/auth/profile — used so the
  // community header/composer avatars stay in sync with the profile picture.
  avatarUrl?: string | null;
}

interface Organization {
  id: string;
  name: string;
  type: string;
}

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (data: { email: string; password: string; name: string; phone?: string; role?: string; inviteCode?: string; referralCode?: string; membershipTier?: string; selectedProtocols?: string[] }) => Promise<{ error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    const result = await authApi.getProfile();
    if (result.data?.user) {
      setUser(result.data.user);
      if (result.data.user.organizationId) {
        // Could fetch organization details here
      }
    } else {
      removeAuthToken();
    }
    setIsLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    if (result.error) {
      return { error: result.error };
    }
    if (result.data) {
      setAuthToken(result.data.token);
      setUser(result.data.user);
      setOrganization((result.data as { token: string; user: User; organization?: Organization | null })?.organization || null);
      return {};
    }
    return { error: 'Login failed' };
  };

  const register = async (data: { email: string; password: string; name: string; phone?: string; role?: string; inviteCode?: string; referralCode?: string; membershipTier?: string; selectedProtocols?: string[] }) => {
    const result = await authApi.register(data);
    if (result.error) {
      return { error: result.error };
    }
    if (result.data) {
      setAuthToken(result.data.token);
      setUser(result.data.user);
      return {};
    }
    return { error: 'Registration failed' };
  };

  const logout = () => {
    removeAuthToken();
    setUser(null);
    setOrganization(null);
  };

  const refreshUser = async () => {
    const result = await authApi.getProfile();
    if (result.data?.user) {
      setUser(result.data.user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
