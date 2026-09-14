'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface FollowUser {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

interface FollowListModalProps {
  userId: string;
  mode: 'followers' | 'following';
  onClose: () => void;
}

function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const initials = (name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  if (url) {
    return (
      <Image
        src={url}
        alt={name || 'User'}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: 'linear-gradient(135deg, #8FA888 0%, #6B7F65 100%)',
        color: '#FFFFFF',
      }}
    >
      {initials}
    </div>
  );
}

export default function FollowListModal({ userId, mode, onClose }: FollowListModalProps) {
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/social/users/${userId}/${mode}`);
        const json = (await res.json()) as {
          success: boolean;
          data?: { users: FollowUser[] };
          error?: string;
        };
        if (cancelled) return;
        if (json.success && json.data) {
          setUsers(json.data.users);
        } else {
          setError(json.error ?? 'Failed to load');
        }
      } catch {
        if (!cancelled) setError('Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, mode]);

  const title = mode === 'followers' ? 'Followers' : 'Following';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="follow-list-title"
    >
      <div
        className="w-full max-w-md max-h-[80vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl border border-[#E5EAE3] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[#F0F2EF]">
          <h2 id="follow-list-title" className="text-base font-semibold text-[#2D352C]">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6B7F65] hover:bg-[#F5F7F4]"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 text-center py-8">{error}</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-[#8B9B83] text-center py-8">
              {mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </p>
          ) : (
            <ul className="divide-y divide-[#F0F2EF]">
              {users.map((u) => (
                <li key={u.id}>
                  <Link
                    href={`/community/users/${u.id}`}
                    onClick={onClose}
                    className="flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-[#F5F7F4] transition-colors"
                  >
                    <Avatar name={u.name ?? 'User'} url={u.avatar_url} size={40} />
                    <span className="text-sm font-medium text-[#2D352C] truncate">
                      {u.name ?? 'User'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
