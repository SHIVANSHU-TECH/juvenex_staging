'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Home', icon: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
  { href: '/store', label: 'Shop', icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
  { href: '/community', label: 'Community', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { href: '/telehealth', label: 'VIP', icon: 'M11.48 3.5a.56.56 0 011.04 0l2.13 4.32 4.77.69a.56.56 0 01.31.96l-3.45 3.36.82 4.75a.56.56 0 01-.82.59L12 15.9l-4.27 2.24a.56.56 0 01-.82-.59l.82-4.75-3.45-3.36a.56.56 0 01.31-.96l4.77-.69z' },
  { href: '/store/account/orders', label: 'Orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  {
    href: '/store/account/doctor',
    label: 'Talk to Doctor',
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  },
  { href: '/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
];

const UNREAD_POLL_INTERVAL_MS = 60_000;

interface UnreadResponse {
  success: boolean;
  data?: { count: number };
  error?: string;
}

function useUnreadCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchCount = async () => {
      // Skip when no auth token is present — the endpoint would 401 anyway.
      if (typeof window !== 'undefined' && !localStorage.getItem('auth_token')) {
        return;
      }
      try {
        const res = await fetch('/api/messages/unread-count');
        if (!res.ok) return;
        const json = (await res.json()) as UnreadResponse;
        if (!cancelled && json.success && json.data) {
          setCount(json.data.count);
        }
      } catch {
        // Ignore — badge silently stays at last-known value.
      }
    };

    fetchCount();
    timer = setInterval(fetchCount, UNREAD_POLL_INTERVAL_MS);
    const onFocus = () => fetchCount();
    // Thread pages dispatch this after marking messages read so the badge
    // clears instantly rather than lingering until the next poll.
    const onMessagesRead = () => fetchCount();
    window.addEventListener('focus', onFocus);
    window.addEventListener('messages:read', onMessagesRead);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('messages:read', onMessagesRead);
    };
  }, []);

  return count;
}

export default function BottomNav() {
  const pathname = usePathname();
  const unread = useUnreadCount();

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#E5EAE3] z-50 shadow-xl"
    >
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          // Shop is `/store…` but must not light up on `/store/account/orders`.
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : item.href === '/store'
                ? pathname === '/store' ||
                  pathname.startsWith('/store/p/') ||
                  pathname.startsWith('/store/cart') ||
                  pathname.startsWith('/store/checkout') ||
                  /^\/store\/[^/]+$/.test(pathname)
                : item.href === '/store/account/orders'
                  ? pathname.startsWith('/store/account/orders')
                  : item.href === '/store/account/doctor'
                    ? pathname.startsWith('/store/account/doctor')
                    : pathname.startsWith(item.href);
          const showUnreadDot = item.href === '/profile' && unread > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={
                showUnreadDot
                  ? `${item.label} (${unread} unread message${unread === 1 ? '' : 's'})`
                  : item.label
              }
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${
                isActive
                  ? 'text-[var(--accent)] bg-[#EEF1ED]'
                  : 'text-[#8B9B83] hover:text-[#6B7567] hover:bg-[#FAF9F6]'
              }`}
            >
              <div className="relative">
                <svg
                  className="w-5 h-5"
                  fill={isActive ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={item.icon}
                  />
                </svg>
                {showUnreadDot && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white"
                  />
                )}
              </div>
              <span className="text-[10px] font-bold">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
