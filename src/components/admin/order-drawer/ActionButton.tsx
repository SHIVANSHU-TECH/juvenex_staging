interface ActionButtonProps {
  label: string
  tone: 'primary' | 'danger'
  disabled?: boolean
  loading?: boolean
  onClick: () => void
  title?: string
}

export default function ActionButton({
  label,
  tone,
  disabled,
  loading,
  onClick,
  title,
}: ActionButtonProps) {
  const base =
    'px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2'
  const toneClass =
    tone === 'primary'
      ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent)] focus-visible:ring-[var(--accent-strong)]/40'
      : 'bg-white border border-red-200 text-red-700 hover:bg-red-50 focus-visible:ring-red-300/60'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${toneClass}`}
    >
      {loading ? `${label}...` : label}
    </button>
  )
}
