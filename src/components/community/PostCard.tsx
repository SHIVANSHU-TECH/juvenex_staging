'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatRelative } from '@/lib/format';

export interface PostAuthor {
  id: string;
  name: string;
  avatar_url?: string;
}

export interface PostComment {
  id: string;
  user_id?: string;
  body: string;
  created_at: string;
  updated_at?: string | null;
  likes_count?: number;
  liked?: boolean;
  profiles?: PostAuthor;
}

export interface PostCardData {
  id: string;
  body: string;
  title?: string;
  type: string;
  is_public: boolean;
  image_url?: string | null;
  likes_count: number;
  comments_count: number;
  liked: boolean;
  created_at: string;
  profiles?: PostAuthor;
  user_id: string;
}

/**
 * @deprecated Use `formatRelative` from `@/lib/format` instead. This alias
 * is kept to avoid breaking any external import; new code should not use it.
 */
export const timeAgo = formatRelative;

export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url?: string;
  size?: number;
}) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (url) {
    return (
      <Image
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: 'linear-gradient(135deg, #8FA888 0%, #6B7F65 100%)',
        color: '#FFFFFF',
      }}
    >
      {initials}
    </div>
  );
}

interface PostCardProps {
  post: PostCardData;
  currentUserId?: string;
  onLike: (id: string) => void;
  onToggleComments: (id: string) => void;
  showComments: boolean;
  comments: PostComment[];
  commentsLoading: boolean;
  onAddComment: (postId: string) => void;
  newCommentText: string;
  onCommentTextChange: (text: string) => void;
  showFollowButton?: boolean;
  onFollow?: (userId: string) => void;
  isFollowing?: boolean;
  followLoading?: boolean;
  onReport?: (postId: string) => void;
  onEdit?: (postId: string) => void;
  onDelete?: (postId: string) => void;
  onLikeComment?: (commentId: string) => void;
  onEditComment?: (commentId: string, body: string) => void;
  onDeleteComment?: (commentId: string) => void;
}

