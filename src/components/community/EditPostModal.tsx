'use client';

import { useEffect, useState } from 'react';
import type { PostCardData } from '@/components/community/PostCard';

interface EditPostModalProps {
  post: PostCardData;
  onClose: () => void;
  onSaved: (post: PostCardData) => void;
  onError: (message: string) => void;
}

const MAX_BODY = 5000;
const MAX_TITLE = 200;

export default function EditPostModal({
  post,
  onClose,
  onSaved,
  onError,
}: EditPostModalProps) {
  const isForum = post.type === 'forum';
  const [body, setBody] = useState(post.body);
  const [title, setTitle] = useState(post.title ?? '');
  const [isPublic, setIsPublic] = useState(post.is_public);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const trimmedBody = body.trim();
  const trimmedTitle = title.trim();
  const valid =
    trimmedBody.length > 0 &&
    trimmedBody.length <= MAX_BODY &&
    (!isForum || trimmedTitle.length > 0);

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        body: trimmedBody,
        is_public: isPublic,
      };
      if (isForum) payload.title = trimmedTitle;

      const res = await fetch(`/api/social/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { post: PostCardData };
        error?: string;
      };
      if (json.success && json.data) {
        onSaved(json.data.post);
        onClose();
      } else {
        onError(json.error ?? 'Failed to update post');
      }
    } catch {
      onError('Failed to update post');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl border border-[#E5EAE3] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-[#F0F2EF]">
          <h2 id="edit-modal-title" className="text-base font-semibold text-[#2D352C]">
            Edit post
          </h2>
        </div>

        <div className="p-5 space-y-3">
          {isForum && (
            <div>
              <label className="block text-xs font-medium text-[#6B7F65] mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                placeholder="Post title"
                className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#E5EAE3] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] placeholder:text-[var(--accent)]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#6B7F65] mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
              rows={5}
              className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#E5EAE3] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] placeholder:text-[var(--accent)] resize-none"
            />
            <p className="text-[10px] text-[#8B9B83] mt-1 text-right">
              {trimmedBody.length}/{MAX_BODY}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#3D4A3A]">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="rounded border-[#E5EAE3] text-[var(--accent)] focus:ring-[var(--accent)]/30"
            />
            Public post
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 bg-[#FAFBF9] border-t border-[#F0F2EF]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[#6B7F65] hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!valid || submitting}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)] transition-colors disabled:opacity-40"
          >
            {submitting ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
