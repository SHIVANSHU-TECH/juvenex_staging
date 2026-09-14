'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';

interface PostComposerProps {
  authorName: string;
  authorAvatarUrl?: string | null;
  AvatarComponent: React.ComponentType<{ name: string; url?: string; size?: number }>;
  onSubmit: (input: { body: string; imageUrl: string | null; isPublic: boolean; targetId?: string }) => Promise<void>;
  submitting: boolean;
  onError: (message: string) => void;
  targets?: Array<{ id: string; label: string }>;
}

// Storage buckets accept 25MB (see memory: avatars/post-images/progress-photos)
// — keep the client-side gate aligned so large phone photos aren't rejected.
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export default function PostComposer({
  authorName,
  authorAvatarUrl,
  AvatarComponent,
  onSubmit,
  submitting,
  onError,
  targets,
}: PostComposerProps) {
  const [body, setBody] = useState('');
  const [isPublic, setIsPublic] = useState(true); // DEFAULT PUBLIC
  const [targetId, setTargetId] = useState('profile');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = body.trim().length > 0 && !submitting && !uploading;

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onError('Please select an image file');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      onError('Image exceeds 25MB limit');
      e.target.value = '';
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPickedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPickedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function uploadImage(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/social/posts/upload', { method: 'POST', body: fd });
    const json = (await res.json()) as {
      success: boolean;
      data?: { url?: string };
      error?: string;
    };
    if (!json.success || !json.data?.url) {
      onError(json.error ?? 'Failed to upload image');
      return null;
    }
    return json.data.url;
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    let imageUrl: string | null = null;
    if (pickedFile) {
      setUploading(true);
      try {
        imageUrl = await uploadImage(pickedFile);
        if (!imageUrl) {
          setUploading(false);
          return;
        }
      } finally {
        setUploading(false);
      }
    }

    try {
      await onSubmit({
        body: body.trim(),
        imageUrl,
        isPublic,
        targetId: targetId === 'profile' ? undefined : targetId,
      });
    } catch {
      // Creation failed — keep the user's typed draft (and image) so they can
      // retry instead of losing their text. The parent surfaces the error.
      return;
    }

    // Reset only on success
    setBody('');
    setIsPublic(true);
    clearImage();
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-4">
      <div className="flex gap-3">
        <AvatarComponent name={authorName} url={authorAvatarUrl ?? undefined} size={36} />
        <div className="flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Post your progress"
            rows={2}
            className="w-full text-sm text-[#2D352C] placeholder:text-[var(--accent)] resize-none border-0 bg-transparent focus:outline-none leading-relaxed"
          />
          {targets && targets.length > 0 && (
            <div className="mt-2">
              <label className="sr-only" htmlFor="post-target">Post destination</label>
              <select
                id="post-target"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full max-w-xs text-xs font-semibold text-[#6B7F65] bg-[#F5F8F3] border border-[#E5EAE3] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
              >
                <option value="profile">My profile</option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {previewUrl && (
        <div className="relative mt-2 rounded-xl overflow-hidden border border-[#E5EAE3]">
          <Image
            src={previewUrl}
            alt="Selected"
            width={600}
            height={400}
            unoptimized
            className="w-full max-h-72 object-cover"
          />
          <button
            type="button"
            onClick={clearImage}
            aria-label="Remove image"
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-sm flex items-center justify-center hover:bg-black/80"
          >
            &times;
          </button>
        </div>
      )}

      {/* Toolbar: always rendered so the photo button is reachable before the
          user types any text. The Post button is disabled until body has content. */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#F0F2EF]">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handlePickFile}
        />

        {/* Camera icon picker */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || submitting}
          aria-label="Add photo"
          className="p-2 rounded-lg text-[var(--accent)] hover:bg-[#EEF1ED] transition-colors disabled:opacity-40"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>

        {/* Visibility toggle */}
        <button
          type="button"
          onClick={() => setIsPublic((v) => !v)}
          aria-pressed={isPublic}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
            isPublic
              ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
              : 'bg-white text-[#6B7F65] border-[#E5EAE3] hover:border-[var(--accent)]/50'
          }`}
        >
          {isPublic ? 'Public' : 'Private (only me)'}
        </button>

        <div className="flex-1" />

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-5 py-2 bg-[var(--accent)] text-white text-sm font-semibold rounded-xl hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : submitting ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  );
}
