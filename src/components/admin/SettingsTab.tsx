'use client'

import { useCallback, useEffect, useState } from 'react'
import WebhookSubscriptionsPanel from './WebhookSubscriptionsPanel'

// SettingsTab — super-admin platform settings + integration health.
//
// Two cards:
//   A) PrescribeRx Integration — config status, "Test connection" CTA, and
//      <WebhookSubscriptionsPanel /> with create/delete affordances.
//   B) System Health — DB / PrescribeRx / webhook receiver, fetched once on
//      mount via /api/admin/settings/health (manual Refresh too).

interface HealthEntry {
  ok: boolean
  error?: string
}

interface HealthResponse {
  supabase: HealthEntry
  prescriberx: HealthEntry
  webhook_receiver: { url: string; has_secret: boolean }
}

interface TestResult {
  ok: boolean
  name?: string
  email?: string
  sales_org_name?: string | null
  error?: string
}

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const t = window.localStorage.getItem('auth_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export default function SettingsTab() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const loadHealth = useCallback(async () => {
    setHealthLoading(true)
    setHealthError(null)
    try {
      const res = await fetch('/api/admin/settings/health', {
        headers: authHeaders(),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.success) {
        setHealthError(body.error ?? 'Failed to load health')
        return
      }
      setHealth(body.data as HealthResponse)
    } catch {
      setHealthError('Network error loading health')
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHealth()
  }, [loadHealth])

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/settings/test-prescriberx', {
        method: 'POST',
        headers: authHeaders(),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.success) {
        setTestResult({ ok: false, error: body.error ?? 'Test failed' })
        return
      }
      setTestResult({ ok: true, ...body.data })
    } catch {
      setTestResult({ ok: false, error: 'Network error' })
    } finally {
      setTesting(false)
    }
  }

  const prxConfigured = Boolean(health?.prescriberx.ok)

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 pb-20 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-[#2D352C]">Settings</h1>
        <p className="text-sm text-[#6B7567] mt-1">
          Platform integrations and system health. Super-admin only.
        </p>
      </header>

      {/* Card A: PrescribeRx Integration */}
      <section
        aria-labelledby="settings-prx-heading"
        className="bg-white border border-[#E5EAE3] rounded-2xl p-5 space-y-5"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2
              id="settings-prx-heading"
              className="text-lg font-semibold text-[#2D352C]"
            >
              PrescribeRx Integration
            </h2>
            <p className="text-xs text-[#6B7567] mt-0.5">
              Read-only view of the platform-wide credentials. Update env vars
              on the server to change.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={testing}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Definition label="Status">
            <StatusBadge ok={prxConfigured} />
          </Definition>
          <Definition label="Webhook receiver">
            <span className="text-xs font-mono break-all text-[#2D352C]">
              {health?.webhook_receiver.url ?? '—'}
            </span>
          </Definition>
        </dl>

        <div role="status" aria-live="polite" className="min-h-[1.5rem] text-sm">
          {testResult === null ? null : testResult.ok ? (
            <div className="flex items-center gap-2 text-[#2D6A4F]">
              <Dot ok />
              <span>
                Connected as{' '}
                <strong className="font-medium">
                  {testResult.name ?? 'unknown user'}
                </strong>
                {testResult.email ? ` (${testResult.email})` : ''}
                {testResult.sales_org_name
                  ? ` — ${testResult.sales_org_name}`
                  : ''}
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-[#7F1D1D]">
              <Dot ok={false} />
              <span>{testResult.error ?? 'Connection failed'}</span>
            </div>
          )}
        </div>

        <div className="border-t border-[#E5EAE3] pt-5">
          <WebhookSubscriptionsPanel />
        </div>
      </section>

      {/* Card B: System Health */}
      <section
        aria-labelledby="settings-health-heading"
        className="bg-white border border-[#E5EAE3] rounded-2xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            id="settings-health-heading"
            className="text-lg font-semibold text-[#2D352C]"
          >
            System Health
          </h2>
          <button
            type="button"
            onClick={() => void loadHealth()}
            disabled={healthLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#2D352C] bg-[#FAF9F6] border border-[#E5EAE3] hover:bg-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
          >
            {healthLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {healthError ? (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"
          >
            {healthError}
          </div>
        ) : healthLoading && !health ? (
          <ul className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="h-12 rounded-lg bg-[#F5F8F3] animate-pulse"
              />
            ))}
          </ul>
        ) : health ? (
          <ul className="divide-y divide-[#E5EAE3] border border-[#E5EAE3] rounded-xl overflow-hidden">
            <HealthRow
              label="Supabase DB"
              ok={health.supabase.ok}
              detail={
                health.supabase.ok
                  ? 'Connected'
                  : `Error: ${health.supabase.error ?? 'unknown'}`
              }
            />
            <HealthRow
              label="PrescribeRx API"
              ok={health.prescriberx.ok}
              detail={
                health.prescriberx.ok
                  ? 'Reachable'
                  : `Error: ${health.prescriberx.error ?? 'unknown'}`
              }
            />
            <HealthRow
              label="Webhook receiver"
              ok={health.webhook_receiver.has_secret}
              detail={
                <>
                  <span className="block font-mono text-[11px] break-all">
                    {health.webhook_receiver.url}
                  </span>
                  <span className="block">
                    Secret:{' '}
                    {health.webhook_receiver.has_secret
                      ? 'configured'
                      : 'missing PRESCRIBERX_WEBHOOK_SECRET'}
                  </span>
                </>
              }
            />
          </ul>
        ) : null}
      </section>
    </div>
  )
}

function Definition({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-[#8B9B83] font-medium">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function StatusBadge({ ok }: { ok: boolean }) {
  const cls = ok
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-red-50 text-red-700 border-red-200'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      <Dot ok={ok} />
      {ok ? 'Configured' : 'Not configured'}
    </span>
  )
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
    />
  )
}

function HealthRow({ label, ok, detail }: { label: string; ok: boolean; detail: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3 bg-white">
      <span className="mt-1.5"><Dot ok={ok} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#2D352C]">{label}</p>
        <div className="text-xs text-[#6B7567] mt-0.5">{detail}</div>
      </div>
    </li>
  )
}
