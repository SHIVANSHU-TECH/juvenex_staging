'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import BottomNav from '@/components/BottomNav';
import { useAuth } from '@/lib/auth-context';
import { useOrganization } from '@/lib/organization-context';
import { isNativeApp } from '@/lib/native-iap';

export default function SettingsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, logout } = useAuth();
  const { organization } = useOrganization();

  // Delete-account flow (app-store requirement: account deletion must be
  // available in-app, not via "contact support"). Backed by the existing
  // right-to-erasure endpoint DELETE /api/auth/account.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Resolved after mount to avoid SSR/hydration mismatch (window-only check).
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);

  const handleDeleteAccount = async () => {
    if (deleting || deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/auth/account', { method: 'DELETE' });
      if (!res.ok && res.status !== 207) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setDeleteError(json?.error ?? 'Could not delete your account. Please try again.');
        return;
      }
      // Account is gone — clear the local session and land on the public page.
      try {
        window.localStorage.removeItem('auth_token');
      } catch {
        /* ignore */
      }
      logout();
      router.push('/');
    } catch {
      setDeleteError('Could not delete your account. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const brandColor = organization?.primary_color ?? '#8FA888';
  const brandName = organization?.name ?? 'Juvenex';

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] shadow-sm">
        <div className="px-4 py-4 flex items-center gap-3">
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 text-sm text-[#6B7F65] font-medium hover:text-[#4A5C44] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 rounded"
            aria-label="Back to profile"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <h1 className="text-lg font-bold text-[#2D352C]">Settings</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <section
          aria-labelledby="account-settings-heading"
          className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-6"
        >
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${brandColor}22`, color: brandColor }}
              aria-hidden="true"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h2 id="account-settings-heading" className="text-base font-semibold text-[#2D352C]">
                Account settings
              </h2>
              <p className="text-sm text-[#6B7567] mt-1">
                Password and email changes for {brandName} are handled by your
                provider support team. Account deletion is available below.
              </p>
              <p className="text-xs text-[#8B9B83] mt-3">
                Contact{' '}
                <Link
                  href="/messages"
                  className="font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded"
                  style={{ color: brandColor }}
                >
                  your care team
                </Link>{' '}
                to request a password reset or update your account email.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="prefs-heading"
          className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm divide-y divide-[#E5EAE3] overflow-hidden"
        >
          <h2 id="prefs-heading" className="sr-only">Preferences</h2>
          <Link
            href="/settings/payment-methods"
            className="flex items-center gap-4 p-4 hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${brandColor}22`, color: brandColor }}
              aria-hidden="true"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-[#2D352C]">Payment methods</p>
              <p className="text-xs text-[#6B7567]">Manage cards on file</p>
            </div>
            <span className="text-[#8B9B83]" aria-hidden="true">&rarr;</span>
          </Link>
          <Link
            href="/profile"
            className="flex items-center gap-4 p-4 hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${brandColor}22`, color: brandColor }}
              aria-hidden="true"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-[#2D352C]">Profile details</p>
              <p className="text-xs text-[#6B7567]">Photo, display name, weight goals</p>
            </div>
            <span className="text-[#8B9B83]" aria-hidden="true">&rarr;</span>
          </Link>
        </section>

        <section
          aria-labelledby="danger-heading"
          className="bg-white rounded-2xl border border-red-200 shadow-sm p-6"
        >
          <h2 id="danger-heading" className="text-base font-semibold text-red-700">
            Delete account
          </h2>
          <p className="text-sm text-[#6B7567] mt-1">
            Permanently deletes your {brandName} account: profile, health data,
            weight logs, photos, messages, and community posts. This cannot be
            undone.
          </p>
          {native && (
            // App Store guideline 5.1.1(v): deleting the account does NOT stop
            // an Apple auto-renewable subscription — only cancelling in App
            // Store settings does. Tell IAP subscribers, with the manage link.
            <p className="text-xs text-[#6B7567] mt-2">
              Note: deleting your account does not cancel an active App Store
              subscription. To stop billing, also cancel it in your{' '}
              <a
                href="https://apps.apple.com/account/subscriptions"
                className="font-semibold text-[var(--accent-strong)] underline"
              >
                Apple subscription settings
              </a>
              .
            </p>
          )}
          {!deleteOpen ? (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="mt-4 min-h-11 px-4 rounded-xl border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
            >
              Delete my account…
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <label htmlFor="delete-confirm" className="block text-sm text-[#2D352C]">
                Type <span className="font-mono font-bold">DELETE</span> to confirm:
              </label>
              <input
                id="delete-confirm"
                type="text"
                autoComplete="off"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full px-3 py-2 min-h-11 rounded-xl border border-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              />
              {deleteError && (
                <p role="alert" className="text-sm text-red-700">
                  {deleteError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                  className="min-h-11 px-4 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
                >
                  {deleting ? 'Deleting…' : 'Permanently delete'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteConfirmText('');
                    setDeleteError(null);
                  }}
                  className="min-h-11 px-4 rounded-xl border border-[#E5EAE3] text-sm font-semibold text-[#2D352C] hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
