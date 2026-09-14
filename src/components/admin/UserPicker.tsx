'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AdminUserListItem } from '@/lib/messaging'
import type { ApiEnvelope } from '@/lib/api-types'
import UserListItem from './UserListItem'

interface UserPickerProps {
  selectedUserId: string | null
  onSelect: (user: AdminUserListItem) => void
}

interface UsersResponseData {
  users: AdminUserListItem[]
  hasMore: boolean
  total: number
}

type UsersResponse = ApiEnvelope<UsersResponseData>

function SearchIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="m17 17-3.5-3.5" strokeLinecap="round" />
    </svg>
  )
}

function SkeletonRow() {
  return (
    <li className="px-3 py-3 flex items-start gap-3 border-l-2 border-transparent">
      <span className="w-10 h-10 rounded-full bg-[#E5EAE3] animate-pulse" />
      <span className="flex-1 min-w-0 space-y-2 pt-1">
        <span className="block h-3 w-2/3 rounded bg-[#E5EAE3] animate-pulse" />
        <span className="block h-3 w-4/5 rounded bg-[#E5EAE3]/60 animate-pulse" />
      </span>
    </li>
  )
}

export default function UserPicker({
  selectedUserId,
  onSelect,
}: UserPickerProps) {
  const [users, setUsers] = useState<AdminUserListItem[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(handle)
  }, [search])

  useEffect(() => {
    let cancelled = false
    const fetchUsers = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ limit: '50' })
        if (debouncedSearch) params.set('search', debouncedSearch)
        const res = await fetch(`/api/admin/users?${params.toString()}`)
        const json = (await res.json()) as UsersResponse
        if (cancelled) return
        if (!res.ok || !json.success || !json.data) {
          setError(json.error ?? 'Failed to load users')
          setUsers([])
          return
        }
        setUsers(json.data.users)
      } catch {
        if (!cancelled) {
          setError('Network error')
          setUsers([])
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void fetchUsers()
    return () => {
      cancelled = true
    }
  }, [debouncedSearch])

  // Until the API returns unread counts, this stays at 0 — the UI surfaces
  // the pill only when the value is positive, so adding it later is a no-op.
  const unreadTotal = useMemo(() => 0, [])

  const visible = users

  return (
    <div className="flex flex-col h-full bg-white/40">
      <div className="flex-shrink-0 sticky top-0 z-10 bg-[#FAF9F6]/95 backdrop-blur border-b border-[#E5EAE3]">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#2D352C] tracking-tight">
            Inbox
          </h2>
          {unreadTotal > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--accent)] text-white">
              {unreadTotal} unread
            </span>
          )}
        </div>
        <div className="px-3 pb-3">
          <label className="relative block">
            <span className="sr-only">Search users</span>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2D352C]/40">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-[#E5EAE3] rounded-xl text-sm text-[#2D352C] placeholder-[#2D352C]/40 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </label>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        role="listbox"
        aria-label="Conversations"
      >
        {error && (
          <p className="p-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {isLoading && !error && (
          <ul>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </ul>
        )}
        {!isLoading && !error && visible.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-sm text-[#2D352C]/60">No conversations yet</p>
            <p className="mt-1 text-xs text-[#2D352C]/40">
              Search for a user to start one.
            </p>
          </div>
        )}
        {!isLoading && !error && visible.length > 0 && (
          <ul className="divide-y divide-[#E5EAE3]/60">
            {visible.map((u) => (
              <UserListItem
                key={u.id}
                user={u}
                isActive={u.id === selectedUserId}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
