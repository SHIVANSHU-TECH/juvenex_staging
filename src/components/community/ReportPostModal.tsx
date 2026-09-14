'use client';

import { useEffect, useState } from 'react';

interface ReportPostModalProps {
  postId: string;
  onClose: () => void;
  onReported: (message: string) => void;
  onError: (message: string) => void;
}

const MIN_REASON = 10;
const MAX_REASON = 500;

export default function ReportPostModal({
  postId,
  onClose,
  onReported,
  onError,
}: ReportPostModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_REASON && trimmed.length <= MAX_REASON;

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/social/posts/${postId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { alreadyReported?: boolean };
        error?: string;
      };
      if (json.success) {
        onReported(json.data?.alreadyReported ? 'Already reported' : 'Reported');
        onClose();
      } else {
        onError(json.error ?? 'Failed to report post');
      }
    } catch {
      onError('Failed to report post');
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
      aria-labelledby="report-modal-title"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl border border-[#E5EAE3] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-[#F0F2EF]">
          <h2 id="report-modal-title" className="text-base font-semibold text-[#2D352C]">
            Report post
          </h2>
          <p className="text-xs text-[#8B9B83] mt-1">
            Tell us what is wrong with this post. Reports are reviewed by moderators.
          </p>
        </div>

        <div className="p-5">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
            placeholder="What is the issue? (minimum 10 characters)"
            rows={4}
            className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#E5EAE3] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] placeholder:text-[var(--accent)] resize-none"
          />
          <p className="text-[10px] text-[#8B9B83] mt-1 text-right">
            {trimmed.length}/{MAX_REASON}
          </p>
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
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#C06060] text-white hover:bg-[#A85050] transition-colors disabled:opacity-40"
          >
            {submitting ? 'Submitting...' : 'Submit report'}
          </button>
        </div>
      </div>
    </div>
  );
}
