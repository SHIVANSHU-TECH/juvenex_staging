'use client';

import { useEffect, useRef, useState } from 'react';
import {
  organizationApi,
  type Organization,
  type OrgBrandingPayload,
} from '@/lib/api';
import ColorPicker, { isValidHex } from './ColorPicker';

export interface EditBrandingModalProps {
  open: boolean;
  org: Organization | null;
  onClose: () => void;
  onSaved: (updated: Organization) => void;
}

interface FormState {
  brand_name: string;
  brand_primary_color: string;
  brand_logo_url: string;
}

const DEFAULT_PRIMARY = '#5C7A4F';

const ALLOWED_LOGO_HOST_HINT =
  'Logo must be hosted on *.supabase.co or *.juvenex.space (https only).';

function buildInitialForm(org: Organization | null): FormState {
  return {
    brand_name: org?.brand_name ?? '',
    brand_primary_color: org?.brand_primary_color ?? DEFAULT_PRIMARY,
    brand_logo_url: org?.brand_logo_url ?? '',
  };
}

/**
 * Phase 2 admin form for tenant storefront branding overrides.
 *
 * Persists to PUT /api/admin/organizations/[id]/branding via
 * organizationApi.updateBranding. Empty strings on submit are translated to
 * `null` so the server clears the column rather than storing an empty value.
 */
export default function EditBrandingModal({
  open,
  org,
  onClose,
  onSaved,
}: EditBrandingModalProps) {
  const [form, setForm] = useState<FormState>(buildInitialForm(org));
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState | 'submit', string>>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Reset when the dialog opens for a (possibly different) org.
  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(org));
      setErrors({});
      setSubmitting(false);
      const t = setTimeout(() => firstFieldRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, org]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Basic focus trap — same shape as AddOrgModal.
  useEffect(() => {
    if (!open) return;
    const handleTab = (e: KeyboardEvent) => {
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
    window.addEventListener('keydown', handleTab);
    return () => window.removeEventListener('keydown', handleTab);
  }, [open]);

  if (!open || !org) return null;

  const updateField = <K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.brand_name.trim().length > 80) {
      next.brand_name = 'Must be 80 characters or fewer';
    }
    if (
      form.brand_primary_color.trim().length > 0 &&
      !isValidHex(form.brand_primary_color.trim())
    ) {
      next.brand_primary_color = 'Must be a 7-character hex like #5C7A4F';
    }
    const trimmedLogo = form.brand_logo_url.trim();
    if (trimmedLogo.length > 0) {
      if (trimmedLogo.length > 500) {
        next.brand_logo_url = 'Must be 500 characters or fewer';
      } else if (!/^https:\/\//i.test(trimmedLogo)) {
        next.brand_logo_url = 'Must be an https URL';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /**
   * Translate the form into the API payload.
   *
   * Empty strings → `null` (clear the column on the server). A populated value
   * is sent as-is. We never send `undefined` because the API treats absent
   * fields as "leave unchanged" — the modal always submits all three fields.
   */
  const buildPayload = (): OrgBrandingPayload => {
    const trimmedName = form.brand_name.trim();
    const trimmedColor = form.brand_primary_color.trim();
    const trimmedLogo = form.brand_logo_url.trim();
    return {
      brand_name: trimmedName.length > 0 ? trimmedName : null,
      brand_primary_color: trimmedColor.length > 0 ? trimmedColor : null,
      brand_logo_url: trimmedLogo.length > 0 ? trimmedLogo : null,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setErrors((prev) => ({ ...prev, submit: undefined }));
    try {
      const res = await organizationApi.updateBranding(org.id, buildPayload());
      const envelope = res.data;
      if (res.error || !envelope?.success || !envelope.data) {
        setErrors({
          submit: res.error ?? envelope?.error ?? 'Failed to save branding',
        });
        return;
      }
      const updatedRow = envelope.data.organization;
      // Merge the new branding fields onto the org card model so the parent
      // tab re-renders without a refetch round-trip.
      const merged: Organization = {
        ...org,
        brand_name: updatedRow.brand_name,
        brand_primary_color: updatedRow.brand_primary_color,
        brand_logo_url: updatedRow.brand_logo_url,
      };
      onSaved(merged);
      onClose();
    } catch (err) {
      console.error('EditBrandingModal save failed', err);
      setErrors({ submit: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-branding-title"
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        <header className="flex items-center justify-between px-6 py-5 border-b border-[#E5EAE3]">
          <div>
            <h2
              id="edit-branding-title"
              className="text-lg font-bold text-[#2D352C]"
            >
              Edit branding
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
            className="p-2 rounded-lg text-[#2D352C]/60 hover:bg-[#FAF9F6] hover:text-[#2D352C]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
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
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
        >
          <Field
            label="Brand name"
            error={errors.brand_name}
            hint="Replaces 'Juvenex' on this org's storefront. Leave blank to use the org's display name."
          >
            <input
              ref={firstFieldRef}
              type="text"
              value={form.brand_name}
              onChange={(e) => updateField('brand_name', e.target.value)}
              maxLength={80}
              className={inputClass(!!errors.brand_name)}
              placeholder="PrescribeRx"
            />
          </Field>

          <Field
            label="Primary color"
            error={errors.brand_primary_color}
            hint={`Used for buttons and accents. Default: ${DEFAULT_PRIMARY}`}
          >
            <ColorPicker
              value={form.brand_primary_color}
              onChange={(hex) => updateField('brand_primary_color', hex)}
            />
          </Field>

          <Field
            label="Logo URL"
            error={errors.brand_logo_url}
            hint={ALLOWED_LOGO_HOST_HINT}
          >
            <input
              type="url"
              value={form.brand_logo_url}
              onChange={(e) => updateField('brand_logo_url', e.target.value)}
              maxLength={500}
              className={inputClass(!!errors.brand_logo_url)}
              placeholder="https://sbjcztlplbzcsyvljouf.supabase.co/storage/v1/object/public/brand/logo.png"
            />
          </Field>

          {errors.submit && (
            <p
              className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              role="alert"
            >
              {errors.submit}
            </p>
          )}
        </form>

        <footer className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#E5EAE3] bg-[#FAF9F6]/40">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-sm text-[#2D352C]/70 hover:bg-white hover:text-[#2D352C] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-60 inline-flex items-center gap-2"
          >
            {submitting && (
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
            )}
            {submitting ? 'Saving…' : 'Save branding'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return `w-full px-3 py-2 bg-white border rounded-lg text-sm text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 ${
    hasError ? 'border-red-400' : 'border-[#E5EAE3]'
  }`;
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-[#2D352C]/70">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="block text-[11px] text-[#2D352C]/40">{hint}</span>
      )}
      {error && <span className="block text-[11px] text-red-600">{error}</span>}
    </label>
  );
}
