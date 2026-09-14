'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatRelative } from '@/lib/format'
import DataTable, { type Column } from './DataTable'
import StatusPill from './StatusPill'

interface AdminUserRow {
  id: string
  email: string
  full_name: string | null
  role: string
  organization_id: string | null
  organization_name: string | null
  created_at: string
  subscription_plan: string | null
  subscription_status: string | null
  last_message_at: string | null
}

interface UsersSummary {
  totalUsers: number
  patients: number
  orgAdmins: number
  superAdmins: number
}

interface UsersResponse {
  success: boolean
  error?: string
  data?: {
    users: AdminUserRow[]
    hasMore: boolean
    total: number
    summary: UsersSummary
  }
}

function prettyRole(role: string): string {
  return role.replace(/_/g, ' ')
}

function prettyPlan(plan: string | null): string {
  if (!plan) return 'Free'
  return plan
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#E5EAE3] bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7568]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-[#2D352C]">
        {value}
      </p>
    </div>
  )
}

export default function UsersTab() {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [summary, setSummary] = useState<UsersSummary>({
    totalUsers: 0,
    patients: 0,
    orgAdmins: 0,
    superAdmins: 0,
  })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(handle)
  }, [search])

  useEffect(() => {
    let cancelled = false
    async function loadUsers() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          limit: '100',
          includeSelf: 'true',
        })
        if (debouncedSearch) params.set('search', debouncedSearch)
        const res = await fetch(`/api/admin/users?${params.toString()}`)
        const json = (await res.json()) as UsersResponse
        if (cancelled) return
        if (!res.ok || !json.success || !json.data) {
          setUsers([])
          setError(json.error ?? 'Failed to load users')
          return
        }
        setUsers(json.data.users)
        setSummary(json.data.summary)
      } catch {
        if (!cancelled) {
          setUsers([])
          setError('Network error loading users')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadUsers()
    return () => {
      cancelled = true
    }
  }, [debouncedSearch])

  const columns = useMemo<Column<AdminUserRow>[]>(
    () => [
      {
        key: 'user',
        header: 'User',
        render: (row) => (
          <div className="min-w-0">
            <p className="font-semibold text-[#2D352C]">
              {row.full_name?.trim() || row.email}
            </p>
            <p className="text-xs text-[#6B7568]">{row.email}</p>
          </div>
        ),
      },
      {
        key: 'role',
        header: 'Role',
        render: (row) => (
          <StatusPill variant={row.role === 'patient' ? 'pending' : 'paid'}>
            {prettyRole(row.role)}
          </StatusPill>
        ),
      },
      {
        key: 'organization',
        header: 'Organization',
        render: (row) => row.organization_name ?? 'Juvenex direct',
      },
      {
        key: 'plan',
        header: 'Plan',
        render: (row) => (
          <div>
            <p className="font-medium">{prettyPlan(row.subscription_plan)}</p>
            <p className="text-xs text-[#6B7568]">
              {row.subscription_status ?? 'No active subscription'}
            </p>
          </div>
        ),
      },
      {
        key: 'created',
        header: 'Signed up',
        render: (row) => (
          <div>
            <p>{new Date(row.created_at).toLocaleDateString()}</p>
            <p className="text-xs text-[#6B7568]">{formatRelative(row.created_at)}</p>
          </div>
        ),
      },
    ],
    []
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#2D352C]">Users</h1>
          <p className="mt-1 text-sm text-[#6B7567]">
            Signups, roles, organizations, and membership status.
          </p>
        </div>
        <label className="block w-full max-w-sm">
          <span className="sr-only">Search users</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full rounded-xl border border-[#E5EAE3] bg-white px-4 py-2.5 text-sm text-[#2D352C] shadow-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total signups" value={summary.totalUsers} />
        <StatCard label="Patients" value={summary.patients} />
        <StatCard label="Org admins" value={summary.orgAdmins} />
        <StatCard label="Super admins" value={summary.superAdmins} />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[#E5EAE3] bg-white shadow-sm">
        <DataTable
          data={users}
          columns={columns}
          rowKey={(row) => row.id}
          loading={loading}
          emptyMessage="No users found."
        />
      </section>
    </div>
  )
}
