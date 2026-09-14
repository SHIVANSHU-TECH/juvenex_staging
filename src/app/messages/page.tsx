'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import BottomNav from '@/components/BottomNav';
import type { ConversationSummary } from '@/lib/messaging';
import type { ApiEnvelope } from '@/lib/api-types';
import { formatRelative } from '@/lib/format';

type InboxResponse = ApiEnvelope<{
  conversations: ConversationSummary[];
  total_unread: number;
}>;

function formatPreview(body: string, max = 80): string {
  const trimmed = body.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export default function MessagesPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped by the error-state "Try again" button to re-run the inbox load
  // effect, so a failed fetch never dead-ends on an un-retryable error.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/messages');
        const json = (await res.json()) as InboxResponse;
        if (cancelled) return;
        if (!res.ok || !json.success || !json.data) {
          setError(json.error ?? 'Failed to load inbox');
          setConversations([]);
          return;
        }
        setConversations(json.data.conversations);
      } catch (err) {
        if (!cancelled) {
          console.error('Messages inbox load failed', err);
          setError('Network error');
          setConversations([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, reloadKey]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
        <p className="text-[#2D352C]/60 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      <header className="px-5 py-5 border-b border-[#E5EAE3] bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Back to home"
            className="flex-shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF1ED] text-[#6B7567] hover:bg-[#E2E7E0] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">Messages</h1>
            <p className="text-sm text-[#2D352C]/60">Updates from your care team.</p>
          </div>
        </div>
      </header>

      <main className="px-5 py-4 max-w-3xl mx-auto">
        {loading && (
          <p className="text-sm text-[#2D352C]/60 text-center py-12">
            Loading conversations...
          </p>
        )}
        {error && (
          <div className="text-center py-12" role="alert">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-3 min-h-11 px-5 py-2 rounded-xl bg-[var(--accent-strong)] text-white text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            >
              Try again
            </button>
          </div>
        )}
        {!loading && !error && conversations.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-[#2D352C]/60">No messages yet.</p>
            <p className="text-xs text-[#2D352C]/40 mt-1">
              When your care team reaches out, you&apos;ll see it here.
            </p>
          </div>
        )}
        <ul className="space-y-2">
          {conversations.map((c) => {
            const displayName = c.user.full_name?.trim() || c.user.email || 'Unknown';
            const preview = c.last_message ? formatPreview(c.last_message.body) : '';
            const unread = c.unread_count > 0;
            return (
              <li key={c.user.id}>
                <Link
                  href={`/messages/${c.user.id}`}
                  className={`block p-4 rounded-2xl border transition-colors ${
                    unread
                      ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-white border-[#E5EAE3] hover:bg-[#FAF9F6]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`truncate ${unread ? 'font-semibold' : 'font-medium'}`}>
                          {displayName}
                        </p>
                        {unread && (
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm truncate mt-1 ${unread ? 'text-[#2D352C]' : 'text-[#2D352C]/60'}`}>
                        {preview || 'No messages yet'}
                      </p>
                    </div>
                    <span className="text-xs text-[#2D352C]/40 flex-shrink-0">
                      {c.last_message_at ? formatRelative(c.last_message_at) : ''}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>

      <BottomNav />
    </div>
  );
}
