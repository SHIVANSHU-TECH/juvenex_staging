'use client';

import { useState, useEffect, useId, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import BrandLogo, { useBrand } from '@/components/BrandLogo';
import {
  MARKETPLACE_TIERS,
  MARKETPLACE_GROUPS,
  MARKETPLACE_PEPTIDES,
  type MarketplaceTier,
} from '@/lib/marketplace-access';
import AccessText from '@/components/AccessText';
import PasswordInput from '@/components/PasswordInput';
import { isNativeApp } from '@/lib/native-iap';

const PEPTIDE_NAME_BY_SLUG: Readonly<Record<string, string>> = Object.fromEntries(
  MARKETPLACE_PEPTIDES.map((p) => [p.slug, p.name])
);

const PLAN_TIER_ALIASES: Readonly<Record<string, string>> = {
  metabolic_reset: 'metabolic_reset',
  base: 'metabolic_reset',
  starter: 'metabolic_reset',
  optimization: 'optimization',
  optimization_metabolic: 'optimization_metabolic',
  tier_2: 'optimization_metabolic',
  completely_optimized: 'completely_optimized',
  unlimited: 'completely_optimized',
};

function tierFromPlan(plan: string | null): string {
  if (!plan) return 'free';
  const normalizedPlan = plan.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  return PLAN_TIER_ALIASES[normalizedPlan] ?? 'free';
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--accent-strong)]" /></div>}>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const brand = useBrand();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPlan = searchParams.get('plan');
  const { register, isAuthenticated, isLoading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>(() => tierFromPlan(selectedPlan));
  // Chosen peptide slugs (any group), capped at the tier's maxSelectablePeptides.
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([]);
  // The membership popup should appear ONCE per browser session. We remember a
  // dismissal in sessionStorage so navigating back to /register (or re-renders)
  // doesn't re-pop it on every visit.
  const MEMBERSHIP_POPUP_DISMISS_KEY = 'juvenex:register-membership-popup-dismissed';
  const [showMembershipPopup, setShowMembershipPopup] = useState(false);
  // Inside the native app shell, Apple/Google require a paid package (no free
  // account) — a $0 tier can't be created; every package instead offers a 7-day
  // trial via StoreKit. On the web a free account is still allowed. Read
  // directly in render (same pattern as checkout/membership); on native we
  // collapse a 'free' selection to Basic via selectedTierEffective below.
  const native = isNativeApp();
  const trialEnabled =
    process.env.NEXT_PUBLIC_MEMBERSHIP_TRIAL_ENABLED === 'true';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed =
      window.sessionStorage.getItem(MEMBERSHIP_POPUP_DISMISS_KEY) === '1';
    if (!dismissed) setShowMembershipPopup(true);
  }, []);

  const dismissMembershipPopup = () => {
    setShowMembershipPopup(false);
    try {
      window.sessionStorage.setItem(MEMBERSHIP_POPUP_DISMISS_KEY, '1');
    } catch {
      // sessionStorage unavailable — popup simply won't be remembered.
    }
  };

  const firstNameId = useId();
  const tierGroupId = useId();
  const lastNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const passwordHintId = useId();
  const confirmPasswordId = useId();
  const termsId = useId();
  const formErrorId = useId();

  // Plan selection handling
  const planLabels: Record<string, string> = {
    metabolic_reset: 'Any 1 peptide - $95/mo',
    optimization: 'Any 2 peptides - $129/mo',
    optimization_metabolic: 'Any 3 peptides - $179/mo',
    completely_optimized: 'Unlimited peptides - $219/mo',
    base: 'Any 1 peptide - $95/mo',
    tier_2: 'Any 3 peptides - $179/mo',
    unlimited: 'Unlimited peptides - $219/mo',
  };

  // Referral code handling
  const referralCode = searchParams.get('ref') ?? '';
  const [referralOrg, setReferralOrg] = useState<{ name: string; logo_url?: string; primary_color?: string } | null>(null);

  useEffect(() => {
    if (!referralCode) return;
    let cancelled = false;
    fetch(`/api/organizations/referral/${encodeURIComponent(referralCode)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data) {
          setReferralOrg(json.data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [referralCode]);

  // Honor `?next=` (e.g. store PDP after Add to bag) — same open-redirect guard as login.
  const postAuthDestination = () => {
    try {
      const next = searchParams.get('next') ?? '';
      if (next.startsWith('/') && !next.startsWith('//')) return next;
    } catch {
      /* fall through */
    }
    return '/dashboard';
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push(postAuthDestination());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // The error banner sits at the top of a very long page (tier cards + peptide
  // picker above the form) — without scrolling to it, a validation failure at
  // the bottom "Create Account" button looks like a dead click.
  const showError = (message: string) => {
    setError(message);
    requestAnimationFrame(() => {
      document
        .getElementById(formErrorId)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      showError('Passwords do not match');
      return;
    }
    if (!agreedToTerms) {
      showError('Please agree to the Terms of Service');
      return;
    }

    setLoading(true);

    // On native, a leftover 'free' default becomes Basic (no $0 tier in-app).
    const tier =
      native && selectedTier === 'free' ? 'metabolic_reset' : selectedTier;

    const result = await register({
      email: formData.email,
      password: formData.password,
      name: `${formData.firstName} ${formData.lastName}`.trim(),
      membershipTier: tier,
      selectedProtocols,
      ...(referralCode ? { referralCode } : {}),
    });

    if (result.error) {
      showError(result.error);
      setLoading(false);
    } else if (tier && tier !== 'free') {
      // Paid tier chosen at signup creates a 'pending' subscription, which no
      // longer unlocks the store on its own — payment is required first. Route
      // to the dedicated membership checkout for the chosen tier (protocols are
      // confirmed there). When the 7-day trial is enabled we land them on the
      // trial path ($0 today, card required); otherwise a normal subscribe.
      // Free signups (web only) go straight to the dashboard. NATIVE never gets
      // the trial param — the IAP 7-day trial (ASC introductory offer) isn't
      // configured, so the native checkout must show a truthful subscribe flow.
      // If the user came from store Add-to-bag (`?next=`), resume that path after
      // membership checkout is not wired yet — still require membership pay first.
      const trialParam = trialEnabled && !native ? '&trial=1' : '';
      router.push(
        `/checkout/membership?plan=${encodeURIComponent(tier)}${trialParam}`
      );
    } else {
      router.push(postAuthDestination());
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  const inputDescribedBy = error ? formErrorId : undefined;
  const paidTiers = MARKETPLACE_TIERS.filter((tier) => tier.slug !== 'free');
  // On native the free tier isn't offered, so a lingering 'free' default (no
  // ?plan=) collapses to Basic. Web keeps 'free'.
  const selectedTierEffective =
    native && selectedTier === 'free' ? 'metabolic_reset' : selectedTier;
  const selectedTierConfig = MARKETPLACE_TIERS.find((tier) => tier.slug === selectedTierEffective) ?? MARKETPLACE_TIERS[0];
  const selectedTierLabel = selectedTierConfig.label;
  // null = unlimited (every peptide included); 0 = free (none).
  const peptideLimit = selectedTierConfig.maxSelectablePeptides;
  const selectedProtocolSet = new Set(selectedProtocols);
  const protocolHelper =
    selectedTierEffective === 'free'
      ? 'Create a free account and choose your peptides later.'
      : peptideLimit === null
        ? 'Unlimited includes every peptide across all protocol groups.'
        : `Choose up to ${peptideLimit} peptide${peptideLimit === 1 ? '' : 's'} from any group (${selectedProtocols.length}/${peptideLimit} chosen).`;

  const selectTier = (tierSlug: string) => {
    setSelectedTier(tierSlug);
    // Reset peptide picks when switching tiers — the cap changes and the
    // server re-clamps anyway (Unlimited resolves to all peptides on submit).
    setSelectedProtocols([]);
  };

  const togglePeptide = (slug: string) => {
    if (selectedTier === 'free' || peptideLimit === null) return;
    setSelectedProtocols((current) => {
      if (current.includes(slug)) return current.filter((s) => s !== slug);
      if (current.length >= peptideLimit) return current; // at cap — ignore
      return [...current, slug];
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col">
      <header className="px-4 py-6">
        <Link
          href="/"
          aria-label={`${brand.name} home`}
          className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 rounded-xl"
        >
          <BrandLogo size={40} />
          <span className="text-xl font-bold text-[#2D352C]">{brand.name}</span>
        </Link>
      </header>

      <main id="main-content" className="flex-1 px-4 py-4">
        <div className="max-w-md mx-auto">
          {referralOrg && (
            <div
              className="mb-4 p-4 rounded-xl border text-center"
              style={{
                backgroundColor: referralOrg.primary_color
                  ? `${referralOrg.primary_color}14`
                  : '#8FA88814',
                borderColor: referralOrg.primary_color ?? '#8FA888',
              }}
            >
              <p className="text-sm font-semibold text-[#2D352C]">
                Referred by{' '}
                <span style={{ color: referralOrg.primary_color ?? '#8FA888' }}>
                  {referralOrg.name}
                </span>
              </p>
            </div>
          )}
          {selectedPlan && planLabels[selectedPlan] && (
            <div className="mb-4 p-4 rounded-xl bg-[#EEF1ED] border border-[#E5EAE3] flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Selected plan</p>
                <p className="text-sm font-bold text-[#2D352C]">{planLabels[selectedPlan]}</p>
              </div>
              <Link
                href="/#membership"
                className="text-xs text-[var(--accent-strong)] font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 rounded min-h-11 inline-flex items-center px-2"
              >
                Change
              </Link>
            </div>
          )}
          <h1 className="text-2xl font-bold text-[#2D352C] mb-2">Create Account</h1>
          <p className="text-[var(--text-muted)] mb-6">Start your GLP-1 journey today</p>

          {error && (
            <div
              id={formErrorId}
              role="alert"
              className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"
            >
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowMembershipPopup(true)}
            className="mb-4 w-full rounded-xl border border-[#D8DED5] bg-white px-4 py-3 text-left shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
          >
            <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Selected membership
            </span>
            <span className="mt-1 flex items-center justify-between gap-3 text-sm font-bold text-[#2D352C]">
              {selectedTierLabel}
              <span className="text-xs text-[var(--accent-strong)]">Change</span>
            </span>
          </button>

          <fieldset className="mb-6" aria-labelledby={tierGroupId}>
            <legend id={tierGroupId} className="text-sm font-semibold text-[#2D352C] mb-2">
              Choose your package
            </legend>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              These match the membership tiers on the homepage.
              {!native
                ? ' You can also create a free app account and choose a package later.'
                : ' Choose a package to continue — billed monthly, cancel anytime.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {paidTiers.map((tier: MarketplaceTier) => {
                const isSelected = selectedTierEffective === tier.slug;
                const tierAccess = tier.maxSelectablePeptides === null
                  ? 'All peptides included'
                  : `Choose any ${tier.maxSelectablePeptides} peptide${tier.maxSelectablePeptides === 1 ? '' : 's'}`;
                return (
                  <button
                    key={tier.slug}
                    type="button"
                    onClick={() => selectTier(tier.slug)}
                    aria-pressed={isSelected}
                    className={`text-left p-4 rounded-xl border-2 transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 ${
                      isSelected
                        ? 'border-[var(--accent-strong)] bg-white ring-2 ring-[var(--accent-strong)]/20'
                        : 'border-[#E5EAE3] bg-white hover:border-[var(--accent)]'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold text-[#2D352C]">{tier.label}</span>
                      <span className="text-sm font-semibold text-[var(--accent-strong)]">
                        {tier.price}
                      </span>
                    </div>
                    {tier.slug === 'optimization' && (
                      <span className="inline-flex mt-2 rounded-full bg-[#EAF0E5] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-strong)]">
                        Most popular
                      </span>
                    )}
                    <p className="text-xs text-[var(--text-muted)] mt-1 leading-snug">
                      <AccessText>{tier.tagline}</AccessText>
                    </p>
                    <ul className="mt-3 space-y-1 text-[11px] text-[#5A6157]">
                      {tier.bullets.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-1.5 size-1.5 rounded-full bg-[var(--accent)]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-[#5A6157] mt-2 font-medium uppercase tracking-wide">
                      {tierAccess}
                    </p>
                    {isSelected && (
                      <span className="inline-block mt-2 text-[11px] font-bold uppercase tracking-wide text-[var(--accent-strong)]">
                        Selected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Free app account — WEB ONLY. Inside the native app shell
                Apple/Google require a paid package (no $0 tier); every package
                offers a 7-day trial via StoreKit instead. */}
            {!native && (
              <button
                type="button"
                onClick={() => selectTier('free')}
                aria-pressed={selectedTier === 'free'}
                className={`mt-3 w-full text-left p-4 rounded-xl border-2 transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 ${
                  selectedTier === 'free'
                    ? 'border-[var(--accent-strong)] bg-white ring-2 ring-[var(--accent-strong)]/20'
                    : 'border-[#E5EAE3] bg-white hover:border-[var(--accent)]'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold text-[#2D352C]">Free app account</span>
                  <span className="text-sm font-semibold text-[var(--accent-strong)]">{MARKETPLACE_TIERS[0].price}</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-snug">
                  <AccessText>{MARKETPLACE_TIERS[0].tagline}</AccessText>
                </p>
                {selectedTier === 'free' && (
                  <span className="inline-block mt-2 text-[11px] font-bold uppercase tracking-wide text-[var(--accent-strong)]">
                    Selected
                  </span>
                )}
              </button>
            )}
          </fieldset>

          <fieldset className="mb-6 rounded-xl border border-[#E5EAE3] bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-[#2D352C]">
              Choose your peptides
            </legend>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{protocolHelper}</p>
            <div className="mt-3 space-y-4">
              {MARKETPLACE_GROUPS.map((group) => (
                <div key={group.slug}>
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[#8B9B83]">
                    {group.label}
                  </p>
                  <div className="mt-2 grid gap-2">
                    {group.peptides.map((slug) => {
                      const checked =
                        peptideLimit === null || selectedProtocolSet.has(slug);
                      const disabled =
                        selectedTier === 'free' ||
                        peptideLimit === null ||
                        (!checked && selectedProtocols.length >= peptideLimit);
                      return (
                        <label
                          key={slug}
                          className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                            checked ? 'border-[var(--accent-strong)] bg-[#EEF1ED]' : 'border-[#E5EAE3]'
                          } ${disabled && !checked ? 'opacity-55' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => togglePeptide(slug)}
                            className="mt-0.5 size-4 accent-[var(--accent-strong)]"
                          />
                          <span className="font-semibold text-[#2D352C]">
                            {PEPTIDE_NAME_BY_SLUG[slug] ?? slug}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={firstNameId} className="block text-sm font-medium text-[#2D352C] mb-1">
                  First Name
                </label>
                <input
                  id={firstNameId}
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-[#E5EAE3] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                  placeholder="John"
                  required
                  aria-required="true"
                  aria-invalid={!!error}
                  aria-describedby={inputDescribedBy}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label htmlFor={lastNameId} className="block text-sm font-medium text-[#2D352C] mb-1">
                  Last Name
                </label>
                <input
                  id={lastNameId}
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-[#E5EAE3] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                  placeholder="Smith"
                  required
                  aria-required="true"
                  aria-invalid={!!error}
                  aria-describedby={inputDescribedBy}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div>
              <label htmlFor={emailId} className="block text-sm font-medium text-[#2D352C] mb-1">
                Email
              </label>
              <input
                id={emailId}
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#E5EAE3] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                placeholder="you@example.com"
                required
                aria-required="true"
                aria-invalid={!!error}
                aria-describedby={inputDescribedBy}
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor={passwordId} className="block text-sm font-medium text-[#2D352C] mb-1">
                Password
              </label>
              <PasswordInput
                id={passwordId}
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#E5EAE3] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                placeholder="••••••••"
                required
                aria-required="true"
                aria-invalid={!!error}
                aria-describedby={error ? `${passwordHintId} ${formErrorId}` : passwordHintId}
                minLength={8}
                autoComplete="new-password"
              />
              <p id={passwordHintId} className="text-xs text-[var(--text-muted)] mt-1">Must be at least 8 characters</p>
            </div>

            <div>
              <label htmlFor={confirmPasswordId} className="block text-sm font-medium text-[#2D352C] mb-1">
                Confirm Password
              </label>
              <PasswordInput
                id={confirmPasswordId}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#E5EAE3] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                placeholder="••••••••"
                required
                aria-required="true"
                aria-invalid={!!error}
                aria-describedby={inputDescribedBy}
                autoComplete="new-password"
              />
            </div>

            <label htmlFor={termsId} className="flex items-start gap-2 cursor-pointer">
              <input
                id={termsId}
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded accent-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                required
                aria-required="true"
              />
              <span className="text-sm text-[var(--text-muted)]">
                I have read and agree to the{' '}
                <a
                  href="/legal/terms"
                  rel="noopener noreferrer"
                  className="underline text-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 rounded"
                >
                  Membership Agreement
                </a>{' '}
                and{' '}
                <a
                  href="/legal/privacy"
                  rel="noopener noreferrer"
                  className="underline text-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 rounded"
                >
                  Privacy Policy
                </a>
                . I understand membership fees are for platform access only and
                do not purchase a consultation, peptide, prescription,
                medication, treatment, protocol, or medical service.
                <span className="block mt-2">
                  I understand Juvenex is not a healthcare provider and does
                  not practice medicine, diagnose, prescribe, or guarantee any
                  result. Any consultation, prescription, treatment, or product
                  is provided by independent third-party providers.
                </span>
                <span className="block mt-2">
                  I understand that de-identified health data may be processed
                  by third-party AI services to power meal planning and
                  insights.
                </span>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-11 py-4 rounded-xl bg-[var(--accent-strong)] text-white font-bold text-lg shadow-lg hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[var(--text-muted)]">
              Already have an account?{' '}
              <Link
                href={(() => {
                  const next = searchParams.get('next') ?? '';
                  if (next.startsWith('/') && !next.startsWith('//')) {
                    return `/login?next=${encodeURIComponent(next)}`;
                  }
                  return '/login';
                })()}
                className="text-[var(--accent-strong)] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 rounded"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </main>

      {showMembershipPopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="membership-popup-title"
          className="fixed inset-0 z-50 flex items-end bg-black/45 px-3 py-4 sm:items-center sm:justify-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) dismissMembershipPopup();
          }}
        >
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#FAF9F6] p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="membership-popup-title" className="text-xl font-bold text-[#2D352C]">
                  Choose your membership
                </h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {native
                    ? 'Pick a package to continue — billed monthly, cancel anytime.'
                    : 'Pick a tier now or continue with a free app account and upgrade later.'}
                </p>
              </div>
              <button
                type="button"
                onClick={dismissMembershipPopup}
                aria-label="Close membership options"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[#6B7567] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {paidTiers.map((tier) => {
                const isSelected = selectedTierEffective === tier.slug;
                return (
                  <button
                    key={tier.slug}
                    type="button"
                    onClick={() => {
                      setSelectedTier(tier.slug);
                      setSelectedProtocols([]);
                      dismissMembershipPopup();
                    }}
                    className={`rounded-xl border-2 bg-white p-4 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 ${
                      isSelected ? 'border-[var(--accent-strong)]' : 'border-[#E5EAE3] hover:border-[var(--accent)]'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold text-[#2D352C]">{tier.label}</span>
                      <span className="text-sm font-bold text-[var(--accent-strong)]">
                        {tier.price}
                      </span>
                    </div>
                    {tier.slug === 'optimization' && (
                      <span className="mt-2 inline-flex rounded-full bg-[#EAF0E5] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-strong)]">
                        Most popular
                      </span>
                    )}
                    <p className="mt-2 text-xs leading-snug text-[var(--text-muted)]">
                      <AccessText>{tier.tagline}</AccessText>
                    </p>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 rounded-xl border border-[#E5EAE3] bg-white px-4 py-3 text-xs leading-5 text-[#6B7567]">
              Membership fees are for platform access only. Juvenex does not
              sell consultations, peptides, prescriptions, medications,
              protocols, or medical services. By continuing, you agree to the{' '}
              <Link href="/legal/terms" className="font-semibold text-[var(--accent-strong)] underline">
                Membership Agreement
              </Link>{' '}
              and{' '}
              <Link href="/legal/privacy" className="font-semibold text-[var(--accent-strong)] underline">
                Privacy Policy
              </Link>
              .
            </p>

            <div className="sticky bottom-0 -mx-4 mt-4 border-t border-[#E5EAE3] bg-[#FAF9F6] px-4 pb-1 pt-3 sm:-mx-6 sm:px-6">
              <button
                type="button"
                onClick={dismissMembershipPopup}
                className="w-full rounded-xl bg-[var(--accent-strong)] px-4 py-3 text-center text-sm font-bold text-white shadow-sm hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
              >
                Continue to Create Account
              </button>
              {/* WEB ONLY — no free account inside the native app shell. */}
              {!native && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTier('free');
                    setSelectedProtocols([]);
                    dismissMembershipPopup();
                  }}
                  className="mt-2 w-full rounded-xl border border-[#D8DED5] bg-white px-4 py-3 text-center text-sm font-semibold text-[#2D352C] shadow-sm hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                >
                  Use free app account instead
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
