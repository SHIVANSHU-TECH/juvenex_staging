'use client'

import Image from 'next/image'

export interface ProfileProgressPhoto {
  id: string
  photo_url?: string | null
  storage_path?: string | null
  weight?: number | null
  notes?: string | null
  is_public?: boolean
  created_at: string
}

export interface WeightEntry {
  id: string
  weight_lbs: number
  recorded_on: string
}

interface ProfileProgressTabProps {
  progressPhotos: ProfileProgressPhoto[]
  weightEntries: WeightEntry[]
  dataLoading: boolean
  uploading: boolean
  // Optional caption applied to the next uploaded photo.
  caption: string
  onCaptionChange: (value: string) => void
  onAddPhoto: () => void
  onDeletePhoto: (photoId: string) => void
  onTogglePublic: (photoId: string, makePublic: boolean) => void
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ProfileProgressTab({
  progressPhotos,
  weightEntries,
  dataLoading,
  uploading,
  caption,
  onCaptionChange,
  onAddPhoto,
  onDeletePhoto,
  onTogglePublic,
}: ProfileProgressTabProps) {
  const weights = weightEntries.map((entry) => entry.weight_lbs)
  const maxW = weights.length > 0 ? Math.max(...weights) : 0
  const minW = weights.length > 0 ? Math.min(...weights) : 0
  const range = maxW - minW || 1

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-[#2D352C]">Progress Photos</h3>
          <button
            type="button"
            onClick={onAddPhoto}
            disabled={uploading}
            className="min-h-9 rounded-full px-3 text-xs font-bold text-[var(--accent)] hover:bg-[#EEF1ED] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
          >
            {uploading ? 'Uploading...' : '+ Add Photo'}
          </button>
        </div>
        <p className="mb-3 text-xs text-[#8B9B83]">
          New photos are private. Tap <span className="font-semibold">Private</span> on a
          photo to share it on your community profile.
        </p>
        <div className="mb-3">
          <label htmlFor="progress-caption" className="mb-1 block text-xs font-semibold text-[#6B7567]">
            Caption (optional)
          </label>
          <input
            id="progress-caption"
            type="text"
            maxLength={1000}
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            placeholder="Add a note for your next photo…"
            className="w-full rounded-xl border border-[#E5EAE3] px-3 py-2 text-sm text-[#2D352C] focus:border-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          />
        </div>
        {dataLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-square rounded-xl bg-[#EEF1ED] animate-pulse" />
            ))}
          </div>
        ) : progressPhotos.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">&#x1F4F8;</p>
            <p className="text-[#6B7567] font-medium">No progress photos yet</p>
            <p className="text-xs text-[#8B9B83] mt-1">Track your transformation visually!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {progressPhotos.map((pic) => (
              <div
                key={pic.id}
                className="relative aspect-square overflow-hidden rounded-xl bg-[#EEF1ED]"
              >
                {pic.photo_url ? (
                  <Image
                    src={pic.photo_url}
                    alt={`Progress photo from ${formatDate(pic.created_at)}`}
                    fill
                    sizes="(max-width: 768px) 50vw, 240px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center">
                    <span className="text-3xl">&#x1F4F8;</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onTogglePublic(pic.id, !(pic.is_public ?? false))}
                  aria-label={
                    pic.is_public
                      ? `Photo from ${formatDate(pic.created_at)} is public — tap to make private`
                      : `Photo from ${formatDate(pic.created_at)} is private — tap to make public`
                  }
                  className={`absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    pic.is_public
                      ? 'bg-[var(--accent)]/90 text-white hover:bg-[var(--accent)]'
                      : 'bg-black/55 text-white hover:bg-black/70'
                  }`}
                >
                  {pic.is_public ? (
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  )}
                  {pic.is_public ? 'Public' : 'Private'}
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePhoto(pic.id)}
                  aria-label={`Delete progress photo from ${formatDate(pic.created_at)}`}
                  className="absolute top-1.5 right-1.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-2 text-white">
                  <span className="block text-xs font-semibold">{formatDate(pic.created_at)}</span>
                  {(pic.weight ?? 0) > 0 && (
                    <span className="block text-xs font-bold">{pic.weight} lbs</span>
                  )}
                  {pic.notes && (
                    <span className="block text-[10px] text-white/85 line-clamp-1">
                      {pic.notes}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
        <h3 className="font-bold text-[#2D352C] mb-3">Weight Graph</h3>
        {weightEntries.length > 0 ? (
          <>
            <div className="flex h-40 items-end gap-2 rounded-xl bg-[#FAF9F6] p-3">
              {weightEntries.map((entry) => {
                const weight = entry.weight_lbs
                const pct = 28 + ((weight - minW) / range) * 72
                return (
                  <div key={entry.id} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-[var(--accent-secondary)] to-[var(--accent)]"
                      style={{ height: `${pct}%` }}
                    />
                    <span className="text-[10px] font-semibold text-[#6B7567]">{weight}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-[#8B9B83]">
              <span>{formatShortDate(`${weightEntries[0].recorded_on}T00:00:00`)}</span>
              <span>{formatShortDate(`${weightEntries[weightEntries.length - 1].recorded_on}T00:00:00`)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-end gap-1 h-24">
              {[100, 95, 88, 82, 78, 75, 72, 70, 68, 65].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-gradient-to-t from-[var(--accent)] to-[var(--accent)] rounded-t"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-[#8B9B83]">
              <span>Jan</span>
              <span>Apr</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
