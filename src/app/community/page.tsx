'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import BottomNav from '@/components/BottomNav';
import { Avatar } from '@/components/community/PostCard';
import NotificationBell from '@/components/community/NotificationBell';
import ReportPostModal from '@/components/community/ReportPostModal';
import EditPostModal from '@/components/community/EditPostModal';
import ConfirmDialog from '@/components/community/ConfirmDialog';
import {
  type PostCardData as Post,
  type PostComment as Comment,
} from '@/components/community/PostCard';
import FeedTab from '@/components/community/FeedTab';
import GroupsTab, {
  type CommunityGroup,
  type GroupForm,
} from '@/components/community/GroupsTab';
import DiscoverTab from '@/components/community/DiscoverTab';
import type {
  ApiEnvelope,
  SocialFeedData,
  SocialLikeData,
  SocialCommentsListData,
  SocialCommentCreateData,
  GroupsListData,
} from '@/lib/api-types';

type TabKey = 'feed' | 'groups' | 'discover';

export default function CommunityPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('feed');

  // Feed state
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedPage, setFeedPage] = useState(1);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Post creation
  const [postSubmitting, setPostSubmitting] = useState(false);

  // Search filters (client-side on already-fetched data)
  const [feedSearch, setFeedSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  // Reporting
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Editing
  const [editingPost, setEditingPost] = useState<Post | null>(null);

  // Deleting
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Comments
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentsData, setCommentsData] = useState<Record<string, Comment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState<Record<string, boolean>>({});
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});

  // Groups state
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupForm>({ name: '', description: '', slug: '' });
  const [groupCreating, setGroupCreating] = useState(false);

  // Discover state
  const [discoverPosts, setDiscoverPosts] = useState<Post[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  // Authors the viewer follows — drives the Follow/Following button state on
  // Discover cards (the follow endpoint toggles, so users need visible state).
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch feed
  const fetchFeed = useCallback(async (page: number, append: boolean) => {
    if (page === 1) setFeedLoading(true);
    else setLoadingMore(true);

    try {
      const res = await fetch(`/api/social/feed?scope=feed&page=${page}&limit=15`);
      const json = (await res.json()) as ApiEnvelope<SocialFeedData>;
      if (json.success && json.data) {
        const list = json.data.posts as Post[];
        setPosts((prev) => (append ? [...prev, ...list] : list));
        setFeedHasMore(json.data.hasMore);
      } else {
        setError(json.error ?? 'Failed to load feed');
      }
    } catch (err) {
      console.error('fetchFeed failed', err);
      setError('Failed to load feed');
    } finally {
      setFeedLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await fetch('/api/groups?limit=20&page=1');
      const json = (await res.json()) as ApiEnvelope<GroupsListData>;
      if (json.success && json.data) {
        setGroups(json.data.groups as CommunityGroup[]);
      } else {
        setError(json.error ?? 'Failed to load groups');
      }
    } catch (err) {
      console.error('fetchGroups failed', err);
      setError('Failed to load groups');
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  // Fetch discover (public posts)
  const fetchDiscover = useCallback(async () => {
    setDiscoverLoading(true);
    try {
      const res = await fetch('/api/social/feed?scope=discover&page=1&limit=20');
      const json = (await res.json()) as ApiEnvelope<SocialFeedData>;
      if (json.success && json.data) {
        // Server already scopes to public posts from other users.
        setDiscoverPosts(json.data.posts as Post[]);
      } else {
        setError(json.error ?? 'Failed to load discover');
      }
    } catch (err) {
      console.error('fetchDiscover failed', err);
      setError('Failed to load discover');
    } finally {
      setDiscoverLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'feed') {
      setFeedPage(1);
      fetchFeed(1, false);
      fetchGroups();
    } else if (activeTab === 'groups') {
      fetchGroups();
    } else if (activeTab === 'discover') {
      fetchDiscover();
    }
  }, [activeTab, isAuthenticated, fetchFeed, fetchGroups, fetchDiscover]);

  // Create post — called from PostComposer
  const handleCreatePost = async (input: {
    body: string;
    imageUrl: string | null;
    isPublic: boolean;
    targetId?: string;
  }) => {
    if (!input.body.trim() || postSubmitting) return;
    setPostSubmitting(true);
    try {
      const targetGroup = input.targetId
        ? groups.find((group) => group.id === input.targetId)
        : null;
      const payload: Record<string, unknown> = {
        body: input.body,
        type: targetGroup ? 'forum' : 'status',
        is_public: input.isPublic,
      };
      if (targetGroup) {
        payload.group_id = targetGroup.id;
        payload.title = input.body.trim().slice(0, 80);
      }
      if (input.imageUrl) payload.image_url = input.imageUrl;

      const res = await fetch('/api/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as ApiEnvelope<{ post: Post }>;
      if (json.success) {
        fetchFeed(1, false);
        if (targetGroup) {
          showToast(`Posted to ${targetGroup.name}`);
        }
      } else {
        setError(json.error ?? 'Failed to create post');
        // Signal failure so PostComposer keeps the user's draft text.
        throw new Error(json.error ?? 'Failed to create post');
      }
    } catch (err) {
      console.error('createPost failed', err);
      setError('Failed to create post');
      throw err instanceof Error ? err : new Error('Failed to create post');
    } finally {
      setPostSubmitting(false);
    }
  };

  // Like — optimistic with rollback (no second roundtrip needed; we just
  // flip the local state and fall back to the server's count on success).
  const handleLike = async (postId: string) => {
    const target = posts.find((p) => p.id === postId) ?? discoverPosts.find((p) => p.id === postId);
    const wasLiked = target?.liked ?? false;

    const optimistic = (prev: Post[]) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              liked: !wasLiked,
              likes_count: p.likes_count + (wasLiked ? -1 : 1),
            }
          : p
      );

    setPosts(optimistic);
    setDiscoverPosts(optimistic);

    try {
      const res = await fetch(`/api/social/posts/${postId}/like`, { method: 'POST' });
      const json = (await res.json()) as ApiEnvelope<SocialLikeData>;
      if (json.success && json.data) {
        const apply = (prev: Post[]) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, liked: json.data!.liked, likes_count: json.data!.likesCount }
              : p
          );
        setPosts(apply);
        setDiscoverPosts(apply);
      } else {
        const rollback = (prev: Post[]) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  liked: wasLiked,
                  likes_count: p.likes_count + (wasLiked ? 1 : -1),
                }
              : p
          );
        setPosts(rollback);
        setDiscoverPosts(rollback);
        setError(json.error ?? 'Failed to update like');
      }
    } catch (err) {
      console.error('like failed', err);
      const rollback = (prev: Post[]) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                liked: wasLiked,
                likes_count: p.likes_count + (wasLiked ? 1 : -1),
              }
            : p
        );
      setPosts(rollback);
      setDiscoverPosts(rollback);
      setError('Failed to update like');
    }
  };

  // Toggle comments
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
      } catch (err) {
        console.error('comments fetch failed', err);
        setError('Failed to load comments');
      } finally {
        setCommentsLoading((prev) => ({ ...prev, [postId]: false }));
      }
    }
  };

  // Add comment
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
        const updateCount = (prev: Post[]) =>
          prev.map((p) =>
            p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p
          );
        setPosts(updateCount);
        setDiscoverPosts(updateCount);
      } else {
        setError(json.error ?? 'Failed to add comment');
      }
    } catch (err) {
      console.error('addComment failed', err);
      setError('Failed to add comment');
    }
  };

  const handleCommentTextChange = useCallback((postId: string, text: string) => {
    setCommentTexts((prev) => ({ ...prev, [postId]: text }));
  }, []);

  // Like a comment — optimistic flip with rollback, mirroring handleLike.
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
      const res = await fetch(
        `/api/social/posts/${postId}/comments/${commentId}/like`,
        { method: 'POST' }
      );
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
    } catch (err) {
      console.error('likeComment failed', err);
      flip(wasLiked ? 1 : -1, wasLiked);
      setError('Failed to update like');
    }
  };

  // Edit a comment — optimistic body swap with rollback.
  const handleEditComment = async (postId: string, commentId: string, body: string) => {
    const text = body.trim();
    if (!text) return;
    const prevComment = (commentsData[postId] ?? []).find((c) => c.id === commentId);
    const prevBody = prevComment?.body ?? '';

    setCommentsData((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? []).map((c) =>
        c.id === commentId ? { ...c, body: text } : c
      ),
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
    } catch (err) {
      console.error('editComment failed', err);
      setCommentsData((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? []).map((c) =>
          c.id === commentId ? { ...c, body: prevBody } : c
        ),
      }));
      setError('Failed to edit comment');
    }
  };

  // Delete a comment — optimistic removal + comment-count decrement, rollback
  // on failure.
  const handleDeleteComment = async (postId: string, commentId: string) => {
    const prevList = commentsData[postId] ?? [];
    const removed = prevList.find((c) => c.id === commentId);
    if (!removed) return;

    setCommentsData((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? []).filter((c) => c.id !== commentId),
    }));
    const decCount = (prev: Post[]) =>
      prev.map((p) =>
        p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p
      );
    setPosts(decCount);
    setDiscoverPosts(decCount);

    try {
      const res = await fetch(`/api/social/posts/${postId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      const json = (await res.json()) as ApiEnvelope<{ id: string }>;
      if (!json.success) {
        setCommentsData((prev) => ({ ...prev, [postId]: prevList }));
        const incCount = (p2: Post[]) =>
          p2.map((p) =>
            p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p
          );
        setPosts(incCount);
        setDiscoverPosts(incCount);
        setError(json.error ?? 'Failed to delete comment');
      }
    } catch (err) {
      console.error('deleteComment failed', err);
      setCommentsData((prev) => ({ ...prev, [postId]: prevList }));
      const incCount = (p2: Post[]) =>
        p2.map((p) => (p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p));
      setPosts(incCount);
      setDiscoverPosts(incCount);
      setError('Failed to delete comment');
    }
  };

  // Follow user
  const handleFollow = async (userId: string) => {
    setFollowLoading(true);
    try {
      const res = await fetch(`/api/social/users/${userId}/follow`, { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as ApiEnvelope<{ following: boolean }>;
      if (!res.ok) {
        setError(json.error ?? 'Failed to follow user');
        return;
      }
      // The endpoint toggles — reflect the returned state so the button reads
      // "Following" and a second click is a deliberate unfollow, not a mystery.
      const nowFollowing = json.data?.following ?? true;
      setFollowedIds((prev) => {
        const next = new Set(prev);
        if (nowFollowing) next.add(userId);
        else next.delete(userId);
        return next;
      });
      showToast(nowFollowing ? 'Following' : 'Unfollowed');
    } catch (err) {
      console.error('follow failed', err);
      setError('Failed to follow user');
    } finally {
      setFollowLoading(false);
    }
  };

  // Toast helper — auto-dismisses after 2.5s
  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  // Report post
  const handleOpenReport = (postId: string) => {
    setReportingPostId(postId);
  };

  // Edit post — open the modal pre-filled with the post being edited.
  const handleOpenEdit = (postId: string) => {
    const target = posts.find((p) => p.id === postId);
    if (target) setEditingPost(target);
  };

  // Apply an edited post into both feeds.
  const handlePostUpdated = (updated: Post) => {
    const apply = (prev: Post[]) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p));
    setPosts(apply);
    setDiscoverPosts(apply);
    showToast('Post updated');
  };

  // Delete post — open the styled confirm dialog; the actual delete runs on
  // confirm.
  const handleDeletePost = (postId: string) => {
    setDeletingPostId(postId);
  };

  const confirmDeletePost = async () => {
    if (!deletingPostId || deleteBusy) return;
    const postId = deletingPostId;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/social/posts/${postId}`, { method: 'DELETE' });
      const json = (await res.json()) as ApiEnvelope<{ id: string }>;
      if (json.success) {
        const remove = (prev: Post[]) => prev.filter((p) => p.id !== postId);
        setPosts(remove);
        setDiscoverPosts(remove);
        showToast('Post deleted');
        setDeletingPostId(null);
      } else {
        setError(json.error ?? 'Failed to delete post');
      }
    } catch (err) {
      console.error('deletePost failed', err);
      setError('Failed to delete post');
    } finally {
      setDeleteBusy(false);
    }
  };

  // Create group
  const handleCreateGroup = async () => {
    if (!groupForm.name.trim() || groupCreating) return;
    setGroupCreating(true);
    try {
      const slug =
        groupForm.slug.trim() ||
        groupForm.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupForm.name.trim(),
          description: groupForm.description.trim(),
          slug,
        }),
      });
      const json = (await res.json()) as ApiEnvelope<unknown>;
      if (json.success) {
        setGroupForm({ name: '', description: '', slug: '' });
        setShowCreateGroup(false);
        fetchGroups();
      } else {
        setError(json.error ?? 'Failed to create group');
      }
    } catch (err) {
      console.error('createGroup failed', err);
      setError('Failed to create group');
    } finally {
      setGroupCreating(false);
    }
  };

  // Load more
  const handleLoadMore = () => {
    const next = feedPage + 1;
    setFeedPage(next);
    fetchFeed(next, true);
  };

  // Client-side search filters
  const filteredPosts = useMemo(() => {
    const q = feedSearch.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter(
      (p) =>
        p.body.toLowerCase().includes(q) ||
        (p.title?.toLowerCase().includes(q) ?? false)
    );
  }, [posts, feedSearch]);

  // Discover intentionally does NOT filter by feedSearch — that input only
  // exists on the Feed tab, so a leftover Feed search term would silently
  // blank Discover with no visible way to clear it.
  const filteredDiscoverPosts = discoverPosts;

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q)
    );
  }, [groups, groupSearch]);

  const postTargets = useMemo(
    () =>
      groups
        .filter((group) => group.is_member)
        .map((group) => ({ id: group.id, label: `Group: ${group.name}` })),
    [groups]
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'feed', label: 'Feed' },
    { key: 'groups', label: 'Groups' },
    { key: 'discover', label: 'Discover' },
  ];

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#E5EAE3]">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-[#2D352C]">Community</h1>
            <div className="flex items-center gap-2">
              <NotificationBell />
              {user?.id && (
                <Link
                  href={`/community/users/${user.id}`}
                  className="flex items-center gap-2 rounded-full border border-[#E5EAE3] bg-white pl-1 pr-3 py-1 text-xs font-semibold text-[#2D352C] shadow-sm hover:border-[var(--accent)] transition-colors"
                  aria-label="Go to my community profile"
                >
                  <Avatar name={user.name ?? 'You'} url={user.avatarUrl ?? undefined} size={26} />
                  My Profile
                </Link>
              )}
            </div>
          </div>

          <div className="flex gap-0.5 bg-[#F0F2EF] rounded-xl p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-all ${
                  activeTab === tab.key
                    ? 'bg-white text-[#2D352C] shadow-sm'
                    : 'text-[#8B9B83] hover:text-[#6B7F65]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-4">
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

        {activeTab === 'feed' && (
          <FeedTab
            authorName={user?.name ?? 'You'}
            authorAvatarUrl={user?.avatarUrl ?? null}
            postSubmitting={postSubmitting}
            feedSearch={feedSearch}
            filteredPosts={filteredPosts}
            feedLoading={feedLoading}
            feedHasMore={feedHasMore}
            loadingMore={loadingMore}
            expandedComments={expandedComments}
            commentsData={commentsData}
            commentsLoading={commentsLoading}
            commentTexts={commentTexts}
            currentUserId={user?.id}
            postTargets={postTargets}
            onChangeSearch={setFeedSearch}
            onCreatePost={handleCreatePost}
            onError={setError}
            onLike={handleLike}
            onToggleComments={handleToggleComments}
            onAddComment={handleAddComment}
            onCommentTextChange={handleCommentTextChange}
            onLikeComment={handleLikeComment}
            onEditComment={handleEditComment}
            onDeleteComment={handleDeleteComment}
            onReport={handleOpenReport}
            onEdit={handleOpenEdit}
            onDelete={handleDeletePost}
            onLoadMore={handleLoadMore}
          />
        )}

        {activeTab === 'groups' && (
          <GroupsTab
            groupSearch={groupSearch}
            showCreateGroup={showCreateGroup}
            groupForm={groupForm}
            groupCreating={groupCreating}
            groupsLoading={groupsLoading}
            filteredGroups={filteredGroups}
            onChangeSearch={setGroupSearch}
            onToggleCreate={() => setShowCreateGroup((v) => !v)}
            onChangeForm={setGroupForm}
            onCreateGroup={handleCreateGroup}
          />
        )}

        {activeTab === 'discover' && (
          <DiscoverTab
            feedSearch=""
            filteredDiscoverPosts={filteredDiscoverPosts}
            discoverLoading={discoverLoading}
            expandedComments={expandedComments}
            commentsData={commentsData}
            commentsLoading={commentsLoading}
            commentTexts={commentTexts}
            followLoading={followLoading}
            currentUserId={user?.id}
            onLike={handleLike}
            onToggleComments={handleToggleComments}
            onAddComment={handleAddComment}
            onCommentTextChange={handleCommentTextChange}
            onLikeComment={handleLikeComment}
            onEditComment={handleEditComment}
            onDeleteComment={handleDeleteComment}
            onFollow={handleFollow}
            followedIds={followedIds}
            onReport={handleOpenReport}
          />
        )}
      </main>

      {reportingPostId && (
        <ReportPostModal
          postId={reportingPostId}
          onClose={() => setReportingPostId(null)}
          onReported={(msg) => showToast(msg)}
          onError={(msg) => setError(msg)}
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

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#2D352C] text-white text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
