'use client'

import Image from 'next/image'

interface ProfileHeaderCardProps {
  initials: string
  displayName: string
  displayEmail: string
  medicationType: string
  weeksOnProgram: number
  lbsLost: number
  currentWeight: number
  goalPercent: number
  avatarUrl?: string | null
  onEditPhoto?: () => void
  avatarUploading?: boolean
}

export function ProfileSkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-xl p-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-[#EEF1ED]" />
        <div className="flex-1 space-y-2">
          <div className="h-5 bg-[#EEF1ED] rounded w-32" />
          <div className="h-3 bg-[#EEF1ED] rounded w-24" />
          <div className="flex gap-2 mt-1">
            <div className="h-5 bg-[#EEF1ED] rounded-full w-20" />
            <div className="h-5 bg-[#EEF1ED] rounded-full w-16" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-[#E5EAE3]">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="text-center space-y-1">
            <div className="h-5 bg-[#EEF1ED] rounded w-8 mx-auto" />
            <div className="h-3 bg-[#EEF1ED] rounded w-12 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

function AvatarDisplay({
  avatarUrl,
  initials,
  displayName,
}: {
  avatarUrl?: string | null
  initials: string
  displayName: string
}) {
  if (avatarUrl) {
    // Allow both Supabase public URLs and data: URLs (fallback storage).
    // Data URLs cannot use next/image; render an <img> in that case.
    if (avatarUrl.startsWith('data:')) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={`${displayName} avatar`}
          className="w-20 h-20 rounded-full object-cover shadow-lg ring-4 ring-white"
          width={80}
          height={80}
        />
      )
    }
    return (
      <Image
        src={avatarUrl}
        alt={`${displayName} avatar`}
        width={80}
        height={80}
        className="w-20 h-20 rounded-full object-cover shadow-lg ring-4 ring-white"
        unoptimized
      />
    )
  }
  return (
    <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent)] flex items-center justify-center text-3xl text-white font-bold shadow-lg ring-4 ring-white">
      {initials}
    </div>
  )
}

export default function ProfileHeaderCard({
  initials,
  displayName,
  displayEmail,
  medicationType,
  weeksOnProgram,
  lbsLost,
  currentWeight,
  goalPercent,
  avatarUrl,
  onEditPhoto,
  avatarUploading,
}: ProfileHeaderCardProps) {
  // Defensive formatting: float subtraction upstream can yield artifacts like
  // 2.4000000000000004 — always render weights with at most 1 decimal.
  const fmtLbs = (n: number) => {
    const rounded = Math.round(n * 10) / 10
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  }
  return (
    <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-xl overflow-hidden">
      {/* Banner — reflects the uploaded avatar (blurred cover) so the header
          visibly changes when a profile photo is added; falls back to the
          brand gradient when there is no avatar yet. */}
      <div className="relative h-24 w-full">
        {avatarUrl ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center scale-110 blur-sm"
            style={{ backgroundImage: `url("${avatarUrl}")` }}
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)]"
          />
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-black/15" />
      </div>
      <div className="p-6 pt-3">
      <div className="flex items-end gap-4">
        <div className="relative -mt-14">
          <AvatarDisplay
            avatarUrl={avatarUrl}
            initials={initials}
            displayName={displayName}
          />
          {onEditPhoto && (
            <button
              type="button"
              onClick={onEditPhoto}
              disabled={avatarUploading}
              aria-label="Edit profile photo"
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white border border-[#E5EAE3] shadow-md flex items-center justify-center text-[#6B7567] hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {avatarUploading ? (
                <span
                  className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-[#2D352C]">{displayName}</h2>
          <p className="text-sm text-[#6B7567]">{displayEmail}</p>
          <div className="flex gap-2 mt-1">
            {medicationType && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--accent)] text-white">
                {medicationType}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full text-xs bg-[#EEF1ED] text-[var(--accent-secondary)]">
              {weeksOnProgram > 0 ? `Week ${weeksOnProgram}` : 'New Member'}
            </span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-[#E5EAE3]">
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--accent)]">{lbsLost > 0 ? `-${fmtLbs(lbsLost)}` : lbsLost < 0 ? `+${fmtLbs(Math.abs(lbsLost))}` : '0'}</p>
          <p className="text-[10px] text-[#8B9B83]">lbs +/-</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--accent)]">{weeksOnProgram}</p>
          <p className="text-[10px] text-[#8B9B83]">weeks</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--accent)]">
            {currentWeight > 0 ? fmtLbs(currentWeight) : '--'}
          </p>
          <p className="text-[10px] text-[#8B9B83]">current</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--accent)]">
            {goalPercent > 0 ? `${goalPercent}%` : '0%'}
          </p>
          <p className="text-[10px] text-[#8B9B83]">goal</p>
        </div>
      </div>
      </div>
    </div>
  )
}
