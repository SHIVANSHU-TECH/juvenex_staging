'use client';

import { useEffect, useRef, useState } from 'react';
import type { Organization } from '@/lib/api';

export interface EditPrescribeRxIntegrationModalProps {
  org: Organization;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (newClientId: string | null) => void;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface IntegrationEnvelope {
  success: boolean;
  error?: string;
  data?: {
    prescriberx_client_id: string | null;
    prescriberx_client_id_set_at: string | null;
  };
}

const TITLE_ID = 'edit-prx-integration-title';
const HELP_ID = 'prx-client-id-help';
const ERROR_ID = 'prx-client-id-error';

/**
 * Per-tenant PrescribeRx Client ID editor. Maps a Juvenex organization to
 * the PrescribeRx Client entity that owns its scoped resources. Empty input
 * clears the mapping (server stores null → fall back to platform default).
 */
export default function EditPrescribeRxIntegrationModal({
  org,
  isOpen,
  onClose,
  onSaved,
}: EditPrescribeRxIntegrationModalProps) {
  const [value, setValue] = useState<string>(org.prescriberx_client_id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValue(org.prescriberx_client_id ?? '');
    setError(null);
    setSubmitting(false);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [isOpen, org]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const trimmed = value.trim();
  const hasExistingMapping = (org.prescriberx_client_id ?? '').length > 0;

  const submit = async (clear = false) => {
    setError(null);
    let nextValue: string | null;
    if (clear) {
      nextValue = null;
    } else if (trimmed.length === 0) {
      nextValue = null;
    } else if (!UUID_REGEX.test(trimmed)) {
      setError(
        'Must be a 36-character UUID (e.g. 019xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)'
      );
      return;
    } else {
      nextValue = trimmed;
    }

    setSubmitting(true);
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('auth_token')
          : null;
      const res = await fetch(
        `/api/admin/organizations/${org.id}/integration`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ prescriberx_client_id: nextValue }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as IntegrationEnvelope;
      if (!res.ok || !body.success || !body.data) {
        setError(body.error ?? 'Failed to save integration');
        return;
      }
      onSaved(body.data.prescriberx_client_id);
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = `w-full px-3 py-2 bg-white border rounded-lg text-sm text-[#2D352C] font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 ${
    error ? 'border-red-400' : 'border-[#E5EAE3]'
  }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        <header className="flex items-center justify-between px-6 py-5 border-b border-[#E5EAE3]">
          <div>
            <h2 id={TITLE_ID} className="text-lg font-bold text-[#2D352C]">
              PrescribeRx integration
            </h2>
            <p className="text-xs text-[#2D352C]/60 mt-0.5">
              {org.name}
              <span className="text-[#2D352C]/30"> · </span>
              <span className="font-mono">/{org.slug}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-[#2D352C]/60 hover:bg-[#FAF9F6] hover:text-[#2D352C] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
          >
            <CloseIcon />
          </button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
        >
          <label className="block space-y-1">
            <span className="block text-xs font-medium text-[#2D352C]/70">
              PrescribeRx Client ID
            </span>
            <input
              ref={inputRef}
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              maxLength={36}
              className={inputClass}
              placeholder="019xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              aria-invalid={error !== null}
              aria-describedby={error ? ERROR_ID : HELP_ID}
            />
            {error ? (
              <span
                id={ERROR_ID}
                role="alert"
                className="block text-[11px] text-red-600"
              >
                {error}
              </span>
            ) : (
              <span
                id={HELP_ID}
                className="block text-[11px] text-[#2D352C]/40"
              >
                Provided by PrescribeRx admin when your organization is
                provisioned. Leave blank to use the platform default.
              </span>
            )}
          </label>
        </form>

        <footer className="flex items-center justify-between gap-2 px-6 py-4 border-t border-[#E5EAE3] bg-[#FAF9F6]/40">
          <div>
            {hasExistingMapping && (
              <button
                type="button"
                onClick={() => void submit(true)}
                disabled={submitting}
                className="px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
              >
                Clear mapping
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm text-[#2D352C]/70 hover:bg-white hover:text-[#2D352C] disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-60 inline-flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
            >
              {submitting && <Spinner />}
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="w-5 h-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 00-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
