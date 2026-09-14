'use client'

import Image from 'next/image'
import PostComposer from '@/components/community/PostComposer'
import { Avatar } from '@/components/community/PostCard'
import { formatRelative } from '@/lib/format'

export interface ProfilePost {
  id: string
  body: string
  type: string
  image_url?: string | null
  is_public: boolean
  likes_count: number
  comments_count: number
  liked_by_user?: boolean
  created_at: string
  author?: {
    id: string
    name: string
    avatar_url?: string
  }
  profiles?: {
    id: string
    name: string
    avatar_url?: string
  }
}

export interface ProfilePostComment {
  id: string
  body: string
  created_at: string
  updated_at?: string | null
  user_id?: string
  post_id?: string
  likes_count?: number
  liked?: boolean
  author?: { name: string }
  profiles?: { id: string; name: string | null; avatar_url?: string | null }
}

interface ProfilePostsTabProps {
  displayName: string
  // The profile owner's current avatar. Every post in this tab is the owner's,
  // so we render this (the same source the profile header uses) to guarantee a
  // single source of truth — no stale per-post copy after an avatar change.
  avatarUrl?: string | null
  posts: ProfilePost[]
  postsLoading: boolean
  dataLoading: boolean
  postSubmitting: boolean
  likedPosts: Record<string, boolean>
  likeCounts: Record<string, number>
  expandedComments: Record<string, boolean>
  commentsData: Record<string, ProfilePostComment[]>
  commentsLoading: Record<string, boolean>
  commentTexts: Record<string, string>
  // The logged-in viewer (the profile owner). Used to decide whether a comment's
  // Edit control is shown (author-only); Delete is always available because every
  // post here belongs to the owner, who can moderate any comment on it.
  currentUserId?: string
  editingCommentId: string | null
  editingCommentText: string
  onCreatePost: (input: { body: string; imageUrl: string | null; isPublic: boolean; targetId?: string }) => Promise<void>
  onError: (message: string) => void
  onLike: (postId: string) => void
  onToggleComments: (postId: string) => void
  onCommentTextChange: (postId: string, text: string) => void
  onAddComment: (postId: string) => void
  onCommentLike: (postId: string, commentId: string) => void
  onCommentEditStart: (comment: ProfilePostComment) => void
  onCommentEditChange: (text: string) => void
  onCommentEditSave: (postId: string, commentId: string) => void
  onCommentEditCancel: () => void
  onCommentDelete: (postId: string, commentId: string) => void
  // Every post in this tab belongs to the profile owner, so edit/delete are
  // always available — no per-post ownership check needed here.
  onEdit: (post: ProfilePost) => void
  onDelete: (postId: string) => void
}

function PostSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-10 h-10 rounded-full bg-[#EEF1ED]" />
        <div className="flex-1 space-y-1">
          <div className="h-4 bg-[#EEF1ED] rounded w-24" />
          <div className="h-3 bg-[#EEF1ED] rounded w-16" />
        </div>
      </div>
      <div className="h-4 bg-[#EEF1ED] rounded w-full mb-2" />
      <div className="h-4 bg-[#EEF1ED] rounded w-3/4" />
    </div>
  )
}

