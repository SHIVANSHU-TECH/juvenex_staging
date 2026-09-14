'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useMembershipGate } from '@/lib/membership';

interface OrgData {
  id: string;
  name: string;
  slug: string;
  type: string;
  logo_url: string | null;
  primary_color: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  referral_code: string | null;
  created_at: string;
  stats: {
    patient_count: number;
  };
}

export default function OrganizationPortal() {
  const { user, isLoading, isAuthenticated } = useAuth();
  useMembershipGate();
  const router = useRouter();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'org_admin' && user.role !== 'super_admin') {
      router.push('/');
      return;
    }
  }, [isLoading, isAuthenticated, user, router]);

  useEffect(() => {
    if (!user?.organizationId) {
      setFetchLoading(false);
      return;
    }

    async function fetchOrg() {
      try {
        const res = await fetch(`/api/organizations/${user!.organizationId}`);
        const json = await res.json();
        if (json.success) {
          setOrg(json.data);
        } else {
          setError(json.error ?? 'Failed to load organization');
        }
      } catch {
        setError('Network error loading organization');
      } finally {
        setFetchLoading(false);
      }
    }

    fetchOrg();
  }, [user]);

  if (isLoading || (!isAuthenticated && !isLoading)) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="animate-pulse text-[#2D352C]/60">Loading...</div>
      </div>
    );
  }

  if (user && user.role !== 'org_admin' && user.role !== 'super_admin') {
    return null;
  }

  if (!user?.organizationId) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-3xl mb-4">
            🏢
          </div>
          <h1 className="text-2xl font-bold mb-2">No Organization Associated</h1>
          <p className="text-[#2D352C]/60 mb-6">
            Your account is not linked to any organization. Please contact support to get set up.
          </p>
          <Link href="/" className="text-emerald-600 font-medium hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FAF9F6]/80 backdrop-blur-xl border-b border-[#E5EAE3]">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-xl">
                🏢
              </div>
              <div>
                <h1 className="text-lg font-bold">{org?.name ?? 'Organization Portal'}</h1>
                <p className="text-xs text-[#2D352C]/50 capitalize">{org?.type?.replace('_', ' ') ?? ''}</p>
              </div>
            </div>
            <Link href="/" className="text-sm text-[#2D352C]/60 hover:text-[#2D352C]">
              Back to App
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {fetchLoading && (
          <div className="text-center py-12">
            <div className="animate-pulse text-[#2D352C]/60">Loading organization data...</div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {org && !fetchLoading && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-[#E5EAE3]">
                <p className="text-2xl font-bold text-emerald-600">{org.stats.patient_count}</p>
                <p className="text-sm text-[#2D352C]/60">Total Patients</p>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#E5EAE3]">
                <p className="text-2xl font-bold text-emerald-600">{org.name}</p>
                <p className="text-sm text-[#2D352C]/60">Organization Name</p>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#E5EAE3]">
                <p className="text-2xl font-bold text-emerald-600 font-mono">{org.referral_code ?? 'N/A'}</p>
                <p className="text-sm text-[#2D352C]/60">Referral Code</p>
              </div>
            </div>

            {/* Organization Details */}
            <div className="rounded-3xl bg-white border border-[#E5EAE3] p-6">
              <h2 className="text-lg font-bold mb-4">Organization Details</h2>
              <div className="space-y-3">
                {org.email && (
                  <div className="flex justify-between items-center py-2 border-b border-[#E5EAE3]">
                    <span className="text-sm text-[#2D352C]/60">Email</span>
                    <span className="text-sm font-medium">{org.email}</span>
                  </div>
                )}
                {org.phone && (
                  <div className="flex justify-between items-center py-2 border-b border-[#E5EAE3]">
                    <span className="text-sm text-[#2D352C]/60">Phone</span>
                    <span className="text-sm font-medium">{org.phone}</span>
                  </div>
                )}
                {org.website && (
                  <div className="flex justify-between items-center py-2 border-b border-[#E5EAE3]">
                    <span className="text-sm text-[#2D352C]/60">Website</span>
                    <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-emerald-600 hover:underline">
                      {org.website}
                    </a>
                  </div>
                )}
                {org.slug && (
                  <div className="flex justify-between items-center py-2 border-b border-[#E5EAE3]">
                    <span className="text-sm text-[#2D352C]/60">Slug</span>
                    <span className="text-sm font-medium font-mono">{org.slug}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-[#2D352C]/60">Member Since</span>
                  <span className="text-sm font-medium">
                    {new Date(org.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
