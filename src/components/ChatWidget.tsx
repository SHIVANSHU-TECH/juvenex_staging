'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  showUpgrade?: boolean;
  upgradeUrl?: string;
}

// Marker formats emitted by the server system prompt — see
// src/app/api/ai/chat/route.ts (BASE_SYSTEM_PROMPT).
//   [consult_cta]            → renders a prominent consult button
//   [product:Product Name]   → renders a product chip linking to /shop?search=
//   [blog:slug]              → renders a blog chip linking to /blog/<slug>
const CONSULT_MARKER = '[consult_cta]';
const PRODUCT_MARKER_RE = /\[product:([^\]]+)\]/g;
const BLOG_MARKER_RE = /\[blog:([a-z0-9-]+)\]/gi;

// Hard ceiling on how many of each marker we honor in a single assistant
// message. Pathological model output (e.g. hundreds of marker repetitions)
// could otherwise blow up rendering or chip lists. Anything past the cap is
// stripped silently.
const MAX_MARKERS_PER_MESSAGE = 50;

interface ParsedMessage {
  text: string;
  hasConsult: boolean;
  products: string[];
  blogs: string[];
}

function parseMarkers(raw: string): ParsedMessage {
  let text = raw;

  const hasConsult = text.includes(CONSULT_MARKER);
  if (hasConsult) {
    text = text.split(CONSULT_MARKER).join('').trim();
  }

  const products: string[] = [];
  let productCount = 0;
  text = text.replace(PRODUCT_MARKER_RE, (_match, name: string) => {
    productCount += 1;
    if (productCount > MAX_MARKERS_PER_MESSAGE) {
      // Strip excess markers entirely.
      return '';
    }
    const clean = name.trim();
    if (clean && !products.includes(clean)) products.push(clean);
    // Keep the product name inline so the sentence still reads naturally.
    return clean;
  });

  const blogs: string[] = [];
  let blogCount = 0;
  text = text.replace(BLOG_MARKER_RE, (_match, slug: string) => {
    blogCount += 1;
    if (blogCount > MAX_MARKERS_PER_MESSAGE) {
      return '';
    }
    const clean = slug.trim().toLowerCase();
    if (clean && !blogs.includes(clean)) blogs.push(clean);
    // Drop the marker from the body — rendered as a chip below.
    return '';
  });

  // Collapse any double-spaces left by removed markers.
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?])/g, '$1').trim();

  // Remove dangling connector phrases left when an inline blog/product marker
  // (the only thing they pointed to) was stripped — e.g. a line ending in
  // "...check out." or "Read more:" with nothing after it.
  text = text
    .replace(/\b(?:read more|check (?:it|them|this|that)?\s*out|learn more|see|explore)\s*[:.]?\s*(?=\n|$)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // NOTE: markdown emphasis/list markers are intentionally LEFT INTACT here.
  // They are rendered (not stripped) by renderMarkdown() below so the model's
  // **bold** and "- " bullet lists display as real formatting instead of
  // literal characters.
  return { text, hasConsult, products, blogs };
}

// ---------------------------------------------------------------------------
// Lightweight markdown rendering for assistant bubbles.
//
// The model emits basic markdown (bold, bullet lists, line breaks). We render
// just those — NOT a full markdown engine — directly to React nodes. All
// regexes are written WITHOUT lookbehind so older mobile Safari (which throws
// a SyntaxError on lookbehind) keeps working.
// ---------------------------------------------------------------------------

