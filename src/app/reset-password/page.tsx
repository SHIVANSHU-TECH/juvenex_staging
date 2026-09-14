'use client';

import { Suspense, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BrandLogo, { useBrand } from '@/components/BrandLogo';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordFallback() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const brand = useBrand();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const passwordId = useId();
  const confirmPasswordId = useId();
  const statusId = useId();

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    if (!supabase) {
      Promise.resolve().then(() => {
        if (!cancelled) setError('Password reset is not configured.');
      });
      return () => {
        cancelled = true;
      };
    }

    // PKCE flow: exchange the ?code= param for a session. If there's no code,
    // the recovery link used the implicit flow — the browser client's
    // detectSessionInUrl has already established the session from the URL hash,
    // so we just enable the form.
    const code = searchParams.get('code');
    if (!code) {
      Promise.resolve().then(() => {
        if (!cancelled) setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      if (cancelled) return;
      if (exchangeError) {
        setError('This reset link is invalid or expired. Please request a new one.');
        return;
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError('Password reset is not configured.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message || 'Unable to update password');
      setLoading(false);
      return;
    }
    await supabase.auth.signOut();
    setMessage('Password updated. Redirecting to sign in...');
    window.setTimeout(() => router.push('/login'), 900);
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

      <main id="main-content" className="flex-1 px-4 py-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-[#2D352C] mb-2">Create New Password</h1>
          <p className="text-[var(--text-muted)] mb-8">
            Use at least 8 characters for your new password.
          </p>

          {(error || message) && (
            <div
              id={statusId}
              role="status"
              className={`mb-4 p-3 rounded-xl border text-sm ${
                error
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              {error || message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor={passwordId} className="block text-sm font-medium text-[#2D352C] mb-1">
                New Password
              </label>
              <input
                id={passwordId}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#E5EAE3] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                placeholder="••••••••"
                required
                minLength={8}
                disabled={!ready || loading}
                aria-required="true"
                aria-describedby={error || message ? statusId : undefined}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor={confirmPasswordId} className="block text-sm font-medium text-[#2D352C] mb-1">
                Confirm New Password
              </label>
              <input
                id={confirmPasswordId}
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#E5EAE3] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                placeholder="••••••••"
                required
                minLength={8}
                disabled={!ready || loading}
                aria-required="true"
                aria-describedby={error || message ? statusId : undefined}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={!ready || loading}
              className="w-full min-h-11 py-4 rounded-xl bg-[var(--accent-strong)] text-white font-bold text-lg shadow-lg hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-[var(--accent-strong)] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 rounded"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
