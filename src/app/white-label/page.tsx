'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'

const ORG_TYPES = [
  { value: 'clinic', label: 'Clinic' },
  { value: 'practice', label: 'Practice' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'wellness_center', label: 'Wellness center' },
] as const

type FormState = {
  organizationName: string
  slug: string
  type: string
  email: string
  phone: string
  website: string
  logoUrl: string
  primaryColor: string
  fulfillmentName: string
  fulfillmentPhone: string
  fulfillmentStreet: string
  fulfillmentApt: string
  fulfillmentCity: string
  fulfillmentState: string
  fulfillmentZip: string
  adminFirstName: string
  adminLastName: string
  adminEmail: string
  adminPassword: string
  confirmPassword: string
}

const initialForm: FormState = {
  organizationName: '',
  slug: '',
  type: 'clinic',
  email: '',
  phone: '',
  website: '',
  logoUrl: '',
  primaryColor: '#8FA888',
  fulfillmentName: '',
  fulfillmentPhone: '',
  fulfillmentStreet: '',
  fulfillmentApt: '',
  fulfillmentCity: '',
  fulfillmentState: '',
  fulfillmentZip: '',
  adminFirstName: '',
  adminLastName: '',
  adminEmail: '',
  adminPassword: '',
  confirmPassword: '',
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export default function WhiteLabelSignupPage() {
  const [form, setForm] = useState<FormState>(initialForm)
  const [slugDirty, setSlugDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ orgUrl: string; loginUrl: string } | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  const previewUrl = useMemo(
    () => (form.slug ? `juvenex.space/org/${form.slug}` : 'juvenex.space/org/your-clinic'),
    [form.slug]
  )

  const setField = (key: keyof FormState, value: string) => {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'organizationName' && !slugDirty) {
        next.slug = slugify(value)
      }
      return next
    })
  }

  const handleLogoFile = async (file: File | undefined) => {
    if (!file) return
    setLogoError('')

    if (!file.type.startsWith('image/')) {
      setLogoError('Please choose an image file (PNG, JPEG, WebP, GIF, or SVG).')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setLogoError('Logo must be 25MB or smaller.')
      return
    }

    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('logo', file)
      const res = await fetch('/api/white-label/logo', { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success || !json.data?.url) {
        setLogoError(json.error ?? 'Could not upload the logo. Please try again.')
        return
      }
      setField('logoUrl', json.data.url as string)
    } catch {
      setLogoError('Network error while uploading. Please try again.')
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (form.adminPassword !== form.confirmPassword) {
      setError('Admin passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/white-label/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          phone: form.phone || undefined,
          website: form.website || undefined,
          logoUrl: form.logoUrl || undefined,
          fulfillmentPhone: form.fulfillmentPhone || form.phone || undefined,
          fulfillmentApt: form.fulfillmentApt || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Could not create white-label account.')
        return
      }
      setCreated({
        orgUrl: json.data.orgUrl,
        loginUrl: json.data.loginUrl,
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (created) {
    return (
      <main id="main-content" className="min-h-screen bg-[#FAF9F6] px-5 py-8 text-[#1F2A1C]">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image src="/juvenex-logo.jpg" alt="" width={42} height={42} className="rounded-xl object-contain bg-white p-1" />
            <span className="text-lg font-bold">Juvenex</span>
          </Link>
          <section className="mt-12 rounded-2xl border border-[#DAD5C5] bg-white p-8 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-[.18em] text-[var(--accent-strong)]">White-label created</p>
            <h1 className="mt-4 text-3xl font-bold">Your account is ready.</h1>
            <p className="mt-3 text-[#5C6458]">
              Sign in with the admin email and password you just created. Your branded patient page is live too.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={created.loginUrl} className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#1F2A1C] px-6 text-sm font-bold text-white">
                Sign in
              </Link>
              <Link href={created.orgUrl} className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#CFC9B7] px-6 text-sm font-bold">
                View branded page
              </Link>
            </div>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#FAF9F6] text-[#1F2A1C]">
      <header className="border-b border-[#E0DDD0] bg-[#FAF9F6]/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3" aria-label="Juvenex home">
            <Image src="/juvenex-logo.jpg" alt="" width={42} height={42} className="rounded-xl object-contain bg-white p-1 shadow-sm" />
            <span className="text-lg font-bold">Juvenex</span>
          </Link>
          <Link href="/login" className="inline-flex min-h-10 items-center rounded-full border border-[#CFC9B7] px-4 text-sm font-semibold">
            Sign in
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[.9fr_1.1fr]">
        <section className="lg:sticky lg:top-8 lg:self-start">
          <p className="text-sm font-bold uppercase tracking-[.18em] text-[var(--accent-strong)]">White-label signup</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">
            Launch your Juvenex client account.
          </h1>
          <p className="mt-5 text-lg leading-8 text-[#5C6458]">
            Each white-label sits under the parent PrescribeRx account as a Client. Your patients get a branded page, community access, telehealth intake, and store access scoped to your client setup.
          </p>
          <div className="mt-6 rounded-2xl border border-[#DAD5C5] bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#6B7567]">Seat pricing</p>
            <p className="mt-2 text-sm leading-6 text-[#5C6458]">
              Approved white-label package pricing includes the first 30 seats.
              Additional seats are billed at $10 per person after those first
              30 seats.
            </p>
          </div>
          <div className="mt-8 rounded-2xl border border-[#DAD5C5] bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#6B7567]">Preview URL</p>
            <p className="mt-2 break-all font-mono text-sm font-semibold text-[#1F2A1C]">{previewUrl}</p>
          </div>
        </section>

        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-[#DAD5C5] bg-white p-5 shadow-sm sm:p-7">
          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <SectionTitle title="Business" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Organization name" value={form.organizationName} onChange={(v) => setField('organizationName', v)} required />
            <TextInput
              label="White-label URL slug"
              value={form.slug}
              onChange={(v) => {
                setSlugDirty(true)
                setField('slug', slugify(v))
              }}
              required
            />
            <SelectInput label="Type" value={form.type} onChange={(v) => setField('type', v)} />
            <TextInput label="Business email" type="email" value={form.email} onChange={(v) => setField('email', v)} required />
            <TextInput label="Business phone" value={form.phone} onChange={(v) => setField('phone', v)} />
            <TextInput label="Website" type="url" value={form.website} onChange={(v) => setField('website', v)} />
            <TextInput label="Brand color" type="color" value={form.primaryColor} onChange={(v) => setField('primaryColor', v)} required />
          </div>

          <div className="rounded-xl border border-[#DAD5C5] bg-[#FAF9F6] p-4">
            <span className="text-xs font-bold uppercase tracking-[.12em] text-[#6B7567]">Logo</span>
            <div className="mt-3 flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#DAD5C5] bg-white">
                {form.logoUrl ? (
                  <Image
                    src={form.logoUrl}
                    alt="Logo preview"
                    width={64}
                    height={64}
                    unoptimized
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[#A7A290]">Logo</span>
                )}
              </div>
              <div className="flex-1">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={(e) => handleLogoFile(e.target.files?.[0])}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                    className="inline-flex min-h-10 items-center rounded-full border border-[var(--accent-strong)] px-4 text-sm font-bold text-[#3F5A36] transition hover:bg-[var(--accent-strong)]/10 disabled:opacity-60"
                  >
                    {logoUploading ? 'Uploading…' : form.logoUrl ? 'Replace logo' : 'Upload logo'}
                  </button>
                  {form.logoUrl && !logoUploading && (
                    <button
                      type="button"
                      onClick={() => setField('logoUrl', '')}
                      className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-[#6B7567] underline-offset-2 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-[#6B7567]">PNG, JPEG, WebP, GIF, or SVG · up to 25MB. Optional.</p>
                {logoError && <p className="mt-1 text-xs font-semibold text-red-600">{logoError}</p>}
              </div>
            </div>
          </div>

          <SectionTitle title="Fulfillment address" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Recipient name" value={form.fulfillmentName} onChange={(v) => setField('fulfillmentName', v)} required />
            <TextInput label="Recipient phone" value={form.fulfillmentPhone} onChange={(v) => setField('fulfillmentPhone', v)} />
            <TextInput label="Street" value={form.fulfillmentStreet} onChange={(v) => setField('fulfillmentStreet', v)} required wide />
            <TextInput label="Suite / unit" value={form.fulfillmentApt} onChange={(v) => setField('fulfillmentApt', v)} />
            <TextInput label="City" value={form.fulfillmentCity} onChange={(v) => setField('fulfillmentCity', v)} required />
            <TextInput label="State" value={form.fulfillmentState} onChange={(v) => setField('fulfillmentState', v)} required />
            <TextInput label="ZIP" value={form.fulfillmentZip} onChange={(v) => setField('fulfillmentZip', v)} required />
          </div>

          <SectionTitle title="Admin account" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="First name" value={form.adminFirstName} onChange={(v) => setField('adminFirstName', v)} required />
            <TextInput label="Last name" value={form.adminLastName} onChange={(v) => setField('adminLastName', v)} required />
            <TextInput label="Admin email" type="email" value={form.adminEmail} onChange={(v) => setField('adminEmail', v)} required wide />
            <TextInput label="Password" type="password" value={form.adminPassword} onChange={(v) => setField('adminPassword', v)} required />
            <TextInput label="Confirm password" type="password" value={form.confirmPassword} onChange={(v) => setField('confirmPassword', v)} required />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#1F2A1C] px-6 text-sm font-bold text-white transition hover:bg-[#2D3D29] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Create white-label account'}
          </button>
        </form>
      </div>
    </main>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="pt-2 text-sm font-bold uppercase tracking-[.16em] text-[#6B7567]">{title}</h2>
}

function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  wide = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
  wide?: boolean
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-xs font-bold uppercase tracking-[.12em] text-[#6B7567]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        minLength={type === 'password' ? 12 : undefined}
        className="mt-2 min-h-11 w-full rounded-xl border border-[#DAD5C5] bg-[#FAF9F6] px-3 text-sm text-[#1F2A1C] outline-none transition focus:border-[var(--accent-strong)] focus:bg-white focus:ring-2 focus:ring-[var(--accent)]/25"
      />
    </label>
  )
}

function SelectInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[.12em] text-[#6B7567]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-xl border border-[#DAD5C5] bg-[#FAF9F6] px-3 text-sm font-semibold text-[#1F2A1C] outline-none transition focus:border-[var(--accent-strong)] focus:bg-white focus:ring-2 focus:ring-[var(--accent)]/25"
      >
        {ORG_TYPES.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
    </label>
  )
}
