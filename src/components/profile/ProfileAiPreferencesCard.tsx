'use client'

interface ProfileAiPreferencesCardProps {
  aiConsent: boolean
  saving: boolean
  onToggle: () => void
}

export default function ProfileAiPreferencesCard({
  aiConsent,
  saving,
  onToggle,
}: ProfileAiPreferencesCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-xl overflow-hidden">
      <div className="p-4 border-b border-[#E5EAE3] bg-[var(--accent)]/5">
        <h3 className="font-bold text-[#2D352C]">&#x1F4AC; Assistant</h3>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <label
              htmlFor="ai-consent-toggle"
              className="block text-sm font-medium text-[#2D352C] cursor-pointer"
            >
              Allow the assistant to use my health info (peptides, sleep, weight) for personalized
              recommendations.
            </label>
            <p className="text-xs text-[#8B9B83] mt-1 leading-snug">
              When off, the assistant sees only your messages — no profile data.
            </p>
          </div>
          <button
            id="ai-consent-toggle"
            role="switch"
            aria-checked={aiConsent}
            aria-label="Toggle personalization"
            disabled={saving}
            onClick={onToggle}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              aiConsent ? 'bg-[var(--accent)]' : 'bg-[#E5EAE3]'
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                aiConsent ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  )
}
