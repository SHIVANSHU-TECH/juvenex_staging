'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { Organization } from '@/lib/api';

/**
 * The DB column is `referral_code` (organizations table, migration 001). The
 * shared `Organization` type still carries a legacy `inviteCode?` field for a
 * concept that never materialized on the backend — that field is always
 * undefined in practice. We extend locally so this card can render the actual
 * server-returned `referral_code` without forcing a shared-type edit owned by
 * another agent.
 */
type OrgWithReferral = Organization & { referral_code?: string | null };

export interface OrgCardProps {
  org: OrgWithReferral;
  /** Optional order count from the orders system. */
  orderCount?: number;
  /**
   * Optional handler for the "Edit branding" affordance. When present, an
   * inline button renders alongside View/Manage; when absent, the button is
   * suppressed. This keeps OrgCard reusable on non-admin surfaces.
   */
  onEditBranding?: (org: Organization) => void;
  /**
   * Optional handler for the "Integration" affordance (PrescribeRx Client ID
   * mapping). Same suppression rule as `onEditBranding` — render only when a
   * handler is provided.
   */
  onEditIntegration?: (org: Organization) => void;
}

const TYPE_BADGE: Record<string, string> = {
  clinic: 'bg-blue-50 text-blue-700 border-blue-200',
  pharmacy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  wellness_center: 'bg-amber-50 text-amber-700 border-amber-200',
  enterprise: 'bg-violet-50 text-violet-700 border-violet-200',
};

function formatTypeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function PhoneIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
      className="w-3.5 h-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372a1.125 1.125 0 00-.852-1.091l-4.423-1.106a1.125 1.125 0 00-1.173.417l-.97 1.293a.75.75 0 01-.84.27 12.035 12.035 0 01-7.143-7.143.75.75 0 01.27-.84l1.293-.97a1.125 1.125 0 00.417-1.173L6.226 3.103a1.125 1.125 0 00-1.091-.853H3.75A2.25 2.25 0 001.5 4.5v2.25z"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
      className="w-3.5 h-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
      />
    </svg>
  );
}

export default function OrgCard({
  org,
  orderCount,
  onEditBranding,
  onEditIntegration,
}: OrgCardProps) {
  const typeBadgeClass = TYPE_BADGE[org.type] ?? 'bg-slate-50 text-slate-700 border-slate-200';
  // Prefer the Phase-2 brand color when present; fall back to the org's
  // primary_color and finally the Juvenex default. Same precedence will be
  // mirrored on user-facing surfaces in Phase 3.
  const primaryColor =
    org.brand_primary_color ?? org.primary_color ?? '#8FA888';
  const displayName = org.brand_name ?? org.name;

  return (
    <article className="group bg-white rounded-2xl border border-[#E5EAE3] shadow-sm hover:shadow-md hover:border-[var(--accent)]/40 transition-all duration-200 p-5 flex flex-col gap-4">
      {/* Top: logo + name + type badge */}
      <header className="flex items-start gap-3">
        {(org.brand_logo_url ?? org.logo_url) ? (
          <Image
            src={(org.brand_logo_url ?? org.logo_url) as string}
            alt={`${displayName} logo`}
            width={40}
            height={40}
            className="w-10 h-10 rounded-xl object-contain bg-white border border-[#E5EAE3] p-0.5 flex-shrink-0"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white flex-shrink-0"
            style={{ backgroundColor: primaryColor }}
            aria-hidden="true"
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[#2D352C] truncate">{displayName}</h3>
          <span
            className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${typeBadgeClass}`}
          >
            {formatTypeLabel(org.type)}
          </span>
        </div>
      </header>

      {/* Contact / referral code. The server returns `referral_code` from
          the organizations row; we prefer that over the legacy `inviteCode`
          field which is never populated in practice. */}
      <div className="space-y-1 text-xs text-[#2D352C]/70">
        {(org.referral_code ?? org.inviteCode) && (
          <p className="font-mono text-[11px] text-[var(--accent)]">
            Code: {org.referral_code ?? org.inviteCode}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 py-3 border-y border-[#E5EAE3]">
        <Stat label="Patients" value={org.patientCount ?? 0} />
        <Stat label="Admins" value={org.adminCount ?? 0} />
        <Stat label="Orders" value={orderCount ?? 0} />
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-5 h-5 rounded-md border border-[#E5EAE3] flex-shrink-0"
            style={{ backgroundColor: primaryColor }}
            title={`Primary: ${primaryColor}`}
            aria-label={`Primary color ${primaryColor}`}
          />
          <span className="text-[10px] font-mono text-[#2D352C]/40 truncate">
            {primaryColor}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          {onEditBranding && (
            <button
              type="button"
              onClick={() => onEditBranding(org)}
              className="px-2.5 py-1.5 rounded-lg text-[#2D352C]/70 hover:bg-[#FAF9F6] hover:text-[#2D352C] transition-colors flex items-center gap-1"
            >
              Edit branding
            </button>
          )}
          {onEditIntegration && (
            <button
              type="button"
              onClick={() => onEditIntegration(org)}
              className="px-2.5 py-1.5 rounded-lg text-[#2D352C]/70 hover:bg-[#FAF9F6] hover:text-[#2D352C] transition-colors flex items-center gap-1"
            >
              Integration
            </button>
          )}
          <Link
            href={`/admin/organizations/${org.id}/products`}
            className="px-2.5 py-1.5 rounded-lg text-[#2D352C]/70 hover:bg-[#FAF9F6] hover:text-[#2D352C] transition-colors flex items-center gap-1"
          >
            Products
          </Link>
          <Link
            href={`/org/${org.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-lg text-[#2D352C]/70 hover:bg-[#FAF9F6] hover:text-[#2D352C] transition-colors flex items-center gap-1"
          >
            <MailIcon />
            View
          </Link>
          <Link
            href={`/org/${org.slug}/admin`}
            className="px-2.5 py-1.5 rounded-lg font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent)] transition-colors flex items-center gap-1"
          >
            <PhoneIcon />
            Manage
          </Link>
        </div>
      </footer>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-[var(--accent)]">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-[#2D352C]/40">
        {label}
      </p>
    </div>
  );
}
