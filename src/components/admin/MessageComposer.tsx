'use client'

import { useEffect, useRef, useState } from 'react'
import { MESSAGE_BODY_MAX_LENGTH } from '@/lib/messaging'

interface MessageComposerProps {
  /** Recipient display name for the placeholder. */
  recipientName: string
  /** Disabled while parent is sending or thread is unavailable. */
  disabled?: boolean
  /** Async send. Resolves true on success → composer clears + refocuses. */
  onSend: (body: string) => Promise<boolean>
  /** Inline error from the parent (rate-limit, network, validation). */
  errorMessage?: string | null
}

const MIN_ROWS = 2
const MAX_ROWS = 6
const LINE_HEIGHT_PX = 22 // matches text-sm/leading-relaxed

export default function MessageComposer({
  recipientName,
  disabled = false,
  onSend,
  errorMessage = null,
}: MessageComposerProps) {
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow up to MAX_ROWS, then scroll inside the textarea.
  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    const max = LINE_HEIGHT_PX * MAX_ROWS + 16 // +padding
    const next = Math.min(node.scrollHeight, max)
    node.style.height = `${next}px`
  }, [draft])

  const trimmed = draft.trim()
  const charCount = draft.length
  const overLimit = charCount > MESSAGE_BODY_MAX_LENGTH
  const sendDisabled =
    disabled || isSending || trimmed.length === 0 || overLimit

  const submit = async () => {
    if (sendDisabled) return
    setIsSending(true)
    try {
      const ok = await onSend(trimmed)
      if (ok) {
        setDraft('')
        textareaRef.current?.focus()
      }
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="px-4 py-3 border-t border-[#E5EAE3] bg-[#FAF9F6]">
      {errorMessage && (
        <p className="mb-2 text-xs text-red-600" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="rounded-2xl bg-white border border-[#E5EAE3] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/20 transition-colors">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) =>
            setDraft(e.target.value.slice(0, MESSAGE_BODY_MAX_LENGTH))
          }
          placeholder={`Message ${recipientName}...`}
          rows={MIN_ROWS}
          maxLength={MESSAGE_BODY_MAX_LENGTH}
          aria-label={`Message ${recipientName}`}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void submit()
            }
          }}
          className="w-full resize-none px-4 pt-3 pb-1 bg-transparent text-sm leading-relaxed text-[#2D352C] placeholder-[#2D352C]/40 focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-between px-3 pb-2 pt-1">
          <span
            className="text-[11px] text-[#2D352C]/45"
            title="Cmd/Ctrl+Enter to send"
          >
            {charCount} / {MESSAGE_BODY_MAX_LENGTH}
            <span className="hidden sm:inline">
              {' '}
              · ⌘/Ctrl+Enter to send
            </span>
          </span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sendDisabled}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold shadow-sm hover:bg-[var(--accent)] disabled:bg-[var(--accent)]/40 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            {isSending ? (
              <span>Sending...</span>
            ) : (
              <>
                <span>Send</span>
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M3.105 3.105a1 1 0 011.07-.232l13 5.5a1 1 0 010 1.854l-13 5.5A1 1 0 012.8 14.42L4.6 10.5l5.4-.5-5.4-.5L2.8 5.58a1 1 0 01.305-2.475z" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
