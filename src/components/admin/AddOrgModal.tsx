'use client';

import { useEffect, useRef, useState } from 'react';
import type { Organization } from '@/lib/api';
import type { ApiEnvelope } from '@/lib/api-types';
import ColorPicker, { isValidHex } from './ColorPicker';

/**
 * Shape returned by `POST /api/organizations` after the v2 unified-create
 * flow lands the organization row plus the initial org_admin user in one
 * request. `temporaryPassword` is present only when the API auto-generated
 * the credential — once shown, it cannot be retrieved again.
 */
export interface CreateOrgResponseData {
  organization: Organization;
  admin: {
    id: string;
    email: string;
    temporaryPassword?: string;
  };
}

export interface AddOrgModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (org: Organization, admin: CreateOrgResponseData['admin']) => void;
}

const ORG_TYPES = [
  { value: 'clinic', label: 'Clinic' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'wellness_center', label: 'Wellness Center' },
  { value: 'enterprise', label: 'Enterprise' },
] as const;

type OrgType = (typeof ORG_TYPES)[number]['value'];

interface FormState {
  name: string;
  slug: string;
  type: OrgType;
  email: string;
  phone: string;
  primary_color: string;
  logo_url: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
}

const INITIAL: FormState = {
  name: '',
  slug: '',
  type: 'clinic',
  email: '',
  phone: '',
  primary_color: '#8FA888',
  logo_url: '',
  adminEmail: '',
  adminFirstName: '',
  adminLastName: '',
  adminPassword: '',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function AddOrgModal({ open, onClose, onCreated }: AddOrgModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [slugDirty, setSlugDirty] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'submit', string>>>({});
  const [submitting, setSubmitting] = useState(false);
  // Holds the post-create success payload when the API returned a
  // one-time auto-generated password the super_admin needs to copy.
  const [issuedCredentials, setIssuedCredentials] = useState<{
    organization: Organization;
    admin: CreateOrgResponseData['admin'];
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setForm(INITIAL);
      setSlugDirty(false);
      setErrors({});
      setSubmitting(false);
      setIssuedCredentials(null);
      setCopied(false);
      setTimeout(() => firstFieldRef.current?.focus(), 30);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Focus trap (basic): cycle Tab/Shift+Tab among focusable elements inside dialog
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

  if (!open) return null;

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-derive slug from name unless user manually edited slug.
      if (key === 'name' && !slugDirty) {
        next.slug = slugify(value as string);
      }
      return next;
    });
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.slug.trim()) next.slug = 'Slug is required';
    else if (!SLUG_REGEX.test(form.slug)) next.slug = 'Lowercase letters, numbers, and hyphens only';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Invalid email';
    if (form.primary_color && !isValidHex(form.primary_color)) next.primary_color = 'Invalid hex color';
    if (form.logo_url && !/^https?:\/\//i.test(form.logo_url)) next.logo_url = 'Must be a valid URL';
    if (!form.adminEmail.trim()) {
      next.adminEmail = 'Admin email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) {
      next.adminEmail = 'Invalid email';
    }
    // Only validate length when a password was supplied — empty means
    // "let the server auto-generate one".
    if (form.adminPassword && form.adminPassword.length < 12) {
      next.adminPassword = 'Password must be at least 12 characters';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // NOTE: Address is intentionally omitted — the POST /api/organizations
  // schema does not currently accept an `address` field. TODO: extend the
  // API schema to support address before re-introducing it here.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setErrors((prev) => ({ ...prev, submit: undefined }));
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim(),
          type: form.type,
          email: form.email || undefined,
          phone: form.phone || undefined,
          primary_color: form.primary_color || undefined,
          logo_url: form.logo_url || undefined,
          adminEmail: form.adminEmail.trim(),
          adminFirstName: form.adminFirstName.trim() || undefined,
          adminLastName: form.adminLastName.trim() || undefined,
          adminPassword: form.adminPassword || undefined,
        }),
      });
      const json = (await res.json()) as ApiEnvelope<CreateOrgResponseData>;
      if (!res.ok || !json.success || !json.data) {
        setErrors({ submit: json.error ?? 'Failed to create organization' });
        return;
      }

      const { organization, admin } = json.data;

      // If the server auto-generated a password we hold the user inside the
      // modal on a success screen so they can copy it before dismissing.
      // Otherwise close immediately — there is nothing one-time to surface.
      if (admin.temporaryPassword) {
        setIssuedCredentials({ organization, admin });
        // We still notify the parent so the list refreshes behind the modal.
        onCreated(organization, admin);
      } else {
        onCreated(organization, admin);
        onClose();
      }
    } catch (err) {
      console.error('AddOrgModal create failed', err);
      setErrors({ submit: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!issuedCredentials?.admin.temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(issuedCredentials.admin.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed', err);
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
      aria-labelledby="add-org-title"
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        <header className="flex items-center justify-between px-6 py-5 border-b border-[#E5EAE3]">
          <h2 id="add-org-title" className="text-lg font-bold text-[#2D352C]">
            {issuedCredentials ? 'Organization Created' : 'Create New Organization'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-[#2D352C]/60 hover:bg-[#FAF9F6] hover:text-[#2D352C]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {issuedCredentials ? (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold mb-1">Share this with the org admin.</p>
              <p>
                You will not be able to see this password again. Copy it now and
                send it through a secure channel.
              </p>
            </div>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-[#2D352C]/50">Organization</dt>
                <dd className="font-semibold text-[#2D352C]">
                  {issuedCredentials.organization.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[#2D352C]/50">Admin email</dt>
                <dd className="font-mono text-[#2D352C]">{issuedCredentials.admin.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[#2D352C]/50">Temporary password</dt>
                <dd className="flex items-center gap-2 mt-1">
                  <code
                    className="flex-1 font-mono text-sm bg-[#FAF9F6] border border-[#E5EAE3] rounded-lg px-3 py-2 break-all"
                    aria-label="Temporary password"
                  >
                    {issuedCredentials.admin.temporaryPassword}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    className="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent)] transition-colors"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </dd>
              </div>
            </dl>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[#2D352C] hover:bg-[#1f251e] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <FieldGroup title="Basic info">
            <Field label="Organization name" required error={errors.name}>
              <input
                ref={firstFieldRef}
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className={inputClass(!!errors.name)}
                placeholder="Sunrise Wellness Clinic"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Slug" required error={errors.slug} hint="URL-friendly identifier">
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugDirty(true);
                    updateField('slug', e.target.value);
                  }}
                  className={inputClass(!!errors.slug)}
                  placeholder="sunrise-wellness"
                  required
                />
              </Field>
              <Field label="Type" required>
                <select
                  value={form.type}
                  onChange={(e) => updateField('type', e.target.value as OrgType)}
                  className={inputClass(false)}
                >
                  {ORG_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Contact">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email" error={errors.email}>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className={inputClass(!!errors.email)}
                  placeholder="hello@clinic.com"
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  className={inputClass(false)}
                  placeholder="+1 555-123-4567"
                />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Branding">
            <Field label="Primary color" error={errors.primary_color}>
              <ColorPicker
                value={form.primary_color}
                onChange={(hex) => updateField('primary_color', hex)}
              />
            </Field>
            <Field label="Logo URL" error={errors.logo_url} hint="Paste a URL or leave blank for default">
              <input
                type="url"
                value={form.logo_url}
                onChange={(e) => updateField('logo_url', e.target.value)}
                className={inputClass(!!errors.logo_url)}
                placeholder="https://example.com/logo.png"
              />
            </Field>
          </FieldGroup>

          <FieldGroup title="Initial admin user">
            <Field label="Admin email" required error={errors.adminEmail} hint="This person can log in immediately">
              <input
                type="email"
                value={form.adminEmail}
                onChange={(e) => updateField('adminEmail', e.target.value)}
                className={inputClass(!!errors.adminEmail)}
                placeholder="owner@clinic.com"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name" error={errors.adminFirstName}>
                <input
                  type="text"
                  value={form.adminFirstName}
                  onChange={(e) => updateField('adminFirstName', e.target.value)}
                  className={inputClass(!!errors.adminFirstName)}
                  placeholder="Jane"
                />
              </Field>
              <Field label="Last name" error={errors.adminLastName}>
                <input
                  type="text"
                  value={form.adminLastName}
                  onChange={(e) => updateField('adminLastName', e.target.value)}
                  className={inputClass(!!errors.adminLastName)}
                  placeholder="Doe"
                />
              </Field>
            </div>
            <Field
              label="Initial password"
              error={errors.adminPassword}
              hint="Leave blank to auto-generate a secure 16-character password"
            >
              <input
                type="text"
                value={form.adminPassword}
                onChange={(e) => updateField('adminPassword', e.target.value)}
                className={inputClass(!!errors.adminPassword)}
                placeholder="Auto-generated when blank"
                autoComplete="new-password"
                spellCheck={false}
              />
            </Field>
          </FieldGroup>

          {errors.submit && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
              {errors.submit}
            </p>
          )}
        </form>
        )}

        {!issuedCredentials && (
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
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {submitting ? 'Creating…' : 'Create Organization'}
          </button>
        </footer>
        )}
      </div>
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return `w-full px-3 py-2 bg-white border rounded-lg text-sm text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 ${
    hasError ? 'border-red-400' : 'border-[#E5EAE3]'
  }`;
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-[#2D352C]/70">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="block text-[11px] text-[#2D352C]/40">{hint}</span>
      )}
      {error && (
        <span className="block text-[11px] text-red-600">{error}</span>
      )}
    </label>
  );
}
