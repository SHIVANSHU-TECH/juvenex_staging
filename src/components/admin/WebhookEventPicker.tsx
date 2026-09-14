'use client'

// WebhookEventPicker — collapsible category-grouped checkbox list of
// PrescribeRx webhook event slugs. Used by CreateWebhookModal.

export interface EventTypesByCategory {
  [category: string]: string[]
}

interface WebhookEventPickerProps {
  eventTypes: EventTypesByCategory
  selected: Set<string>
  total: number
  loading: boolean
  error: string | null
  onToggle: (slug: string) => void
}

export default function WebhookEventPicker({
  eventTypes,
  selected,
  total,
  loading,
  error,
  onToggle,
}: WebhookEventPickerProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-[#2D352C]/70">
        Events ({selected.size}/{total} selected)
      </legend>
      {loading ? (
        <div
          aria-busy="true"
          className="h-24 rounded-lg bg-[#F5F8F3] animate-pulse"
        />
      ) : error ? (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs"
        >
          {error}
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto border border-[#E5EAE3] rounded-lg p-3">
          {Object.entries(eventTypes).map(([cat, slugs]) => (
            <div key={cat}>
              <p className="text-[11px] uppercase tracking-wide text-[#8B9B83] font-medium mb-1">
                {cat}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {slugs.map((slug) => (
                  <label
                    key={slug}
                    className="flex items-center gap-2 text-xs text-[#2D352C] cursor-pointer hover:bg-[#FAF9F6] rounded px-1 py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(slug)}
                      onChange={() => onToggle(slug)}
                      className="rounded border-[#E5EAE3] text-[var(--accent)] focus:ring-[var(--accent)]/60"
                    />
                    <span className="font-mono">{slug}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  )
}