// Captures inline spans so String.split keeps the delimiters: **bold**,
// __bold__, and `code`. Single * / _ are deliberately not treated as italic to
// avoid mangling identifiers like product_name.
const INLINE_MARKDOWN_RE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`)/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  return text
    .split(INLINE_MARKDOWN_RE)
    .map((part, i) => {
      if (!part) return null;
      const key = `${keyBase}-${i}`;
      if (
        (part.startsWith('**') && part.endsWith('**')) ||
        (part.startsWith('__') && part.endsWith('__'))
      ) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={key} className="rounded bg-[#EEF1ED] px-1 py-0.5 text-[13px]">
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={key}>{part}</span>;
    })
    .filter((node) => node !== null);
}

function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-0.5 pl-5">
        {listItems}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      listItems.push(
        <li key={`li-${i}`}>{renderInline(bullet[1], `li-${i}`)}</li>
      );
      return;
    }
    flushList();
    if (line.trim() === '') return; // blank line → block gap (space-y on parent)
    // Strip a leading markdown heading marker but keep the text on its own line.
    const heading = line.replace(/^#{1,6}\s+/, '');
    // A whole line wrapped in a single _…_ or *…* (e.g. the
    // "_This is not medical advice_" disclaimer) → render italic. Whole-line
    // only, and the inner class excludes the delimiter, so **bold** lines and
    // mid-word underscores in identifiers like product_name are never affected.
    const trimmed = heading.trim();
    const italicLine = trimmed.match(/^_([^_\n]+)_$/) ?? trimmed.match(/^\*([^*\n]+)\*$/);
    if (italicLine) {
      blocks.push(
        <p key={`p-${i}`} className="italic opacity-80">
          {renderInline(italicLine[1], `p-${i}`)}
        </p>
      );
      return;
    }
    blocks.push(<p key={`p-${i}`}>{renderInline(heading, `p-${i}`)}</p>);
  });
  flushList();

  return blocks;
}

export default function ChatWidget() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm your Juvenex assistant. Ask about your plan, products, or progress.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // Hide the FAB while the user is actively scrolling DOWN so it can't sit on
  // top of a bottom CTA ("Next", "Choose Basic", "Open Photos"); reveal on
  // scroll-up or when scrolling stops. Never hidden while the panel is open.
  const [fabHidden, setFabHidden] = useState(false);

  // Auto-hide the FAB on scroll-down, restore on scroll-up / idle.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let lastY = window.scrollY;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastY + 8 && y > 120) setFabHidden(true);
      else if (y < lastY - 8) setFabHidden(false);
      lastY = y;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setFabHidden(false), 900);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, []);

  // Persist conversationId across sessions so the assistant's memory follows
  // the user (server reloads prior turns from chat_messages on resume).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('juvenex_chat_conversation_id');
    // Init-from-storage on mount; the rule flags the synchronous set but it's a
    // one-time hydrate, not a render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setConversationId(stored);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (conversationId) {
      window.localStorage.setItem('juvenex_chat_conversation_id', conversationId);
    }
  }, [conversationId]);

  // Restore the visible thread from server-side memory once a saved
  // conversation exists, so reopening the widget shows prior turns. The model
  // already keeps memory server-side; this just makes it visible to the user.
  const historyLoadedRef = useRef(false);
  useEffect(() => {
    if (!conversationId || historyLoadedRef.current || !isAuthenticated) return;
    historyLoadedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/ai/chat?conversationId=${encodeURIComponent(conversationId)}`
        );
        const json = (await res.json()) as {
          success?: boolean;
          data?: { messages?: Array<{ role: string; content: string }> };
        };
        if (cancelled) return;
        const restored = json?.data?.messages ?? [];
        if (restored.length > 0) {
          setMessages((prev) => [
            prev[0],
            ...restored.map((m, i) => ({
              id: `hist-${i}`,
              role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
              content: m.content,
              timestamp: new Date(),
            })),
          ]);
        }
      } catch {
        // Ignore — keep the default greeting if history can't load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, isAuthenticated]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus management on open/close: when the chat panel opens, move focus
  // to the input so screen reader + keyboard users can immediately type.
  // When it closes, restore focus to the FAB so the user's place in the
  // tab order is preserved (WCAG 2.4.3 Focus Order).
  useEffect(() => {
    if (isOpen) {
      // Defer slightly so the panel has rendered before focus moves.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    // Restore focus to the toggle when closing. Avoid stealing focus from
    // an unrelated element if the user has already moved on.
    if (typeof document !== 'undefined' && document.activeElement === document.body) {
      fabRef.current?.focus();
    }
  }, [isOpen]);

  // Esc closes the chat panel. Scoped to when isOpen so we don't add a
  // global listener when the panel isn't mounted.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        // Return focus to FAB explicitly on Esc — the focus-restore effect
        // above only runs if focus is on body, which won't be the case here.
        fabRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // Matches a capitalized first+last name pattern like "John Smith".
  // Intentionally conservative: requires TWO consecutive capitalized words
  // so single capitalized tokens (medications, diseases, places) don't fire.
  const NAME_PATTERN = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/;

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    // Client-side name blocklist: warn before submit if the message looks
    // like it contains a full name. The server still sanitizes PHI, but a
    // pre-submit nudge reduces the chance of names reaching the model.
    if (NAME_PATTERN.test(input)) {
      const proceed = window.confirm(
        "Your message appears to contain a name. Continue? Our system will remove it, but it's safer to avoid sharing names in chat."
      );
      if (!proceed) return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const body: Record<string, unknown> = {
        message: userMessage.content,
      };
      if (conversationId) {
        body.conversationId = conversationId;
      }

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Tolerate a non-JSON body (e.g. an upstream proxy returning HTML on
      // a 5xx). Falling back to an empty object lets the status-code branches
      // below still produce a friendly user-facing message.
      let data: {
        success?: boolean;
        error?: string;
        data?: { reply?: string; conversationId?: string; upgradeUrl?: string };
      } = {};
      try {
        data = await response.json();
      } catch {
        // body wasn't JSON — leave data as {}
      }

      // Pro-gate: server returns { success: false, error: 'pro_required', data: { upgradeUrl } }
      // with HTTP 402. Render as an in-thread upgrade CTA instead of a crash.
      if (
        (response.status === 402 || data.error === 'pro_required') &&
        !data.success
      ) {
        const upgradeUrl: string = data.data?.upgradeUrl ?? '/store';
        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content:
              "You've hit the free daily limit. Upgrade to Juvenex Pro for unlimited chat, personalized recommendations, and priority consults.",
            timestamp: new Date(),
            showUpgrade: true,
            upgradeUrl,
          },
        ]);
        return;
      }

      if (!response.ok || !data.success) {
        // Map known status codes to specific user-facing copy. Never reflect
        // raw server error text into the UI — that can leak stack-trace-ish
        // detail or confuse non-technical users.
        let userMessage = 'Something went wrong. Please try again.';
        if (response.status === 503) {
          userMessage = 'Chat temporarily unavailable. Please try again shortly.';
        } else if (response.status === 429) {
          userMessage = "You're sending messages too quickly. Please wait a moment and try again.";
        } else if (response.status === 401) {
          userMessage = 'Your session expired. Please sign in again.';
        }
        // Dev-only debug context. We deliberately suppress in production so
        // users in the field don't see internal error detail in their browser
        // console; the in-thread userMessage above is the production UX.
        if (process.env.NODE_ENV !== 'production') {
          console.error('ai/chat request failed', {
            status: response.status,
            serverError: data.error,
          });
        }
        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: userMessage,
            timestamp: new Date(),
          },
        ]);
        return;
      }

      if (data.data?.conversationId) {
        setConversationId(data.data.conversationId);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.data?.reply ?? 'Sorry, I had trouble responding. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: unknown) {
      // Network-level failure (fetch threw). Dev-only console detail; the
      // on-screen message stays generic regardless of environment.
      if (process.env.NODE_ENV !== 'production') {
        const errorText = err instanceof Error ? err.message : String(err);
        console.error('ai/chat network error', errorText);
      }
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || !isAuthenticated) {
    return null;
  }

  // Hide the floating assistant on routes with a prominent sticky bottom CTA or
  // a full-screen wizard, where the FAB would overlap the primary button (and
  // the scroll-to-hide behavior can't help on short, non-scrolling steps):
  //   /checkout* — cart subtotal/total + place-order button
  //   /meals     — multi-step wizard with a sticky "Next →" button
  //   /consult, /telehealth — PrescribeRx VIP intake embed (already talking to a provider)
  //   /register, /login — auth forms
  // Also redundant on /telehealth since the FAB itself is the "Speak to a
  // Provider" shortcut into VIP.
  // Also hidden on /dashboard, /profile, /settings — the fixed FAB
  // (bottom-24 right-4) was overlapping and hijacking taps on real controls
  // there: the /dashboard "Intake" quick-action card, /profile's "Log" button
  // and sub-tabs, /settings' Delete-account row (multi-device + interaction
  // audit findings). Chat stays available on /shop, /community, /learn, etc.
  const FAB_HIDDEN_PREFIXES = ['/checkout', '/meals', '/consult', '/telehealth', '/register', '/login', '/intake', '/dashboard', '/profile', '/settings'];
  if (pathname && FAB_HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <>
      {/* Chat Button (FAB) */}
      <button
        ref={fabRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close chat' : 'Open Juvenex Assistant'}
        aria-expanded={isOpen}
        aria-controls="juvenex-chat-panel"
        className={`fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] shadow-lg shadow-[var(--accent)]/30 overflow-hidden flex items-center justify-center hover:scale-110 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong,#5C7A4F)] focus-visible:ring-offset-2 ${
          fabHidden && !isOpen
            ? 'pointer-events-none translate-y-24 opacity-0'
            : 'translate-y-0 opacity-100'
        }`}
      >
        <Image
          src="/doctor-chat-icon.png"
          alt=""
          aria-hidden="true"
          width={56}
          height={56}
          className="w-full h-full object-cover"
          priority
        />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div
          id="juvenex-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="chat-title"
          className="fixed bottom-36 right-4 w-80 h-[500px] bg-[#FAF9F6] border border-[#E5EAE3] rounded-3xl z-50 flex flex-col overflow-hidden shadow-2xl"
        >
          {/* Accessible name for the dialog. The visible "Juvenex Assistant"
              label below is decorative; this heading is what screen readers
              announce as the dialog title. */}
          <h2 id="chat-title" className="sr-only">
            Juvenex Assistant
          </h2>

          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center" aria-hidden="true">
                &#x1F4AC;
              </div>
              <div>
                <p className="font-bold text-sm text-white">Juvenex Assistant</p>
                <p className="text-xs text-white/70">Ask about your plan, products, or progress</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                fabRef.current?.focus();
              }}
              aria-label="Close chat"
              className="text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--accent-secondary)] rounded"
            >
              <span aria-hidden="true">&#x2715;</span>
            </button>
          </div>

          {/* Messages — polite live region announces new assistant replies
              without interrupting the user. aria-atomic="false" so only the
              newly added node is read, not the entire transcript. */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-3"
            aria-live="polite"
            aria-atomic="false"
            aria-relevant="additions text"
          >
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-[#E5EAE3] p-3 rounded-2xl">
                  <div className="flex gap-1" aria-hidden="true">
                    <span className="w-2 h-2 bg-[var(--accent)]/40 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-[var(--accent)]/40 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <span className="w-2 h-2 bg-[var(--accent)]/40 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Dedicated status region for assistive tech. The bouncing-dots
              indicator above is purely visual; this announces the typing
              state to screen readers. role="status" + aria-live="polite"
              avoids interrupting the user's current focus. */}
          <span className="sr-only" role="status" aria-live="polite">
            {isLoading ? 'Assistant is typing' : ''}
          </span>

          {/* PHI warning banner */}
          <div className="px-3 py-2 border-t border-amber-200 bg-amber-50">
            <p className="text-[11px] leading-snug text-amber-800">
              <span aria-hidden="true">&#x26A0; </span>Do not include your full name, address, DOB, or phone number in messages. We strip these automatically but please keep messages general.
            </p>
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[#E5EAE3]">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Ask a question..."
                aria-label="Type your message"
                className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#E5EAE3] text-sm text-[#2D352C] focus:border-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong,#5C7A4F)] focus-visible:ring-offset-2"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
                className="px-3 py-2 rounded-xl bg-[var(--accent)] text-white disabled:bg-[#E5EAE3] disabled:text-[var(--text-muted,#8B9B83)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong,#5C7A4F)] focus-visible:ring-offset-2"
              >
                <span aria-hidden="true">&#x27A4;</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface MessageBubbleProps {
  msg: Message;
}

function MessageBubble({ msg }: MessageBubbleProps) {
  // User bubbles render raw — markers are only expected from the assistant.
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] p-3 rounded-2xl text-sm bg-[var(--accent)] text-white">
          {msg.content}
        </div>
      </div>
    );
  }

  // Free-tier upgrade CTA message (no marker parsing — server-generated text).
  if (msg.showUpgrade) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] space-y-2">
          <div className="p-3 rounded-2xl text-sm bg-white border border-[#E5EAE3] text-[#2D352C]">
            {msg.content}
          </div>
          <Link
            href={msg.upgradeUrl ?? '/store'}
            className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-bold shadow-lg hover:from-amber-600 hover:to-amber-700"
          >
            <span>&#x2B50;</span>
            <span>Upgrade to Juvenex Pro</span>
          </Link>
        </div>
      </div>
    );
  }

  const parsed = parseMarkers(msg.content);

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-2">
        <div className="p-3 rounded-2xl text-sm bg-white border border-[#E5EAE3] text-[#2D352C] space-y-1.5 [&_strong]:font-bold">
          {renderMarkdown(parsed.text)}
        </div>

        {/* Product chips */}
        {parsed.products.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {parsed.products.map((name) => (
              <Link
                key={`product-${name}`}
                href={`/shop?search=${encodeURIComponent(name)}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EEF1ED] border border-[#E5EAE3] text-[11px] font-medium text-[#2D352C] hover:bg-[#DCE4D8]"
              >
                <span>&#x1F6D2;</span>
                <span>{name}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Blog chips */}
        {parsed.blogs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {parsed.blogs.map((slug) => (
              <Link
                key={`blog-${slug}`}
                href={`/blog/${slug}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-medium text-blue-800 hover:bg-blue-100"
              >
                <span>&#x1F4D6;</span>
                <span>Read article</span>
              </Link>
            ))}
          </div>
        )}

        {/* Consult CTA */}
        {parsed.hasConsult && (
          <Link
            href="/telehealth"
            className="flex items-center justify-between gap-2 w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-[var(--accent-secondary)] to-[var(--accent-strong)] text-white text-sm font-bold shadow-lg hover:from-[var(--accent-strong)] hover:to-[var(--accent-strong)]"
          >
            <span className="flex items-center gap-2">
              <span>&#x1F468;&#x200D;&#x2695;&#xFE0F;</span>
              <span>Talk to a Provider</span>
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-[9px] font-black text-amber-900">
              PRO
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
