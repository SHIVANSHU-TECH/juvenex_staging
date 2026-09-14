'use client'

// WebhookSecretReveal — one-shot secret display for a freshly created
// PrescribeRx webhook subscription. PrescribeRx returns the signing secret
// exactly once on POST /webhooks; the user MUST copy it before closing.

interface WebhookSecretRevealProps {
  secret: string
  copied: boolean
  onCopy: () => void
  onClose: () => void
  headingId: string
}

export default function WebhookSecretReveal({
  secret,
  copied,
  onCopy,
  onClose,
  headingId,
}: WebhookSecretRevealProps) {
  return (
    <div className="px-6 py-6 space-y-4">
      <h2 id={headingId} className="text-lg font-bold text-[#2D352C]">
        Save this signing secret
      </h2>
      <div
        role="alert"
        className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm"
      >
        <p className="font-medium">This secret will not be shown again.</p>
        <p className="mt-1 text-xs">
          Set it as{' '}
          <code className="font-mono">PRESCRIBERX_WEBHOOK_SECRET</code> on the
          server. Used to verify HMAC-SHA256 signatures on every delivery.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2 bg-[#FAF9F6] border border-[#E5EAE3] rounded-lg text-xs font-mono text-[#2D352C] break-all">
          {secret}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="px-3 py-2 rounded-lg text-xs font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div
        role="status"
        aria-live="polite"
        className="text-xs text-[var(--accent-strong)] min-h-[1rem]"
      >
        {copied ? 'Secret copied to clipboard.' : ''}
      </div>
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#2D352C] hover:bg-[#1F2520] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
        >
          I have saved it — close
        </button>
      </div>
    </div>
  )
}
