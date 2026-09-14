'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import BottomNav from '@/components/BottomNav';
import type { Message, MessageThreadResponse, MessageUser } from '@/lib/messaging';
import type { ApiEnvelope } from '@/lib/api-types';
import { formatChatTime } from '@/lib/format';

type ThreadResponse = ApiEnvelope<MessageThreadResponse>;
type MarkReadResponse = ApiEnvelope<{ marked_read: number }>;
type SendResponse = ApiEnvelope<{ message: Message }>;

interface PageProps {
  params: Promise<{ threadUserId: string }>;
}

export default function ThreadPage({ params }: PageProps) {
  const { threadUserId } = use(params);
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [partner, setPartner] = useState<MessageUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [markedCount, setMarkedCount] = useState<number | null>(null);
  // Support deep links (e.g. /consult "Message support") pass ?prefill= so the
  // member lands with the composer already filled. Read from window to avoid
  // the useSearchParams Suspense requirement (same pattern as /shop ?search=).
  const [text, setText] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return new URLSearchParams(window.location.search).get('prefill') ?? '';
    } catch {
      return '';
    }
  });
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const loadThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages/${threadUserId}`);
      const json = (await res.json()) as ThreadResponse;
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'Failed to load conversation');
        setMessages([]);
        setPartner(null);
        return;
      }
      setMessages(json.data.messages);
      setPartner(json.data.thread_user);
    } catch (err) {
      console.error('Thread loadThread failed', err);
      setError('Network error');
      setMessages([]);
      setPartner(null);
    } finally {
      setLoading(false);
    }
  }, [threadUserId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadThread();
  }, [isAuthenticated, loadThread]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  const userId = user?.id;

  const performMarkRead = useCallback(
    async (silent: boolean) => {
      try {
        const res = await fetch(`/api/messages/${threadUserId}`, { method: 'POST' });
        const json = (await res.json()) as MarkReadResponse;
        if (!res.ok || !json.success || !json.data) {
          if (!silent) setError(json.error ?? 'Failed to mark as read');
          return;
        }
        if (!silent) setMarkedCount(json.data.marked_read);
        // Reflect read state locally without another round-trip.
        const now = new Date().toISOString();
        setMessages((prev) =>
          prev.map((m) =>
            m.to_user_id === userId && !m.read_at ? { ...m, read_at: now } : m
          )
        );
        // Tell the BottomNav badge to refresh immediately instead of waiting
        // for its next 60s poll.
        if (json.data.marked_read > 0 && typeof window !== 'undefined') {
          window.dispatchEvent(new Event('messages:read'));
        }
      } catch (err) {
        console.error('Thread performMarkRead failed', err);
        if (!silent) setError('Network error');
      }
    },
    [threadUserId, userId]
  );

  const handleMarkRead = async () => {
    if (marking) return;
    setMarking(true);
    setMarkedCount(null);
    await performMarkRead(false);
    setMarking(false);
  };

  // Opening a conversation IS reading it: silently clear unread on load so the
  // new-message alert goes away without the user pressing a button. Guarded by
  // a ref so the POST fires at most once per thread, even though marking
  // updates `messages` (which would otherwise re-trigger this effect).
  const autoMarkedRef = useRef(false);
  useEffect(() => {
    autoMarkedRef.current = false;
  }, [threadUserId]);
  useEffect(() => {
    if (loading || autoMarkedRef.current) return;
    const hasUnreadIncoming = messages.some(
      (m) => m.to_user_id === userId && !m.read_at
    );
    if (hasUnreadIncoming) {
      autoMarkedRef.current = true;
      void performMarkRead(true);
    }
  }, [loading, messages, userId, performMarkRead]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages/${threadUserId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      const json = (await res.json()) as SendResponse;
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'Failed to send message');
        return;
      }
      setMessages((prev) => [...prev, json.data!.message]);
      setText('');
    } catch (err) {
      console.error('Thread handleSend failed', err);
      setError('Network error');
    } finally {
      setSending(false);
    }
  };

  if (isLoading || !isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
        <p className="text-[#2D352C]/60 text-sm">Loading...</p>
      </div>
    );
  }

  const displayName = partner?.full_name?.trim() || partner?.email || 'Conversation';
  const hasUnread = messages.some((m) => m.to_user_id === user.id && !m.read_at);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24 flex flex-col">
      <header className="px-5 py-4 border-b border-[#E5EAE3] bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3 max-w-3xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/messages"
              aria-label="Back to messages"
              className="text-[#2D352C]/60 hover:text-[#2D352C] flex-shrink-0"
            >
              ←
            </Link>
            <Link
              href={`/community/users/${threadUserId}`}
              aria-label={`View ${displayName}'s profile`}
              className="min-w-0 group"
            >
              <h1 className="text-lg font-semibold truncate group-hover:underline">{displayName}</h1>
              {partner?.email ? (
                <p className="text-xs text-[#2D352C]/50 truncate">{partner.email}</p>
              ) : (
                <p className="text-xs text-[var(--accent)] truncate">View profile</p>
              )}
            </Link>
          </div>
          <button
            type="button"
            onClick={handleMarkRead}
            disabled={marking || !hasUnread}
            className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            {marking ? 'Marking...' : hasUnread ? 'Mark as read' : 'All read'}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-4 pb-36">
        {loading && (
          <p className="text-sm text-[#2D352C]/60 text-center">Loading messages...</p>
        )}
        {error && (
          <p className="text-sm text-red-600 text-center" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && messages.length === 0 && (
          <p className="text-sm text-[#2D352C]/60 text-center">No messages in this conversation.</p>
        )}
        {markedCount !== null && markedCount > 0 && (
          <p className="text-xs text-emerald-700 text-center mb-2">
            Marked {markedCount} message{markedCount === 1 ? '' : 's'} as read.
          </p>
        )}
        <div ref={scrollRef} className="space-y-3" aria-live="polite">
          {messages.map((msg) => {
            const fromMe = msg.from_user_id === user.id;
            return (
              <div
                key={msg.id}
                className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-2xl shadow-sm ${
                    fromMe
                      ? 'bg-emerald-600 text-white rounded-br-sm'
                      : 'bg-white border border-[#E5EAE3] text-[#2D352C] rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words text-sm">{msg.body}</p>
                  <p
                    className={`mt-1 text-[10px] ${
                      fromMe ? 'text-white/70' : 'text-[#2D352C]/40'
                    }`}
                  >
                    {formatChatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Message composer — fixed above the bottom nav */}
      <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-[#E5EAE3] bg-white px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 4000))}
            placeholder={`Message ${partner?.full_name?.trim() || ''}`.trim()}
            rows={1}
            aria-label="Type a message"
            className="flex-1 resize-none max-h-32 text-sm px-4 py-2.5 rounded-2xl border border-[#E5EAE3] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] placeholder:text-[var(--accent)]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            aria-label="Send message"
            className="flex-shrink-0 px-4 py-2.5 rounded-2xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent)] transition-colors disabled:opacity-40"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
