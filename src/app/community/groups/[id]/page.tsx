'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import BottomNav from '@/components/BottomNav';
import EditPostModal from '@/components/community/EditPostModal';
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

interface Author {
  id: string;
  name: string;
  avatar_url?: string;
}

interface GroupData {
  id: string;
  name: string;
  description: string;
  slug: string;
  member_count: number;
  created_at: string;
}

interface Member {
  role: string;
  profiles?: Author;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [group, setGroup] = useState<GroupData | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);

  const [posts, setPosts] = useState<PostCardData[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [postsPage, setPostsPage] = useState(1);

  // Comments
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentsData, setCommentsData] = useState<Record<string, Comment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState<Record<string, boolean>>({});
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostBody, setNewPostBody] = useState('');
  const [newPostIsPublic, setNewPostIsPublic] = useState(false);
  const [newPostImageFile, setNewPostImageFile] = useState<File | null>(null);
  const [newPostImagePreview, setNewPostImagePreview] = useState<string | null>(null);
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [joinLoading, setJoinLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit / delete own posts
  const [editingPost, setEditingPost] = useState<PostCardData | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch group details
  const fetchGroup = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}`);
      const json = await res.json();
      if (json.success) {
        setGroup(json.data.group);
        setIsMember(json.data.isMember);
      } else {
        setError(json.error ?? 'Group not found');
      }
    } catch {
      setError('Failed to load group');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  // Fetch posts. The group-posts endpoint does not embed the viewer's like
  // state, so we hydrate `liked` from /api/social/posts/liked for the fetched
  // page — otherwise an already-liked post would render as unliked and the
  // first tap would toggle it OFF.
  const fetchPosts = useCallback(
    async (page: number, append: boolean) => {
      setPostsLoading(true);
      try {
        const res = await fetch(`/api/groups/${groupId}/posts?page=${page}&limit=15`);
        const json = await res.json();
        if (json.success) {
          const list = (json.data.posts as PostCardData[]).map((p) => ({
            ...p,
            liked: false,
          }));

          const ids = list.map((p) => p.id);
          let likedSet = new Set<string>();
          if (ids.length > 0) {
            try {
              const likedRes = await fetch(
                `/api/social/posts/liked?ids=${encodeURIComponent(ids.join(','))}`
              );
              const likedJson = (await likedRes.json()) as ApiEnvelope<{
                likedPostIds: string[];
              }>;
              if (likedJson.success && likedJson.data) {
                likedSet = new Set(likedJson.data.likedPostIds);
              }
            } catch {
              // Non-fatal: fall back to liked=false.
            }
          }

          const hydrated = list.map((p) => ({ ...p, liked: likedSet.has(p.id) }));
          setPosts((prev) => (append ? [...prev, ...hydrated] : hydrated));
          setPostsHasMore(json.data.hasMore);
        }
      } catch {
        // silent
      } finally {
        setPostsLoading(false);
      }
    },
    [groupId]
  );

  // Fetch members
  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/members?page=1&limit=50`);
      const json = await res.json();
      if (json.success) {
        setMembers(json.data.members);
      }
    } catch {
      // silent
    } finally {
      setMembersLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (!isAuthenticated || !groupId) return;

    const timer = window.setTimeout(() => {
      fetchGroup();
      fetchPosts(1, false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isAuthenticated, groupId, fetchGroup, fetchPosts]);

  useEffect(() => {
    return () => {
      if (newPostImagePreview) URL.revokeObjectURL(newPostImagePreview);
    };
  }, [newPostImagePreview]);

  // Join / Leave
  const handleJoinLeave = async () => {
    setJoinLoading(true);
    try {
      const method = isMember ? 'DELETE' : 'POST';
      const res = await fetch(`/api/groups/${groupId}/members`, { method });
      const json = await res.json();
      if (json.success) {
        setIsMember(!isMember);
        fetchGroup();
      } else {
        setError(json.error ?? 'Action failed');
      }
    } catch {
      setError('Action failed');
    } finally {
      setJoinLoading(false);
    }
  };

  function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image exceeds 5MB limit');
      e.target.value = '';
      return;
    }

    if (newPostImagePreview) URL.revokeObjectURL(newPostImagePreview);
    setNewPostImageFile(file);
    setNewPostImagePreview(URL.createObjectURL(file));
  }

  function clearNewPostImage() {
    if (newPostImagePreview) URL.revokeObjectURL(newPostImagePreview);
    setNewPostImageFile(null);
    setNewPostImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function uploadPostImage(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('image', file);

    const res = await fetch('/api/social/posts/upload', { method: 'POST', body: fd });
    const json = (await res.json()) as {
      success: boolean;
      data?: { url?: string };
      error?: string;
    };

    if (!json.success || !json.data?.url) {
      setError(json.error ?? 'Failed to upload image');
      return null;
    }

    return json.data.url;
  }

  // Create post
  const handleCreatePost = async () => {
    if (!newPostTitle.trim() || !newPostBody.trim() || postSubmitting || imageUploading) return;
    setPostSubmitting(true);
    try {
      let imageUrl: string | null = null;
      if (newPostImageFile) {
        setImageUploading(true);
        imageUrl = await uploadPostImage(newPostImageFile);
        setImageUploading(false);
        if (!imageUrl) return;
      }

      const payload: Record<string, unknown> = {
        title: newPostTitle.trim(),
        body: newPostBody.trim(),
        type: 'forum',
        is_public: newPostIsPublic,
      };
      if (imageUrl) payload.image_url = imageUrl;

      const res = await fetch(`/api/groups/${groupId}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setNewPostTitle('');
        setNewPostBody('');
        setNewPostIsPublic(false);
        clearNewPostImage();
        setShowNewPost(false);
        fetchPosts(1, false);
      } else {
        setError(json.error ?? 'Failed to create post');
      }
    } catch {
      setError('Failed to create post');
    } finally {
      setImageUploading(false);
      setPostSubmitting(false);
    }
  };

  // Toggle members
  const handleToggleMembers = () => {
    if (!showMembers && members.length === 0) {
      fetchMembers();
    }
    setShowMembers(!showMembers);
  };

  // Like — optimistic with rollback (mirrors community/page.tsx).
  const handleLike = async (postId: string) => {
    const target = posts.find((p) => p.id === postId);
    const wasLiked = target?.liked ?? false;

    const optimistic = (prev: PostCardData[]) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, liked: !wasLiked, likes_count: p.likes_count + (wasLiked ? -1 : 1) }
          : p
      );
    setPosts(optimistic);

    try {
      const res = await fetch(`/api/social/posts/${postId}/like`, { method: 'POST' });
      const json = (await res.json()) as ApiEnvelope<SocialLikeData>;
      if (json.success && json.data) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, liked: json.data!.liked, likes_count: json.data!.likesCount }
              : p
          )
        );
      } else {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, liked: wasLiked, likes_count: p.likes_count + (wasLiked ? 1 : -1) }
              : p
          )
        );
        setError(json.error ?? 'Failed to update like');
      }
    } catch {
      setPosts((prev) =>
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
        setPosts((prev) =>
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
    setPosts((prev) =>
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
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p
          )
        );
        setError(json.error ?? 'Failed to delete comment');
      }
    } catch {
      setCommentsData((prev) => ({ ...prev, [postId]: prevList }));
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p))
      );
      setError('Failed to delete comment');
    }
  };

  const handleOpenEdit = (postId: string) => {
    const target = posts.find((p) => p.id === postId);
    if (target) setEditingPost(target);
  };

  // Delete own post — opens the styled confirm dialog; the actual delete reuses
  // the shared /api/social/posts/[id] endpoint (group discussions live in the
  // same posts table).
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
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        setDeletingPostId(null);
      } else {
        setError(json.error ?? 'Failed to delete discussion');
      }
    } catch {
      setError('Failed to delete discussion');
    } finally {
      setDeleteBusy(false);
    }
  };

  // Merge an edited post back into the list.
  const handlePostUpdated = (updated: PostCardData) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (!group) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] pb-24">
        <div className="max-w-lg mx-auto px-4 pt-6">
          <Link href="/community" className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] font-medium mb-6 hover:text-[#6B7F65]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Community
          </Link>
          <div className="text-center py-16">
            <p className="text-[#8B9B83] text-sm">Group not found</p>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24">
      {/* Header */}
      <header className="bg-white border-b border-[#E5EAE3]">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-5">
          <Link
            href="/community"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] font-medium mb-4 hover:text-[#6B7F65] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Community
          </Link>

          {/* Group info card */}
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #8FA888 0%, #6B7F65 100%)' }}
            >
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-[#2D352C]">{group.name}</h1>
              <p className="text-xs text-[#8B9B83] mt-1 leading-relaxed">{group.description}</p>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={handleToggleMembers}
                  className="text-[11px] font-medium text-[var(--accent)] bg-[#EEF1ED] px-2.5 py-1 rounded-full hover:bg-[#DEE4DB] transition-colors"
                >
                  {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
                </button>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleJoinLeave}
              disabled={joinLoading}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 ${
                isMember
                  ? 'bg-[#F0F2EF] text-[#8B9B83] hover:bg-[#E5EAE3]'
                  : 'bg-[var(--accent)] text-white hover:bg-[var(--accent)]'
              }`}
            >
              {joinLoading ? '...' : isMember ? 'Leave Group' : 'Join Group'}
            </button>
            {isMember && (
              <button
                onClick={() => setShowNewPost(!showNewPost)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-xl bg-[#2D352C] text-white hover:bg-[#1F261E] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showNewPost ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'} />
                </svg>
                {showNewPost ? 'Cancel' : 'New Discussion'}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 font-bold text-red-400 hover:text-red-600">&times;</button>
          </div>
        )}

        {/* Members section (expandable) */}
        {showMembers && (
          <div className="mb-4 bg-white rounded-2xl border border-[#E5EAE3] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#F0F2EF]">
              <h3 className="text-sm font-semibold text-[#2D352C]">Members</h3>
            </div>
            <div className="p-4">
              {membersLoading ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : members.length === 0 ? (
                <p className="text-xs text-[#8B9B83] text-center py-2">No members yet</p>
              ) : (
                <div className="space-y-3">
                  {members.map((m, i) => (
                    <div key={m.profiles?.id ?? i} className="flex items-center gap-3">
                      <Avatar name={m.profiles?.name ?? 'User'} url={m.profiles?.avatar_url} size={32} />
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/community/users/${m.profiles?.id}`}
                          className="text-sm font-medium text-[#2D352C] hover:underline"
                        >
                          {m.profiles?.name ?? 'User'}
                        </Link>
                      </div>
                      {m.role === 'admin' && (
                        <span className="text-[10px] font-semibold text-[var(--accent)] bg-[#EEF1ED] px-2 py-0.5 rounded-full uppercase tracking-wide">
                          Admin
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* New post form */}
        {showNewPost && isMember && (
          <div className="mb-4 bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[#2D352C]">Start a Discussion</h3>
            <input
              type="text"
              value={newPostTitle}
              onChange={(e) => setNewPostTitle(e.target.value)}
              placeholder="Discussion title"
              className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#E5EAE3] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] placeholder:text-[var(--accent)]"
            />
            <textarea
              value={newPostBody}
              onChange={(e) => setNewPostBody(e.target.value)}
              placeholder="Share your thoughts..."
              rows={4}
              className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#E5EAE3] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] placeholder:text-[var(--accent)] resize-none"
            />
            {newPostImagePreview && (
              <div className="relative rounded-xl overflow-hidden border border-[#E5EAE3]">
                <Image
                  src={newPostImagePreview}
                  alt="Selected"
                  width={600}
                  height={400}
                  unoptimized
                  className="w-full max-h-72 object-cover"
                />
                <button
                  type="button"
                  onClick={clearNewPostImage}
                  aria-label="Remove image"
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-sm flex items-center justify-center hover:bg-black/80"
                >
                  &times;
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handlePickImage}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageUploading || postSubmitting}
                aria-label="Add photo"
                className="p-2 rounded-lg text-[var(--accent)] hover:bg-[#EEF1ED] transition-colors disabled:opacity-40"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setNewPostIsPublic((v) => !v)}
                aria-pressed={newPostIsPublic}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  newPostIsPublic
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-white text-[#6B7F65] border-[#E5EAE3] hover:border-[var(--accent)]/50'
                }`}
              >
                {newPostIsPublic ? 'Public' : 'Group only'}
              </button>
              <div className="flex-1" />
            </div>
            <button
              onClick={handleCreatePost}
              disabled={!newPostTitle.trim() || !newPostBody.trim() || postSubmitting || imageUploading}
              className="w-full py-2.5 bg-[var(--accent)] text-white text-sm font-semibold rounded-xl hover:bg-[var(--accent)] transition-colors disabled:opacity-40"
            >
              {imageUploading ? 'Uploading...' : postSubmitting ? 'Posting...' : 'Post Discussion'}
            </button>
          </div>
        )}

        {/* Posts */}
        <div className="space-y-3">
          {postsLoading && posts.length === 0 ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#EEF1ED] flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </div>
              <p className="text-[#8B9B83] text-sm font-medium">No discussions yet</p>
              <p className="text-[var(--accent)] text-xs mt-1">
                {isMember ? 'Start the first discussion!' : 'Join to participate'}
              </p>
            </div>
          ) : (
            <>
              {posts.map((post) => (
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
                  onEdit={handleOpenEdit}
                  onDelete={handleDeletePost}
                />
              ))}

              {postsHasMore && (
                <button
                  onClick={() => {
                    const next = postsPage + 1;
                    setPostsPage(next);
                    fetchPosts(next, true);
                  }}
                  disabled={postsLoading}
                  className="w-full py-3 text-sm font-semibold text-[var(--accent)] bg-white rounded-2xl border border-[#E5EAE3] hover:bg-[#F5F7F4] transition-colors disabled:opacity-50"
                >
                  {postsLoading ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      </main>

      {editingPost && (
        <EditPostModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={handlePostUpdated}
          onError={(msg) => setError(msg)}
        />
      )}

      {deletingPostId && (
        <ConfirmDialog
          title="Delete discussion?"
          message="This discussion will be permanently removed. This action cannot be undone."
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