export default function ProfilePostsTab({
  displayName,
  avatarUrl,
  posts,
  postsLoading,
  dataLoading,
  postSubmitting,
  likedPosts,
  likeCounts,
  expandedComments,
  commentsData,
  commentsLoading,
  commentTexts,
  currentUserId,
  editingCommentId,
  editingCommentText,
  onCreatePost,
  onError,
  onLike,
  onToggleComments,
  onCommentTextChange,
  onAddComment,
  onCommentLike,
  onCommentEditStart,
  onCommentEditChange,
  onCommentEditSave,
  onCommentEditCancel,
  onCommentDelete,
  onEdit,
  onDelete,
}: ProfilePostsTabProps) {
  return (
    <div className="space-y-4">
      <PostComposer
        authorName={displayName}
        authorAvatarUrl={avatarUrl}
        AvatarComponent={Avatar}
        onSubmit={onCreatePost}
        submitting={postSubmitting}
        onError={onError}
      />
      {postsLoading || dataLoading ? (
        <>
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5EAE3] p-8 shadow-xl text-center">
          <p className="text-3xl mb-2">&#x1F4DD;</p>
          <p className="text-[#6B7567] font-medium">No posts yet</p>
          <p className="text-xs text-[#8B9B83] mt-1">Share your progress with the community!</p>
        </div>
      ) : (
        posts.map((post) => {
          const author = post.profiles ?? post.author
          const authorName = author?.name ?? displayName
          const isLiked = likedPosts[post.id]
          return (
            <div key={post.id} className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <Avatar name={authorName} url={avatarUrl ?? author?.avatar_url} size={40} />
                <div className="flex-1">
                  <p className="font-bold text-sm text-[#2D352C]">{authorName}</p>
                  <p className="text-xs text-[#8B9B83]">
                    {formatRelative(post.created_at)}
                    {!post.is_public && (
                      <span className="ml-1.5 text-[10px] font-medium text-[var(--accent)] bg-[#EEF1ED] px-1.5 py-0.5 rounded-full">
                        Private
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <p className="text-sm text-[#2D352C] mb-3">{post.body}</p>
              {post.image_url && (
                <div className="mb-3 rounded-xl overflow-hidden border border-[#E5EAE3]">
                  <Image
                    src={post.image_url}
                    alt="Post image"
                    width={600}
                    height={400}
                    className="w-full max-h-96 object-cover"
                  />
                </div>
              )}
              <div className="flex gap-4 text-xs text-[#8B9B83]">
                <button
                  onClick={() => onLike(post.id)}
                  aria-label={isLiked ? 'Unlike post' : 'Like post'}
                  className={`flex items-center gap-1 hover:text-[var(--accent)] ${isLiked ? 'text-red-500' : ''}`}
                >
                  {isLiked ? '❤️' : '♡'} {likeCounts[post.id] ?? post.likes_count}
                </button>
                <button
                  onClick={() => onToggleComments(post.id)}
                  aria-label="Toggle comments"
                  className="flex items-center gap-1 hover:text-[var(--accent)]"
                >
                  &#x1F4AC; {post.comments_count}
                </button>
                <button
                  onClick={() => onEdit(post)}
                  aria-label="Edit post"
                  className="ml-auto flex items-center gap-1 hover:text-[var(--accent)]"
                >
                  &#x270F;&#xFE0F; Edit
                </button>
                <button
                  onClick={() => onDelete(post.id)}
                  aria-label="Delete post"
                  className="flex items-center gap-1 hover:text-red-500"
                >
                  &#x1F5D1;&#xFE0F; Delete
                </button>
              </div>
              {expandedComments[post.id] && (
                <div className="mt-3 pt-3 border-t border-[#E5EAE3] space-y-2">
                  {commentsLoading[post.id] ? (
                    <div className="animate-pulse space-y-2">
                      <div className="h-3 bg-[#EEF1ED] rounded w-3/4" />
                      <div className="h-3 bg-[#EEF1ED] rounded w-1/2" />
                    </div>
                  ) : (commentsData[post.id] ?? []).length === 0 ? (
                    <p className="text-xs text-[#8B9B83]">No comments yet</p>
                  ) : (
                    (commentsData[post.id] ?? []).map((comment) => {
                      const commentAuthor =
                        comment.profiles?.name ?? comment.author?.name ?? 'User'
                      const canEdit = Boolean(
                        currentUserId && comment.user_id && comment.user_id === currentUserId
                      )
                      const isEditing = editingCommentId === comment.id
                      const commentLiked = comment.liked ?? false
                      const commentLikeCount = comment.likes_count ?? 0
                      return (
                        <div key={comment.id} className="text-xs">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={editingCommentText}
                                onChange={(e) => onCommentEditChange(e.target.value)}
                                aria-label="Edit comment"
                                className="flex-1 text-xs px-3 py-2 min-h-11 rounded-xl border border-[#E5EAE3] bg-white text-[#2D352C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-1"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && editingCommentText.trim()) {
                                    e.preventDefault()
                                    onCommentEditSave(post.id, comment.id)
                                  } else if (e.key === 'Escape') {
                                    onCommentEditCancel()
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => onCommentEditSave(post.id, comment.id)}
                                disabled={!editingCommentText.trim()}
                                className="px-3 min-h-11 rounded-xl bg-[var(--accent-strong)] text-white text-xs font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={onCommentEditCancel}
                                className="px-2 min-h-11 rounded-xl text-[#6B7567] text-xs font-semibold hover:text-[#2D352C]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="font-bold text-[#2D352C]">{commentAuthor}</span>{' '}
                              <span className="text-[#6B7567]">{comment.body}</span>
                              <span className="text-[#8B9B83] ml-2">{formatRelative(comment.created_at)}</span>
                              {comment.updated_at && (
                                <span className="text-[#8B9B83] ml-1 italic">(edited)</span>
                              )}
                              <div className="mt-1 flex items-center gap-3 text-[11px]">
                                <button
                                  type="button"
                                  onClick={() => onCommentLike(post.id, comment.id)}
                                  aria-label={commentLiked ? 'Unlike comment' : 'Like comment'}
                                  className={`flex items-center gap-1 hover:text-[var(--accent)] ${commentLiked ? 'text-red-500' : 'text-[#8B9B83]'}`}
                                >
                                  {commentLiked ? '❤️' : '♡'} {commentLikeCount > 0 ? commentLikeCount : ''}
                                </button>
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => onCommentEditStart(comment)}
                                    aria-label="Edit comment"
                                    className="text-[#8B9B83] hover:text-[var(--accent)]"
                                  >
                                    Edit
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onCommentDelete(post.id, comment.id)}
                                  aria-label="Delete comment"
                                  className="text-[#8B9B83] hover:text-red-500"
                                >
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })
                  )}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={commentTexts[post.id] ?? ''}
                      onChange={(e) => onCommentTextChange(post.id, e.target.value)}
                      placeholder="Write a comment..."
                      aria-label="Write a comment"
                      className="flex-1 text-xs px-3 py-2 min-h-11 rounded-xl border border-[#E5EAE3] bg-white text-[#2D352C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-1 placeholder:text-[#8B9B83]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (commentTexts[post.id] ?? '').trim()) {
                          e.preventDefault()
                          onAddComment(post.id)
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => onAddComment(post.id)}
                      disabled={!(commentTexts[post.id] ?? '').trim()}
                      aria-label="Post comment"
                      className="px-4 min-h-11 rounded-xl bg-[var(--accent-strong)] text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                    >
                      Post
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
