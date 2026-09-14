'use client'

import Link from 'next/link'

export interface CommunityGroup {
  id: string
  name: string
  description: string
  slug: string
  member_count?: number
  is_member?: boolean
  group_members?: Array<{ count: number }>
  created_at: string
}

export interface GroupForm {
  name: string
  description: string
  slug: string
}

interface GroupsTabProps {
  groupSearch: string
  showCreateGroup: boolean
  groupForm: GroupForm
  groupCreating: boolean
  groupsLoading: boolean
  filteredGroups: CommunityGroup[]
  onChangeSearch: (value: string) => void
  onToggleCreate: () => void
  onChangeForm: (form: GroupForm) => void
  onCreateGroup: () => void
}

export default function GroupsTab({
  groupSearch,
  showCreateGroup,
  groupForm,
  groupCreating,
  groupsLoading,
  filteredGroups,
  onChangeSearch,
  onToggleCreate,
  onChangeForm,
  onCreateGroup,
}: GroupsTabProps) {
  const canCreate =
    !!groupForm.name.trim() && !!groupForm.description.trim() && !groupCreating

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          placeholder="Search groups..."
          value={groupSearch}
          onChange={(e) => onChangeSearch(e.target.value)}
          className="w-full px-4 py-3 pl-12 rounded-xl bg-white border border-[#E5EAE3] shadow-sm focus:border-[var(--accent)] focus:outline-none placeholder:text-[var(--accent)] text-sm text-[#2D352C]"
        />
        <span className="absolute left-4 top-3.5 text-[#8B9B83]">🔍</span>
      </div>

      <button
        onClick={onToggleCreate}
        className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--accent)] text-white text-sm font-semibold rounded-2xl hover:bg-[var(--accent)] transition-colors shadow-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={showCreateGroup ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'}
          />
        </svg>
        {showCreateGroup ? 'Cancel' : 'Create Group'}
      </button>

      {showCreateGroup && (
        <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-4 space-y-3">
          <input
            type="text"
            value={groupForm.name}
            onChange={(e) => onChangeForm({ ...groupForm, name: e.target.value })}
            placeholder="Group name"
            className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#E5EAE3] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] placeholder:text-[var(--accent)]"
          />
          <textarea
            value={groupForm.description}
            onChange={(e) => onChangeForm({ ...groupForm, description: e.target.value })}
            placeholder="What is this group about?"
            rows={2}
            className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#E5EAE3] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] placeholder:text-[var(--accent)] resize-none"
          />
          <input
            type="text"
            value={groupForm.slug}
            onChange={(e) => onChangeForm({ ...groupForm, slug: e.target.value })}
            placeholder="URL slug (auto-generated if empty)"
            className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#E5EAE3] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] placeholder:text-[var(--accent)]"
          />
          <button
            onClick={onCreateGroup}
            disabled={!canCreate}
            className="w-full py-2.5 bg-[var(--accent)] text-white text-sm font-semibold rounded-xl hover:bg-[var(--accent)] transition-colors disabled:opacity-40"
          >
            {groupCreating ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      {groupsLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#EEF1ED] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <p className="text-[#8B9B83] text-sm font-medium">
            {groupSearch ? 'No matching groups' : 'No groups yet'}
          </p>
          <p className="text-[var(--accent)] text-xs mt-1">
            {groupSearch ? 'Try a different search term' : 'Create one to get started!'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const memberCount =
              group.member_count ??
              (Array.isArray(group.group_members)
                ? group.group_members[0]?.count ?? 0
                : 0)
            return (
              <Link
                key={group.id}
                href={`/community/groups/${group.id}`}
                className="block bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-4 hover:border-[var(--accent)]/40 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'linear-gradient(135deg, #8FA888 0%, #B8C9B2 100%)',
                    }}
                  >
                    <svg
                      className="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.8}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[#2D352C] text-sm">{group.name}</h3>
                    <p className="text-xs text-[#8B9B83] mt-0.5 line-clamp-2">
                      {group.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] font-medium text-[var(--accent)] bg-[#EEF1ED] px-2 py-0.5 rounded-full">
                        {memberCount} {memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </div>
                  </div>
                  <svg
                    className="w-4 h-4 text-[var(--accent)] mt-1 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
