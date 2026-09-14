'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type Organization } from '@/lib/api';
import type { ApiEnvelope } from '@/lib/api-types';
import OrgCard from './OrgCard';
import AddOrgModal from './AddOrgModal';
import EditBrandingModal from './EditBrandingModal';
import EditPrescribeRxIntegrationModal from './EditPrescribeRxIntegrationModal';
import EmptyState from './EmptyState';

/**
 * Shape returned by `GET /api/organizations` after the v2 list endpoint
 * started enriching each row with `adminCount` / `patientCount` and started
 * returning organizations under both `data.organizations` (envelope) and the
 * top-level `organizations` key (legacy fetchApi consumers).
 */
interface OrganizationsListData {
  organizations: Organization[];
  total: number;
}

type TypeFilter = 'all' | 'clinic' | 'pharmacy' | 'wellness_center' | 'enterprise';

const TYPE_FILTERS: ReadonlyArray<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'wellness_center', label: 'Wellness' },
  { value: 'enterprise', label: 'Enterprise' },
];

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      className="w-4 h-4"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
      className="w-4 h-4 text-[#2D352C]/40"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

interface ToastState {
  message: string;
  tone: 'success' | 'error';
}

export default function OrganizationsTab() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [brandingTarget, setBrandingTarget] = useState<Organization | null>(null);
  const [integrationOrg, setIntegrationOrg] = useState<Organization | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Centralised fetch so we can call it on mount AND after a successful
  // create — the new POST flow needs an authoritative refresh so the freshly
  // provisioned admin shows up in the adminCount stat without a page reload.
  const fetchOrganizations = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch('/api/organizations', {
        signal,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = (await res.json()) as ApiEnvelope<OrganizationsListData> & {
        organizations?: Organization[];
      };
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Failed to load organizations');
        setOrganizations([]);
        return;
      }
      const list = json.data?.organizations ?? json.organizations ?? [];
      setOrganizations(list);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Network error');
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchOrganizations(controller.signal);
    return () => controller.abort();
  }, [fetchOrganizations]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // The POST now returns an org + an admin payload. The local list is patched
  // optimistically with adminCount=1 so the new card renders correct stats
  // immediately, then we kick off a background refresh to grab the
  // authoritative count (in case the trigger created additional rows).
  const handleCreated = (org: Organization) => {
    setOrganizations((prev) => [...prev, { ...org, adminCount: 1, patientCount: 0 }]);
    setToast({ message: `Created ${org.name}`, tone: 'success' });
    void fetchOrganizations();
  };

  // Optimistically patch the targeted org in local state with the new
  // PrescribeRx Client ID so subsequent renders (and reopen of the modal)
  // see the saved value without a refetch.
  const handleIntegrationSaved = (newClientId: string | null) => {
    const target = integrationOrg;
    if (!target) return;
    setOrganizations((prev) =>
      prev.map((existing) =>
        existing.id === target.id
          ? { ...existing, prescriberx_client_id: newClientId }
          : existing
      )
    );
    setToast({
      message:
        newClientId === null
          ? `Cleared PrescribeRx mapping for ${target.brand_name ?? target.name}`
          : `Updated PrescribeRx mapping for ${target.brand_name ?? target.name}`,
      tone: 'success',
    });
  };

  // Replace the matching org in-place after a branding save so the card
  // re-renders with the new brand_name / colors / logo without a refetch.
  const handleBrandingSaved = (updated: Organization) => {
    setOrganizations((prev) =>
      prev.map((existing) => (existing.id === updated.id ? updated : existing))
    );
    setToast({
      message: `Updated branding for ${updated.brand_name ?? updated.name}`,
      tone: 'success',
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return organizations.filter((org) => {
      if (typeFilter !== 'all' && org.type !== typeFilter) return false;
      if (!q) return true;
      return (
        org.name.toLowerCase().includes(q) ||
        (org.slug ?? '').toLowerCase().includes(q)
      );
    });
  }, [organizations, query, typeFilter]);

  const totalPatients = organizations.reduce((s, o) => s + (o.patientCount ?? 0), 0);
  const totalAdmins = organizations.reduce((s, o) => s + (o.adminCount ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 pb-20">
      {/* Header row */}
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-white">Organizations</h2>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/10 text-white/80 border border-white/10">
            {organizations.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent)] shadow-sm transition-colors"
        >
          <PlusIcon />
          Add Organization
        </button>
      </header>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <span className="absolute inset-y-0 left-3 flex items-center">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or slug"
            className="w-full pl-9 pr-3 py-2 bg-white/90 border border-[#E5EAE3] rounded-xl text-sm text-[#2D352C] placeholder:text-[#2D352C]/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by type">
          {TYPE_FILTERS.map((f) => {
            const active = typeFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTypeFilter(f.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-white/80 text-[#2D352C] border-[#E5EAE3] hover:bg-white'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Total Orgs" value={organizations.length} />
        <KpiCard label="Total Patients" value={totalPatients} />
        <KpiCard label="Total Org Admins" value={totalAdmins} />
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-52 rounded-2xl bg-white/50 border border-[#E5EAE3] animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm" role="alert">
          {error}
        </div>
      ) : organizations.length === 0 ? (
        <EmptyState
          title="No organizations yet"
          description="Create your first whitelabel clinic to get started."
          action={{ label: 'Add Organization', onClick: () => setModalOpen(true) }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Try a different search term or filter."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((org) => (
            <OrgCard
              key={org.id}
              org={org}
              onEditBranding={(target) => setBrandingTarget(target)}
              onEditIntegration={(target) => setIntegrationOrg(target)}
            />
          ))}
        </div>
      )}

      <AddOrgModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(org) => handleCreated(org)}
      />

      <EditBrandingModal
        open={brandingTarget !== null}
        org={brandingTarget}
        onClose={() => setBrandingTarget(null)}
        onSaved={handleBrandingSaved}
      />

      {integrationOrg !== null && (
        <EditPrescribeRxIntegrationModal
          isOpen={true}
          org={integrationOrg}
          onClose={() => setIntegrationOrg(null)}
          onSaved={handleIntegrationSaved}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
            toast.tone === 'success' ? 'bg-[var(--accent)]' : 'bg-red-500'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-[#2D352C]/50">
        {label}
      </p>
      <p className="text-2xl font-bold text-[var(--accent)] mt-1">{value}</p>
    </div>
  );
}
