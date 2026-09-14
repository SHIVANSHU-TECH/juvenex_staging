'use client'

// TODO: extract a shared admin-shared/StatTile component once the super_admin
// admin surface stabilizes; the edit form remains org-specific.

import { useRef, useState } from 'react'
import type {
  ApiEnvelope,
  OrgSummary,
  OrgStats,
  OrgUpdateData,
} from '@/lib/api-types'

export type { OrgSummary, OrgStats }

interface OverviewTabProps {
  slug: string
  org: OrgSummary
  stats: OrgStats
  accentColor: string
  onOrgUpdated: (org: OrgSummary) => void
}

interface EditableFields {
  name: string
  logo_url: string
  primary_color: string
  phone: string
  email: string
  website: string
}

function toEditable(org: OrgSummary): EditableFields {
  return {
    name: org.name ?? '',
    logo_url: org.logo_url ?? '',
    primary_color: org.primary_color ?? '',
    phone: org.phone ?? '',
    email: org.email ?? '',
    website: org.website ?? '',
  }
}

export default function OverviewTab({
  slug,
  org,
  stats,
  accentColor,
  onOrgUpdated,
}: OverviewTabProps) {
  const [draft, setDraft] = useState<EditableFields>(() => toEditable(org))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<
    { kind: 'success' | 'error'; text: string } | null
  >(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const logoInputRef = useRef<HTMLInputElement | null>(null)

  const handleLogoUpload = async (file: File | undefined) => {
    if (!file) return
    setMessage(null)
    if (!file.type.startsWith('image/')) {
      setMessage({ kind: 'error', text: 'Please choose an image file (PNG, JPG, WebP, or SVG).' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ kind: 'error', text: 'Logo must be 5MB or smaller.' })
      return
    }
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('logo', file)
      const res = await fetch('/api/white-label/logo', { method: 'POST', body: fd })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        data?: { url?: string }
      }
      if (!res.ok || !json.success || !json.data?.url) {
        setMessage({ kind: 'error', text: json.error ?? 'Could not upload the logo. Please try again.' })
        return
      }
      setDraft((d) => ({ ...d, logo_url: json.data!.url as string }))
      setMessage({ kind: 'success', text: 'Logo uploaded — click Save to apply.' })
    } catch {
      setMessage({ kind: 'error', text: 'Network error while uploading. Please try again.' })
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const payload: Record<string, string | null> = {}
      if (draft.name !== (org.name ?? '')) payload.name = draft.name
      if (draft.logo_url !== (org.logo_url ?? ''))
        payload.logo_url = draft.logo_url || null
      if (draft.primary_color !== (org.primary_color ?? ''))
        payload.primary_color = draft.primary_color || null
      if (draft.phone !== (org.phone ?? '')) payload.phone = draft.phone || null
      if (draft.email !== (org.email ?? '')) payload.email = draft.email || null
      if (draft.website !== (org.website ?? ''))
        payload.website = draft.website || null

      if (Object.keys(payload).length === 0) {
        setMessage({ kind: 'success', text: 'No changes to save.' })
        return
      }

      const res = await fetch(`/api/org/${encodeURIComponent(slug)}/admin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as ApiEnvelope<OrgUpdateData>
      if (!res.ok || !json.success || !json.data) {
        setMessage({
          kind: 'error',
          text: json.error ?? 'Failed to update organization',
        })
        return
      }
      const updated = json.data.organization
      onOrgUpdated(updated)
      setDraft(toEditable(updated))
      setMessage({ kind: 'success', text: 'Organization updated.' })
    } catch (err) {
      console.error('OverviewTab save failed', err)
      setMessage({ kind: 'error', text: 'Network error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Total Members" value={stats.total_members} accent={accentColor} />
        <StatTile
          label="Orders this Month"
          value={stats.orders_this_month}
          accent={accentColor}
        />
        <StatTile
          label="Pending Reports"
          value={stats.pending_reports}
          accent={accentColor}
        />
      </div>

      <form
        onSubmit={handleSave}
        className="bg-[#FAF9F6]/80 border border-[#E5EAE3] rounded-3xl p-6 space-y-4"
      >
        <div>
          <h2 className="text-lg font-semibold text-[#2D352C]">Organization Profile</h2>
          <p className="text-sm text-[#2D352C]/60">
            These fields power the public /org/{slug} landing page and the app
            whitelabel branding.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Name"
            value={draft.name}
            onChange={(v) => setDraft({ ...draft, name: v })}
            required
          />
          <Field
            label="Primary color (hex)"
            placeholder="#8FA888"
            value={draft.primary_color}
            onChange={(v) => setDraft({ ...draft, primary_color: v })}
          />
          <Field
            label="Logo URL"
            placeholder="https://…"
            value={draft.logo_url}
            onChange={(v) => setDraft({ ...draft, logo_url: v })}
          />
          <div className="sm:col-span-2">
            <span className="block text-sm font-medium text-[#2D352C] mb-1">
              Upload logo
            </span>
            <div className="flex items-center gap-3">
              {draft.logo_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={draft.logo_url}
                  alt="Logo preview"
                  className="h-12 w-12 rounded-lg object-contain border border-[#E5EAE3] bg-white p-1"
                />
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                className="hidden"
                onChange={(e) => handleLogoUpload(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
                className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
              >
                {logoUploading ? 'Uploading…' : 'Upload logo'}
              </button>
            </div>
            <p className="mt-1 text-xs text-[#6B7567]">
              PNG, JPG, WebP, or SVG up to 5MB — or paste a URL above. Click Save to apply.
            </p>
          </div>
          <Field
            label="Website"
            placeholder="https://…"
            value={draft.website}
            onChange={(v) => setDraft({ ...draft, website: v })}
          />
          <Field
            label="Contact email"
            type="email"
            value={draft.email}
            onChange={(v) => setDraft({ ...draft, email: v })}
          />
          <Field
            label="Contact phone"
            type="tel"
            value={draft.phone}
            onChange={(v) => setDraft({ ...draft, phone: v })}
          />
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: accentColor }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {message && (
            <span
              className={`text-sm ${
                message.kind === 'success'
                  ? 'text-emerald-700'
                  : 'text-red-600'
              }`}
            >
              {message.text}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="bg-[#FAF9F6]/80 border border-[#E5EAE3] rounded-2xl p-6">
      <p className="text-[#2D352C]/40 text-sm">{label}</p>
      <p className="text-3xl font-bold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  )
}

interface FieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: FieldProps) {
  return (
    <label className="block">
      <span className="block text-sm text-[#2D352C]/60 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-4 py-3 bg-white border border-[#E5EAE3] rounded-xl text-[#2D352C]"
      />
    </label>
  )
}
