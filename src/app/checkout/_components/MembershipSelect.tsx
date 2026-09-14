'use client';

import {
  MARKETPLACE_GROUPS,
  MARKETPLACE_PEPTIDES,
  MARKETPLACE_TIERS,
} from '@/lib/marketplace-access';
import type { MembershipSelection } from './types';
import { SECTION_CARD_CLASS } from './ui';

// Purchasable tiers only (drop the free tier).
const PURCHASABLE_TIERS = MARKETPLACE_TIERS.filter((t) => t.priceCents > 0);
// Peptide display name lookup for the selection chips.
const PEPTIDE_NAME_BY_SLUG: Readonly<Record<string, string>> = Object.fromEntries(
  MARKETPLACE_PEPTIDES.map((p) => [p.slug, p.name])
);

interface MembershipSelectProps {
  value: MembershipSelection | null;
  onChange: (value: MembershipSelection) => void;
}

/**
 * Members-only store: a non-member must pick a membership to check out. This
 * surfaces the purchasable tiers and (for tiers with a finite cap) an
 * individual-peptide picker: choose up to N peptides from ANY protocol group.
 * Unlimited grants every peptide, so no picker is shown. The chosen tier's
 * first month is billed now alongside the products; the membership then
 * recurs monthly.
 */
export default function MembershipSelect({ value, onChange }: MembershipSelectProps) {
  const selectedTier = PURCHASABLE_TIERS.find((t) => t.slug === value?.plan) ?? null;
  // null cap = unlimited (every peptide included, no choice required).
  const maxPeptides = selectedTier ? selectedTier.maxSelectablePeptides : null;
  const selectedPeptides = value?.selectedProtocols ?? [];

  const pickTier = (slug: string) => {
    onChange({ plan: slug, selectedProtocols: [] });
  };

  const togglePeptide = (slug: string) => {
    if (!value || maxPeptides === null) return;
    const has = selectedPeptides.includes(slug);
    let next: string[];
    if (has) {
      next = selectedPeptides.filter((p) => p !== slug);
    } else {
      if (selectedPeptides.length >= maxPeptides) {
        // At the cap — replace the oldest pick so the latest tap always lands.
        next = [...selectedPeptides.slice(1), slug];
      } else {
        next = [...selectedPeptides, slug];
      }
    }
    onChange({ plan: value.plan, selectedProtocols: next });
  };

  return (
    <div className={SECTION_CARD_CLASS}>
      <h2 className="text-lg font-bold text-[#2D352C]">Choose your membership</h2>
      <p className="mt-1 text-sm text-[#6B7567]">
        Juvenex is members-only. Your membership unlocks the store and is billed
        monthly — the first month is charged now with your order.
      </p>

      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">Membership tier</legend>
        {PURCHASABLE_TIERS.map((tier) => {
          const active = value?.plan === tier.slug;
          return (
            <label
              key={tier.slug}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                active
                  ? 'border-[var(--accent-strong)] bg-[#F5F8F3]'
                  : 'border-[#E5EAE3] hover:border-[var(--accent)]'
              }`}
            >
              <input
                type="radio"
                name="membership-tier"
                value={tier.slug}
                checked={active}
                onChange={() => pickTier(tier.slug)}
                className="mt-1 h-4 w-4 accent-[var(--accent-strong)]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#2D352C]">{tier.label}</span>
                  <span className="shrink-0 font-bold text-[var(--accent-strong)]">
                    {tier.price}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-[#6B7567]">{tier.tagline}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {/* Individual peptide picker — only for tiers with a finite cap. */}
      {selectedTier && maxPeptides !== null && maxPeptides > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-[#2D352C]">
            Choose up to {maxPeptides} peptide{maxPeptides > 1 ? 's' : ''} from any
            group ({selectedPeptides.length}/{maxPeptides} chosen)
          </p>
          <div className="mt-3 space-y-4">
            {MARKETPLACE_GROUPS.map((group) => (
              <div key={group.slug}>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#8B9B83]">
                  {group.label}
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                  {group.peptides.map((slug) => {
                    const checked = selectedPeptides.includes(slug);
                    const atLimit = !checked && selectedPeptides.length >= maxPeptides;
                    return (
                      <label
                        key={slug}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm transition-colors ${
                          checked
                            ? 'border-[var(--accent-strong)] bg-[#F5F8F3]'
                            : 'border-[#E5EAE3] hover:border-[var(--accent)]'
                        } ${atLimit ? 'opacity-55' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={atLimit}
                          onChange={() => togglePeptide(slug)}
                          className="h-4 w-4 accent-[var(--accent-strong)]"
                        />
                        <span className="text-[#2D352C]">
                          {PEPTIDE_NAME_BY_SLUG[slug] ?? slug}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedTier && maxPeptides === null && (
        <p className="mt-4 rounded-lg bg-[#F5F8F3] px-3 py-2 text-sm text-[#2D352C]">
          Unlimited includes every peptide across all protocol groups — no
          selection needed.
        </p>
      )}
    </div>
  );
}
