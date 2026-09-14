'use client';

import { useState, useEffect, useId } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import BrandLogo, { useBrand } from '@/components/BrandLogo';
import PasswordInput from '@/components/PasswordInput';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const brand = useBrand();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const emailId = useId();
  const passwordId = useId();
  const formErrorId = useId();

  // Honor `?next=` (set by checkout/consult redirects) so sign-in returns the
  // user to what they were doing instead of dropping them on the dashboard.
  // Only same-site relative paths are allowed — never absolute/protocol-relative
  // URLs (open-redirect guard). Read from window (not useSearchParams) so the
  // page needs no Suspense boundary.
  const postLoginDestination = () => {
    try {
      const next = new URLSearchParams(window.location.search).get('next') ?? '';
      if (next.startsWith('/') && !next.startsWith('//')) return next;
    } catch {
      /* fall through to dashboard */
    }
    return '/dashboard';
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push(postLoginDestination());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    const result = await login(email, password);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push(postLoginDestination());
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Enter your email first, then tap Forgot password.');
      return;
    }
    setResetLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string; message?: string };
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Could not send reset link.');
        return;
      }
      setNotice(json.message ?? 'If an account exists for that email, a reset link has been sent.');
    } catch {
      setError('Network error sending reset link.');
    } finally {
      setResetLoading(false);
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

      <main id="main-content" className="flex-1 px-4 py-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-[#2D352C] mb-2">Welcome Back</h1>
          <p className="text-[var(--text-muted)] mb-8">Sign in to continue your GLP-1 journey</p>

          {error && (
            <div
              id={formErrorId}
              role="alert"
              className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"
            >
              {error}
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm"
            >
              {notice}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <div>
              <label htmlFor={emailId} className="block text-sm font-medium text-[#2D352C] mb-1">
                Email
              </label>
              <input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#E5EAE3] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                placeholder="you@example.com"
                required
                aria-required="true"
                aria-invalid={!!error}
                aria-describedby={error ? formErrorId : undefined}
                autoComplete="email"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label htmlFor={passwordId} className="block text-sm font-medium text-[#2D352C]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                  className="rounded text-sm font-semibold text-[var(--accent-strong)] hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                >
                  {resetLoading ? 'Sending...' : 'Forgot password?'}
                </button>
              </div>
              <PasswordInput
                id={passwordId}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#E5EAE3] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                placeholder="••••••••"
                required
                aria-required="true"
                aria-invalid={!!error}
                aria-describedby={error ? formErrorId : undefined}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-11 py-4 rounded-xl bg-[var(--accent-strong)] text-white font-bold text-lg shadow-lg hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[var(--text-muted)]">
              Don&apos;t have an account?{' '}
              <Link
                href="/register"
                className="text-[var(--accent-strong)] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 rounded"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </main>

      <div className="px-4 py-4 text-center">
        <p className="text-xs text-[var(--text-muted)]">By signing in, you agree to our Terms of Service and Privacy Policy</p>
      </div>
    </div>
  );
}