export default function PostCard({
  post,
  currentUserId,
  onLike,
  onToggleComments,
  showComments,
  comments,
  commentsLoading,
  onAddComment,
  newCommentText,
  onCommentTextChange,
  showFollowButton,
  onFollow,
  isFollowing,
  followLoading,
  onReport,
  onEdit,
  onDelete,
  onLikeComment,
  onEditComment,
  onDeleteComment,
}: PostCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const authorName = post.profiles?.name ?? 'Anonymous';
  const authorId = post.profiles?.id ?? post.user_id;
  const isOwnPost = currentUserId === post.user_id;
  const canReport = post.is_public && !isOwnPost && !!onReport;
  const canManage = isOwnPost && (!!onEdit || !!onDelete);

  return (
    <article className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm overflow-hidden">
      <div className="p-4">
        {/* Author row */}
        <div className="flex items-center gap-3 mb-3">
          <Link href={`/community/users/${authorId}`}>
            <Avatar name={authorName} url={post.profiles?.avatar_url} size={38} />
          </Link>
          <div className="flex-1 min-w-0">
            <Link
              href={`/community/users/${authorId}`}
              className="font-semibold text-[#2D352C] text-sm hover:underline"
            >
              {authorName}
            </Link>
            <p className="text-xs text-[#8B9B83]">
              {formatRelative(post.created_at)}
              {!post.is_public && (
                <span className="ml-1.5 text-[10px] font-medium text-[var(--accent)] bg-[#EEF1ED] px-1.5 py-0.5 rounded-full">
                  Private
                </span>
              )}
            </p>
          </div>
          {showFollowButton && onFollow && (
            <button
              onClick={() => onFollow(authorId)}
              disabled={followLoading}
              aria-pressed={!!isFollowing}
              className={`text-xs font-semibold px-3 py-1 rounded-full border border-[var(--accent)] transition-colors disabled:opacity-50 ${
                isFollowing
                  ? 'bg-[var(--accent)] text-white hover:opacity-90'
                  : 'text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white'
              }`}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </button>
          )}

          {(canReport || canManage) && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Post options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="p-1.5 rounded-full text-[#8B9B83] hover:bg-[#F5F7F4] hover:text-[#6B7F65] transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 z-20 w-40 rounded-xl bg-white border border-[#E5EAE3] shadow-lg overflow-hidden"
                  >
                    {canManage && onEdit && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onEdit(post.id);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-[#2D352C] hover:bg-[#F5F7F4]"
                      >
                        Edit post
                      </button>
                    )}
                    {canManage && onDelete && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onDelete(post.id);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-[#C06060] hover:bg-[#FDF2F2]"
                      >
                        Delete post
                      </button>
                    )}
                    {canReport && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onReport?.(post.id);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-[#C06060] hover:bg-[#FDF2F2]"
                      >
                        Report post
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Title for forum posts */}
        {post.title && (
          <h3 className="font-semibold text-[#2D352C] text-[15px] mb-1.5">{post.title}</h3>
        )}

        {/* Body */}
        <p className="text-[#3D4A3A] text-sm leading-relaxed whitespace-pre-wrap">{post.body}</p>

        {/* Image */}
        {post.image_url && (
          <div className="mt-3 rounded-xl overflow-hidden border border-[#E5EAE3]">
            <Image
              src={post.image_url}
              alt="Post image"
              width={600}
              height={400}
              className="w-full max-h-96 object-cover"
            />
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center border-t border-[#F0F2EF] px-4 py-2.5 gap-1">
        <button
          onClick={() => onLike(post.id)}
          aria-label={post.liked ? 'Unlike post' : 'Like post'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            post.liked
              ? 'text-[#C06060] bg-[#FDF2F2]'
              : 'text-[#8B9B83] hover:bg-[#F5F7F4] hover:text-[#6B7F65]'
          }`}
        >
          <svg
            className="w-4 h-4"
            fill={post.liked ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
          <span className="font-medium">{post.likes_count}</span>
        </button>

        <button
          onClick={() => onToggleComments(post.id)}
          aria-label={showComments ? 'Hide comments' : 'Show comments'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            showComments
              ? 'text-[var(--accent)] bg-[#EEF1ED]'
              : 'text-[#8B9B83] hover:bg-[#F5F7F4] hover:text-[#6B7F65]'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <span className="font-medium">{post.comments_count}</span>
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="border-t border-[#F0F2EF] bg-[#FAFBF9] px-4 py-3">
          {commentsLoading ? (
            <p className="text-xs text-[#8B9B83] text-center py-2">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-[#8B9B83] text-center py-2">
              No comments yet. Be the first!
            </p>
          ) : (
            <div className="space-y-3 mb-3">
              {comments.map((c) => {
                const isOwnComment =
                  !!currentUserId && (c.user_id ?? c.profiles?.id) === currentUserId;
                const commentAuthorId = c.user_id ?? c.profiles?.id;
                const isEditing = editingCommentId === c.id;
                const wasEdited = !!c.updated_at && c.updated_at !== c.created_at;
                return (
                  <div key={c.id} className="flex gap-2.5">
                    {commentAuthorId ? (
                      <Link href={`/community/users/${commentAuthorId}`}>
                        <Avatar name={c.profiles?.name ?? 'User'} url={c.profiles?.avatar_url} size={28} />
                      </Link>
                    ) : (
                      <Avatar name={c.profiles?.name ?? 'User'} url={c.profiles?.avatar_url} size={28} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        {commentAuthorId ? (
                          <Link
                            href={`/community/users/${commentAuthorId}`}
                            className="font-semibold text-xs text-[#2D352C] hover:underline"
                          >
                            {c.profiles?.name ?? 'User'}
                          </Link>
                        ) : (
                          <span className="font-semibold text-xs text-[#2D352C]">
                            {c.profiles?.name ?? 'User'}
                          </span>
                        )}
                        <span className="text-[10px] text-[#8B9B83]">
                          {formatRelative(c.created_at)}
                          {wasEdited && <span className="ml-1 italic">· edited</span>}
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="mt-1 flex flex-col gap-1.5">
                          <input
                            type="text"
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                            className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-[#E5EAE3] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editingCommentText.trim()) {
                                onEditComment?.(c.id, editingCommentText.trim());
                                setEditingCommentId(null);
                              } else if (e.key === 'Escape') {
                                setEditingCommentId(null);
                              }
                            }}
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (editingCommentText.trim()) {
                                  onEditComment?.(c.id, editingCommentText.trim());
                                }
                                setEditingCommentId(null);
                              }}
                              disabled={!editingCommentText.trim()}
                              className="text-[11px] font-semibold text-[var(--accent)] disabled:opacity-40"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingCommentId(null)}
                              className="text-[11px] font-medium text-[#8B9B83]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-[#3D4A3A] mt-0.5 whitespace-pre-wrap">{c.body}</p>
                      )}

                      {!isEditing && (
                        <div className="flex items-center gap-3 mt-1">
                          {onLikeComment && (
                            <button
                              onClick={() => onLikeComment(c.id)}
                              aria-label={c.liked ? 'Unlike comment' : 'Like comment'}
                              className={`flex items-center gap-1 text-[11px] transition-colors ${
                                c.liked
                                  ? 'text-[#C06060]'
                                  : 'text-[#8B9B83] hover:text-[#6B7F65]'
                              }`}
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill={c.liked ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.8}
                                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                                />
                              </svg>
                              {(c.likes_count ?? 0) > 0 && (
                                <span className="font-medium">{c.likes_count}</span>
                              )}
                            </button>
                          )}
                          {isOwnComment && onEditComment && (
                            <button
                              onClick={() => {
                                setEditingCommentId(c.id);
                                setEditingCommentText(c.body);
                              }}
                              className="text-[11px] font-medium text-[#8B9B83] hover:text-[#6B7F65]"
                            >
                              Edit
                            </button>
                          )}
                          {isOwnComment && onDeleteComment && (
                            <button
                              onClick={() => onDeleteComment(c.id)}
                              className="text-[11px] font-medium text-[#8B9B83] hover:text-[#C06060]"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newCommentText}
              onChange={(e) => onCommentTextChange(e.target.value)}
              placeholder="Write a comment..."
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-[#E5EAE3] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] placeholder:text-[var(--accent)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newCommentText.trim()) {
                  onAddComment(post.id);
                }
              }}
            />
            <button
              onClick={() => onAddComment(post.id)}
              disabled={!newCommentText.trim()}
              aria-label="Submit comment"
              className="px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-40 hover:bg-[var(--accent)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
