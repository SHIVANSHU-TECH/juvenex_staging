import Section from './Section'
import ActionButton from './ActionButton'

interface NotesSectionProps {
  value: string
  onChange: (v: string) => void
  busy: string | null
  onSave: () => void
}

export default function NotesSection({
  value,
  onChange,
  busy,
  onSave,
}: NotesSectionProps) {
  return (
    <Section title="Admin Notes">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Internal notes — not visible to the patient."
        className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)] resize-y"
      />
      <div className="mt-3 flex justify-end">
        <ActionButton
          label="Save Notes"
          tone="primary"
          disabled={busy !== null}
          loading={busy === 'Notes'}
          onClick={onSave}
        />
      </div>
    </Section>
  )
}
