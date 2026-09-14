'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PostCard, {
  Avatar,
  type PostCardData,
  type PostComment,
} from '@/components/community/PostCard'

interface DiscoverUser {
  id: string
  name: string
  avatar_url: string | null
}

// People search — look up signed-up members by name. Self-contained: debounced
// fetch to /api/social/users (tenant-scoped server-side). Renders above the
// discover post feed.
function PeopleSearch() {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<DiscoverUser[]>([])
  const [loading, setLoading] = useState(false)
  const [searchedFor, setSearchedFor] = useState('')

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const controller = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      fetch(`/api/social/users?search=${encodeURIComponent(q)}&limit=20`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.success) setUsers(json.data.users as DiscoverUser[])
          setSearchedFor(q)
        })
        .catch(() => undefined)
        .finally(() => setLoading(false))
    }, 300)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [query])

  const trimmed = query.trim()
  const showResults = trimmed.length >= 2
  const pending = loading || searchedFor !== trimmed

  return (
    <div className="bg-white rounded-2xl border border-[#E5EAE3] p-3 shadow-sm">
      <label htmlFor="people-search" className="sr-only">
        Search members by name
      </label>
      <input
        id="people-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search members by name…"
        className="w-full rounded-xl border border-[#E5EAE3] px-3 py-2 text-sm text-[#2D352C] focus:border-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
      />
      {showResults && (
        <div className="mt-2">
          {pending ? (
            <p className="px-1 py-2 text-xs text-[#8B9B83]">Searching…</p>
          ) : users.length === 0 ? (
            <p className="px-1 py-2 text-xs text-[#8B9B83]">No members found</p>
          ) : (
            <ul className="divide-y divide-[#EEF1ED]">
              {users.map((u) => (
                <li key={u.id}>
                  <Link
                    href={`/community/users/${u.id}`}
                    className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                  >
                    <Avatar name={u.name} url={u.avatar_url ?? undefined} size={36} />
                    <span className="text-sm font-medium text-[#2D352C]">{u.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

interface DiscoverTabProps {
  feedSearch: string
  filteredDiscoverPosts: PostCardData[]
  discoverLoading: boolean
  expandedComments: Record<string, boolean>
  commentsData: Record<string, PostComment[]>
  commentsLoading: Record<string, boolean>
  commentTexts: Record<string, string>
  followLoading: boolean
  currentUserId?: string
  onLike: (postId: string) => void
  onToggleComments: (postId: string) => void
  onAddComment: (postId: string) => void
  onCommentTextChange: (postId: string, text: string) => void
  onLikeComment?: (postId: string, commentId: string) => void
  onEditComment?: (postId: string, commentId: string, body: string) => void
  onDeleteComment?: (postId: string, commentId: string) => void
  onFollow: (userId: string) => void
  followedIds?: ReadonlySet<string>
  onReport: (postId: string) => void
}

export default function DiscoverTab({
  feedSearch,
  filteredDiscoverPosts,
  discoverLoading,
  expandedComments,
  commentsData,
  commentsLoading,
  commentTexts,
  followLoading,
  currentUserId,
  onLike,
  onToggleComments,
  onAddComment,
  onCommentTextChange,
  onLikeComment,
  onEditComment,
  onDeleteComment,
  onFollow,
  followedIds,
  onReport,
}: DiscoverTabProps) {
  return (
    <div className="space-y-4">
      <PeopleSearch />

      <div className="bg-[#EEF1ED] rounded-2xl p-4 mb-2">
        <p className="text-xs text-[#6B7F65] font-medium leading-relaxed">
          Discover posts from the community. Follow people whose journeys inspire you.
        </p>
      </div>

      {discoverLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredDiscoverPosts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#EEF1ED] flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[var(--accent)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <p className="text-[#8B9B83] text-sm font-medium">
            {feedSearch ? 'No matching posts' : 'Nothing to discover yet'}
          </p>
          <p className="text-[var(--accent)] text-xs mt-1">
            {feedSearch ? 'Try a different search term' : 'Check back later for new posts'}
          </p>
        </div>
      ) : (
        filteredDiscoverPosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={currentUserId}
            onLike={onLike}
            onToggleComments={onToggleComments}
            showComments={!!expandedComments[post.id]}
            comments={commentsData[post.id] ?? []}
            commentsLoading={!!commentsLoading[post.id]}
            onAddComment={onAddComment}
            newCommentText={commentTexts[post.id] ?? ''}
            onCommentTextChange={(text) => onCommentTextChange(post.id, text)}
            onLikeComment={
              onLikeComment ? (commentId) => onLikeComment(post.id, commentId) : undefined
            }
            onEditComment={
              onEditComment
                ? (commentId, body) => onEditComment(post.id, commentId, body)
                : undefined
            }
            onDeleteComment={
              onDeleteComment ? (commentId) => onDeleteComment(post.id, commentId) : undefined
            }
            showFollowButton
            onFollow={onFollow}
            isFollowing={followedIds?.has(post.profiles?.id ?? post.user_id)}
            followLoading={followLoading}
            onReport={onReport}
          />
        ))
      )}
    </div>
  )
}
