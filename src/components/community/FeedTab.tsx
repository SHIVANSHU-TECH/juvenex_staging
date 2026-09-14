'use client'

import PostComposer from '@/components/community/PostComposer'
import PostCard, {
  Avatar,
  type PostCardData,
  type PostComment,
} from '@/components/community/PostCard'

interface FeedTabProps {
  authorName: string
  authorAvatarUrl?: string | null
  postSubmitting: boolean
  feedSearch: string
  filteredPosts: PostCardData[]
  feedLoading: boolean
  feedHasMore: boolean
  loadingMore: boolean
  expandedComments: Record<string, boolean>
  commentsData: Record<string, PostComment[]>
  commentsLoading: Record<string, boolean>
  commentTexts: Record<string, string>
  currentUserId?: string
  postTargets?: Array<{ id: string; label: string }>
  onChangeSearch: (value: string) => void
  onCreatePost: (input: { body: string; imageUrl: string | null; isPublic: boolean; targetId?: string }) => Promise<void>
  onError: (message: string) => void
  onLike: (postId: string) => void
  onToggleComments: (postId: string) => void
  onAddComment: (postId: string) => void
  onCommentTextChange: (postId: string, text: string) => void
  onLikeComment?: (postId: string, commentId: string) => void
  onEditComment?: (postId: string, commentId: string, body: string) => void
  onDeleteComment?: (postId: string, commentId: string) => void
  onReport: (postId: string) => void
  onEdit: (postId: string) => void
  onDelete: (postId: string) => void
  onLoadMore: () => void
}

export default function FeedTab({
  authorName,
  authorAvatarUrl,
  postSubmitting,
  feedSearch,
  filteredPosts,
  feedLoading,
  feedHasMore,
  loadingMore,
  expandedComments,
  commentsData,
  commentsLoading,
  commentTexts,
  currentUserId,
  postTargets,
  onChangeSearch,
  onCreatePost,
  onError,
  onLike,
  onToggleComments,
  onAddComment,
  onCommentTextChange,
  onLikeComment,
  onEditComment,
  onDeleteComment,
  onReport,
  onEdit,
  onDelete,
  onLoadMore,
}: FeedTabProps) {
  return (
    <div className="space-y-4">
      <PostComposer
        authorName={authorName}
        authorAvatarUrl={authorAvatarUrl}
        AvatarComponent={Avatar}
        onSubmit={onCreatePost}
        submitting={postSubmitting}
        onError={onError}
        targets={postTargets}
      />

      <div className="relative">
        <input
          type="text"
          placeholder="Search posts..."
          value={feedSearch}
          onChange={(e) => onChangeSearch(e.target.value)}
          className="w-full px-4 py-3 pl-12 rounded-xl bg-white border border-[#E5EAE3] shadow-sm focus:border-[var(--accent)] focus:outline-none placeholder:text-[var(--accent)] text-sm text-[#2D352C]"
        />
        <span className="absolute left-4 top-3.5 text-[#8B9B83]">🔍</span>
      </div>

      {feedLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredPosts.length === 0 ? (
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
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <p className="text-[#8B9B83] text-sm font-medium">
            {feedSearch ? 'No matching posts' : 'No posts yet'}
          </p>
          <p className="text-[var(--accent)] text-xs mt-1">
            {feedSearch ? 'Try a different search term' : 'Be the first to share something!'}
          </p>
        </div>
      ) : (
        <>
          {filteredPosts.map((post) => (
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
              onReport={onReport}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}

          {feedHasMore && !feedSearch && (
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="w-full py-3 text-sm font-semibold text-[var(--accent)] bg-white rounded-2xl border border-[#E5EAE3] hover:bg-[#F5F7F4] transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
