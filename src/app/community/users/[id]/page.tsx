'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import BottomNav from '@/components/BottomNav';
import FollowListModal from '@/components/community/FollowListModal';
import EditPostModal from '@/components/community/EditPostModal';
import ReportPostModal from '@/components/community/ReportPostModal';
import ConfirmDialog from '@/components/community/ConfirmDialog';
import PostCard, {
  type PostCardData,
  type PostComment as Comment,
} from '@/components/community/PostCard';
import type {
  ApiEnvelope,
  SocialLikeData,
  SocialCommentsListData,
  SocialCommentCreateData,
} from '@/lib/api-types';

interface Profile {
  id: string;
  name: string;
  avatar_url?: string;
  role: string;
}

interface Stats {
  postCount: number;
  followerCount: number;
  followingCount: number;
}

interface PublicProgressPhoto {
  id: string;
  photo_url: string | null;
  weight: number | null;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function Avatar({ name, url, size = 40 }: { name: string; url?: string; size?: number }) {
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
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: 'linear-gradient(135deg, #8FA888 0%, #6B7F65 100%)',
        color: '#FFFFFF',
      }}
    >
      {initials}
    </div>
  );
}

export default function UserProfilePage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [recentPosts, setRecentPosts] = useState<PostCardData[]>([]);
  const [progressPhotos, setProgressPhotos] = useState<PublicProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null);
  const [editingPost, setEditingPost] = useState<PostCardData | null>(null);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Comments
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentsData, setCommentsData] = useState<Record<string, Comment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState<Record<string, boolean>>({});
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});

  const isOwnProfile = user?.id === userId;

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/social/users/${userId}`);
      const json = await res.json();
      if (json.success) {
        setProfile(json.data.profile);
        setStats(json.data.stats);
        setIsFollowing(json.data.isFollowing);
        setRecentPosts((json.data.recentPosts ?? []) as PostCardData[]);
        setProgressPhotos(json.data.progressPhotos ?? []);
      } else {
        setError(json.error ?? 'User not found');
      }
    } catch {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isAuthenticated && userId) {
      fetchProfile();
    }
  }, [isAuthenticated, userId, fetchProfile]);

  // Follow / Unfollow
  const handleFollow = async () => {
    setFollowLoading(true);
    try {
      const res = await fetch(`/api/social/users/${userId}/follow`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setIsFollowing(json.data.following);
        setStats((prev) =>
          prev
            ? {
                ...prev,
                followerCount: json.data.following
                  ? prev.followerCount + 1
                  : Math.max(0, prev.followerCount - 1),
              }
            : prev
        );
      }
    } catch {
      // silent
    } finally {
      setFollowLoading(false);
    }
  };

  // Like — optimistic with rollback (mirrors community/page.tsx).
  const handleLike = async (postId: string) => {
    const target = recentPosts.find((p) => p.id === postId);
    const wasLiked = target?.liked ?? false;

    const optimistic = (prev: PostCardData[]) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, liked: !wasLiked, likes_count: p.likes_count + (wasLiked ? -1 : 1) }
          : p
      );
    setRecentPosts(optimistic);

    try {
      const res = await fetch(`/api/social/posts/${postId}/like`, { method: 'POST' });
      const json = (await res.json()) as ApiEnvelope<SocialLikeData>;
      if (json.success && json.data) {
        setRecentPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, liked: json.data!.liked, likes_count: json.data!.likesCount }
              : p
          )
        );
      } else {
        setRecentPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, liked: wasLiked, likes_count: p.likes_count + (wasLiked ? 1 : -1) }
              : p
          )
        );
        setError(json.error ?? 'Failed to update like');
      }
    } catch {
      setRecentPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked: wasLiked, likes_count: p.likes_count + (wasLiked ? 1 : -1) }
            : p
        )
      );
      setError('Failed to update like');
    }
  };

  // Toggle comments — lazy-fetch on first expand.
  const handleToggleComments = async (postId: string) => {
    const isOpen = expandedComments[postId];
    setExpandedComments((prev) => ({ ...prev, [postId]: !isOpen }));

    if (!isOpen && !commentsData[postId]) {
      setCommentsLoading((prev) => ({ ...prev, [postId]: true }));
      try {
        const res = await fetch(`/api/social/posts/${postId}/comments?page=1&limit=20`);
        const json = (await res.json()) as ApiEnvelope<SocialCommentsListData>;
        if (json.success && json.data) {
          setCommentsData((prev) => ({ ...prev, [postId]: json.data!.comments as Comment[] }));
        } else {
          setError(json.error ?? 'Failed to load comments');
        }
      } catch {
        setError('Failed to load comments');
      } finally {
        setCommentsLoading((prev) => ({ ...prev, [postId]: false }));
      }
    }
  };

  const handleCommentTextChange = useCallback((postId: string, text: string) => {
    setCommentTexts((prev) => ({ ...prev, [postId]: text }));
  }, []);

  const handleAddComment = async (postId: string) => {
    const text = commentTexts[postId]?.trim();
    if (!text) return;
    try {
      const res = await fetch(`/api/social/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const json = (await res.json()) as ApiEnvelope<SocialCommentCreateData>;
      if (json.success && json.data) {
        const newComment = json.data.comment as Comment;
        setCommentTexts((prev) => ({ ...prev, [postId]: '' }));
        setCommentsData((prev) => ({
          ...prev,
          [postId]: [...(prev[postId] ?? []), newComment],
        }));
        setRecentPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p
          )
        );
      } else {
        setError(json.error ?? 'Failed to add comment');
      }
    } catch {
      setError('Failed to add comment');
    }
  };

  // Like a comment — optimistic flip with rollback.
  const handleLikeComment = async (postId: string, commentId: string) => {
    const current = (commentsData[postId] ?? []).find((c) => c.id === commentId);
    const wasLiked = current?.liked ?? false;

    const flip = (delta: number, liked: boolean) =>
      setCommentsData((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? []).map((c) =>
          c.id === commentId
            ? { ...c, liked, likes_count: Math.max(0, (c.likes_count ?? 0) + delta) }
            : c
        ),
      }));

    flip(wasLiked ? -1 : 1, !wasLiked);

    try {
      const res = await fetch(`/api/social/posts/${postId}/comments/${commentId}/like`, {
        method: 'POST',
      });
      const json = (await res.json()) as ApiEnvelope<SocialLikeData>;
      if (json.success && json.data) {
        setCommentsData((prev) => ({
          ...prev,
          [postId]: (prev[postId] ?? []).map((c) =>
            c.id === commentId
              ? { ...c, liked: json.data!.liked, likes_count: json.data!.likesCount }
              : c
          ),
        }));
      } else {
        flip(wasLiked ? 1 : -1, wasLiked);
        setError(json.error ?? 'Failed to update like');
      }
    } catch {
      flip(wasLiked ? 1 : -1, wasLiked);
      setError('Failed to update like');
    }
  };

  // Edit a comment — optimistic body swap with rollback.
  const handleEditComment = async (postId: string, commentId: string, body: string) => {
    const text = body.trim();
    if (!text) return;
    const prevBody =
      (commentsData[postId] ?? []).find((c) => c.id === commentId)?.body ?? '';

    setCommentsData((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? []).map((c) => (c.id === commentId ? { ...c, body: text } : c)),
    }));

    try {
      const res = await fetch(`/api/social/posts/${postId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const json = (await res.json()) as ApiEnvelope<SocialCommentCreateData>;
      if (json.success && json.data) {
        const updated = json.data.comment as Comment;
        setCommentsData((prev) => ({
          ...prev,
          [postId]: (prev[postId] ?? []).map((c) => (c.id === commentId ? updated : c)),
        }));
      } else {
        setCommentsData((prev) => ({
          ...prev,
          [postId]: (prev[postId] ?? []).map((c) =>
            c.id === commentId ? { ...c, body: prevBody } : c
          ),
        }));
        setError(json.error ?? 'Failed to edit comment');
      }
    } catch {
      setCommentsData((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? []).map((c) =>
          c.id === commentId ? { ...c, body: prevBody } : c
        ),
      }));
      setError('Failed to edit comment');
    }
  };

  // Delete a comment — optimistic removal + count decrement, rollback on error.
  const handleDeleteComment = async (postId: string, commentId: string) => {
    const prevList = commentsData[postId] ?? [];
    const removed = prevList.find((c) => c.id === commentId);
    if (!removed) return;

    setCommentsData((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? []).filter((c) => c.id !== commentId),
    }));
    setRecentPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p
      )
    );

    try {
      const res = await fetch(`/api/social/posts/${postId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      const json = (await res.json()) as ApiEnvelope<{ id: string }>;
      if (!json.success) {
        setCommentsData((prev) => ({ ...prev, [postId]: prevList }));
        setRecentPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p
          )
        );
        setError(json.error ?? 'Failed to delete comment');
      }
    } catch {
      setCommentsData((prev) => ({ ...prev, [postId]: prevList }));
      setRecentPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p))
      );
      setError('Failed to delete comment');
    }
  };

  // Edit / delete own posts via PostCard's overflow menu.
  const handleOpenEdit = (postId: string) => {
    const target = recentPosts.find((p) => p.id === postId);
    if (target) setEditingPost(target);
  };

  const handlePostUpdated = (updated: PostCardData) => {
    setRecentPosts((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
    );
  };

  const handleDeletePost = (postId: string) => {
    setDeletingPostId(postId);
  };

  const confirmDeletePost = async () => {
    if (!deletingPostId || deleteBusy) return;
    const postId = deletingPostId;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/social/posts/${postId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setRecentPosts((prev) => prev.filter((p) => p.id !== postId));
        setStats((prev) => (prev ? { ...prev, postCount: Math.max(0, prev.postCount - 1) } : prev));
        setDeletingPostId(null);
      } else {
        setError(json.error ?? 'Failed to delete post');
      }
    } catch {
      setError('Failed to delete post');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] pb-24">
        <div className="max-w-lg mx-auto px-4 pt-6">
          <Link href="/community" className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] font-medium mb-6 hover:text-[#6B7F65]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <div className="text-center py-16">
            <p className="text-[#8B9B83] text-sm">{error ?? 'User not found'}</p>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24">
      {/* Header band */}
      <div className="bg-gradient-to-b from-[var(--accent)]/20 to-[#FAF9F6] pt-4 pb-2">
        <div className="max-w-lg mx-auto px-4">
          <Link
            href="/community"
            className="inline-flex items-center gap-1.5 text-sm text-[#6B7F65] font-medium mb-6 hover:text-[#4A5C44] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 -mt-2">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-2 font-bold text-red-400 hover:text-red-600"
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        )}

        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm overflow-hidden">
          <div className="p-6 text-center">
            <div className="flex justify-center mb-3">
              <Avatar name={profile.name} url={profile.avatar_url} size={80} />
            </div>
            <h1 className="text-lg font-bold text-[#2D352C]">{profile.name}</h1>
            {profile.role !== 'patient' && (
              <span className="inline-block mt-1 text-[10px] font-semibold text-[var(--accent)] bg-[#EEF1ED] px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                {profile.role.replace('_', ' ')}
              </span>
            )}

            {/* Stats row */}
            {stats && (
              <div className="flex justify-center gap-8 mt-5">
                <div className="text-center">
                  <p className="text-lg font-bold text-[#2D352C]">{stats.postCount}</p>
                  <p className="text-[10px] text-[#8B9B83] font-medium uppercase tracking-wide">Posts</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFollowModal('followers')}
                  className="text-center rounded-lg px-1 hover:bg-[#F5F7F4] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <p className="text-lg font-bold text-[#2D352C]">{stats.followerCount}</p>
                  <p className="text-[10px] text-[#8B9B83] font-medium uppercase tracking-wide">Followers</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFollowModal('following')}
                  className="text-center rounded-lg px-1 hover:bg-[#F5F7F4] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <p className="text-lg font-bold text-[#2D352C]">{stats.followingCount}</p>
                  <p className="text-[10px] text-[#8B9B83] font-medium uppercase tracking-wide">Following</p>
                </button>
              </div>
            )}

            {/* Follow + Message buttons */}
            {!isOwnProfile && (
              <div className="mt-5 flex justify-center gap-3">
                <button
                  onClick={handleFollow}
                  disabled={followLoading}
                  className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${
                    isFollowing
                      ? 'bg-[#F0F2EF] text-[#8B9B83] hover:bg-[#E5EAE3]'
                      : 'bg-[var(--accent)] text-white hover:bg-[var(--accent)]'
                  }`}
                >
                  {followLoading ? '...' : isFollowing ? 'Unfollow' : 'Follow'}
                </button>
                <Link
                  href={`/messages/${userId}`}
                  className="px-6 py-2.5 text-sm font-semibold rounded-xl bg-white border border-[var(--accent)] text-[#6B7F65] hover:bg-[#F0F4EE] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  aria-label={`Send message to ${profile.name}`}
                >
                  Message
                </Link>
              </div>
            )}

            {isOwnProfile && (
              <Link
                href="/profile"
                className="inline-block mt-5 px-8 py-2.5 text-sm font-semibold rounded-xl bg-[#F0F2EF] text-[#2D352C] hover:bg-[#E5EAE3] transition-colors"
              >
                Edit Profile
              </Link>
            )}
          </div>
        </div>

        {/* Public progress photos */}
        {progressPhotos.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-[#2D352C] mb-3 px-1">Progress Photos</h2>
            <div className="grid grid-cols-3 gap-2">
              {progressPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square overflow-hidden rounded-xl bg-[#EEF1ED] border border-[#E5EAE3]"
                >
                  {photo.photo_url ? (
                    // Signed Supabase URLs expire (5-min TTL) — render via a plain
                    // <img> so the optimizer never caches a stale link.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.photo_url}
                      alt={`Progress photo from ${timeAgo(photo.created_at)}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl">📸</div>
                  )}
                  {(photo.weight ?? 0) > 0 && (
                    <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {photo.weight} lbs
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent posts — fully interactive PostCards (like + comment + comment
            edit/delete/like), wired to the same endpoints as the main feed. */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-[#2D352C] mb-3 px-1">Recent Posts</h2>
          {recentPosts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-8 text-center">
              <p className="text-[#8B9B83] text-sm">No posts yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={user?.id}
                  onLike={handleLike}
                  onToggleComments={handleToggleComments}
                  showComments={!!expandedComments[post.id]}
                  comments={commentsData[post.id] ?? []}
                  commentsLoading={!!commentsLoading[post.id]}
                  onAddComment={handleAddComment}
                  newCommentText={commentTexts[post.id] ?? ''}
                  onCommentTextChange={(text) => handleCommentTextChange(post.id, text)}
                  onLikeComment={(commentId) => handleLikeComment(post.id, commentId)}
                  onEditComment={(commentId, body) => handleEditComment(post.id, commentId, body)}
                  onDeleteComment={(commentId) => handleDeleteComment(post.id, commentId)}
                  onReport={setReportingPostId}
                  onEdit={handleOpenEdit}
                  onDelete={handleDeletePost}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {followModal && (
        <FollowListModal
          userId={userId}
          mode={followModal}
          onClose={() => setFollowModal(null)}
        />
      )}

      {editingPost && (
        <EditPostModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={handlePostUpdated}
          onError={(msg) => setError(msg)}
        />
      )}

      {reportingPostId && (
        <ReportPostModal
          postId={reportingPostId}
          onClose={() => setReportingPostId(null)}
          onReported={() => setReportingPostId(null)}
          onError={(msg) => setError(msg)}
        />
      )}

      {deletingPostId && (
        <ConfirmDialog
          title="Delete post?"
          message="This post will be permanently removed. This action cannot be undone."
          confirmLabel="Delete"
          destructive
          busy={deleteBusy}
          onConfirm={confirmDeletePost}
          onCancel={() => setDeletingPostId(null)}
        />
      )}

      <BottomNav />
    </div>
  );
}
