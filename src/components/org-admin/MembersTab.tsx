'use client'

// TODO: extract a shared admin-shared/MembersTable that accepts an
// `orgId?: string` scope prop so super_admin and org_admin surfaces can
// reuse it. Until then this file is org-scoped.

import { useCallback, useEffect, useState } from 'react'
import type { ApiEnvelope, OrgMember, OrgMembersData } from '@/lib/api-types'

type Member = OrgMember

interface MembersTabProps {
  slug: string
  currentUserId: string
  accentColor: string
}

type Action = 'promote' | 'demote' | 'remove'

export default function MembersTab({
  slug,
  currentUserId,
  accentColor,
}: MembersTabProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('limit', '50')
      const res = await fetch(
        `/api/org/${encodeURIComponent(slug)}/admin/members?${params}`
      )
      const json = (await res.json()) as ApiEnvelope<OrgMembersData>
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'Failed to load members')
        return
      }
      setMembers(json.data.members)
    } catch (err) {
      console.error('MembersTab load failed', err)
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [slug, search])

  useEffect(() => {
    load()
  }, [load])

  const runAction = async (member: Member, action: Action) => {
    const confirmText =
      action === 'remove'
        ? `Remove ${member.name ?? member.email} from this organization? Their account will remain active but they will no longer belong to this org.`
        : action === 'promote'
          ? `Promote ${member.name ?? member.email} to org admin?`
          : `Demote ${member.name ?? member.email} to patient?`
    if (!confirm(confirmText)) return

    setBusyId(member.id)
    try {
      const res = await fetch(
        `/api/org/${encodeURIComponent(slug)}/admin/members/${encodeURIComponent(member.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      )
      const json = (await res.json()) as ApiEnvelope<unknown>
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Action failed')
        return
      }
      await load()
    } catch (err) {
      console.error('MembersTab action failed', err)
      setError('Network error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email"
          className="flex-1 max-w-md px-4 py-2 bg-white border border-[#E5EAE3] rounded-xl text-[#2D352C]"
        />
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: accentColor }}
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-[#FAF9F6]/80 border border-[#E5EAE3] rounded-3xl overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-[#2D352C]/60">Loading members…</p>
        ) : members.length === 0 ? (
          <p className="p-6 text-sm text-[#2D352C]/60">
            No members match this search.
          </p>
        ) : (
          <ul className="divide-y divide-[#E5EAE3]">
            {members.map((m) => {
              const isSelf = m.id === currentUserId
              const isSuperAdmin = m.role === 'super_admin'
              const disableActions = isSelf || isSuperAdmin
              return (
                <li
                  key={m.id}
                  className="p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[#2D352C] truncate">
                        {m.name ?? m.email}
                      </p>
                      <RolePill role={m.role} accent={accentColor} />
                      {m.banned_from_org_at && (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                          Banned
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#2D352C]/50 truncate">
                      {m.email} · joined{' '}
                      {new Date(m.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.role === 'patient' && !disableActions && (
                      <button
                        type="button"
                        onClick={() => runAction(m, 'promote')}
                        disabled={busyId === m.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#E5EAE3] text-[#2D352C] hover:bg-white disabled:opacity-50"
                      >
                        Promote
                      </button>
                    )}
                    {m.role === 'org_admin' && !disableActions && (
                      <button
                        type="button"
                        onClick={() => runAction(m, 'demote')}
                        disabled={busyId === m.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#E5EAE3] text-[#2D352C] hover:bg-white disabled:opacity-50"
                      >
                        Demote
                      </button>
                    )}
                    {!disableActions && (
                      <button
                        type="button"
                        onClick={() => runAction(m, 'remove')}
                        disabled={busyId === m.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                    {isSelf && (
                      <span className="text-xs text-[#2D352C]/40">You</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function RolePill({ role, accent }: { role: string; accent: string }) {
  const label =
    role === 'org_admin'
      ? 'Admin'
      : role === 'super_admin'
        ? 'Super'
        : 'Patient'
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: `${accent}22`,
        color: accent,
      }}
    >
      {label}
    </span>
  )
}
