'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useOrganization } from '@/lib/organization-context';
import BottomNav from '@/components/BottomNav';
import BrandLogo from '@/components/BrandLogo';
import ProfilePostsTab, {
  type ProfilePost,
  type ProfilePostComment,
} from '@/components/profile/ProfilePostsTab';
import EditPostModal from '@/components/community/EditPostModal';
import ConfirmDialog from '@/components/community/ConfirmDialog';
import { type PostCardData } from '@/components/community/PostCard';
import ProfileProgressTab, {
  type ProfileProgressPhoto,
} from '@/components/profile/ProfileProgressTab';
import ProfilePurchasesTab, {
  type ProfileSubscription,
} from '@/components/profile/ProfilePurchasesTab';
import ProfileMessagesPanel, {
  type ProfileConversation,
} from '@/components/profile/ProfileMessagesPanel';
import ProfileAiPreferencesCard from '@/components/profile/ProfileAiPreferencesCard';
import ProfileHeaderCard, {
  ProfileSkeletonCard,
} from '@/components/profile/ProfileHeaderCard';
import ProfileMenuList from '@/components/profile/ProfileMenuList';
import type {
  ApiEnvelope,
  SocialLikeData,
  SocialPostsListData,
  SocialCommentsListData,
  SocialCommentCreateData,
} from '@/lib/api-types';

interface PatientProfile {
  current_weight?: number;
  target_weight?: number;
  starting_weight?: number;
  medication_type?: string;
}

// PUT /api/patient/profile returns the updated row directly as `data`.
interface PatientProfilePutRow {
  current_weight?: number | null;
  target_weight?: number | null;
  starting_weight?: number | null;
}

interface AuthProfile {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  role: string;
  created_at?: string;
  ai_personalization_consent?: boolean;
  ai_personalization_consent_at?: string | null;
  sleep_hours_avg?: number | null;
}

interface AuthProfileResponse {
  profile?: AuthProfile;
  patientProfile?: PatientProfile;
}

interface InboxResponse {
  conversations?: ProfileConversation[];
  total_unread?: number;
}

interface ProgressPhotosResponse {
  data?: ProfileProgressPhoto[];
}

interface SubscriptionResponse {
  subscription?: ProfileSubscription;
  active?: boolean;
}

export default function ProfilePage() {
  // useSearchParams needs a Suspense boundary in Next 15.
  return (
    <Suspense fallback={null}>
      <ProfilePageInner />
    </Suspense>
  );
}

function ProfilePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading, logout, refreshUser } = useAuth();
  const { organization } = useOrganization();

  // Deep-link a tab via ?tab= (e.g. "Manage plan" on the Shop → the Purchases
  // tab where the plan + cancel live, instead of dumping the member on the
  // default Posts feed, which read as landing on "home").
  const [activeTab, setActiveTab] = useState<'posts' | 'progress' | 'purchases'>(
    () => {
      const t = searchParams.get('tab');
      return t === 'purchases' || t === 'progress' || t === 'posts' ? t : 'posts';
    }
  );

  // Data states
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [editingPost, setEditingPost] = useState<ProfilePost | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [progressPhotos, setProgressPhotos] = useState<ProfileProgressPhoto[]>([]);
  const [weightLog, setWeightLog] = useState<
    { id: string; weight_lbs: number; recorded_on: string }[]
  >([]);
  // Dedicated loading/error/retry state for the Weight Graph's own data source,
  // so it never renders an empty box while its fetch is still pending or failed.
  const [weightLoading, setWeightLoading] = useState(true);
  const [weightError, setWeightError] = useState(false);
  const [weightReloadKey, setWeightReloadKey] = useState(0);
  const [weightInput, setWeightInput] = useState('');
  const [weightSubmitting, setWeightSubmitting] = useState(false);
  const [subscription, setSubscription] = useState<ProfileSubscription | null>(null);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [conversations, setConversations] = useState<ProfileConversation[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);

  // Loading states
  const [dataLoading, setDataLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);

  const [postSubmitting, setPostSubmitting] = useState(false);

  // Error banner state
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // AI personalization opt-in state. Mirrors profile.ai_personalization_consent.
  const [aiConsent, setAiConsent] = useState(false);
  const [aiConsentSaving, setAiConsentSaving] = useState(false);

  // Like state tracking (optimistic)
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});

  // Avatar upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const progressFileInputRef = useRef<HTMLInputElement | null>(null);
  const [progressUploading, setProgressUploading] = useState(false);
  // Optional caption for the next progress-photo upload.
  const [progressCaption, setProgressCaption] = useState('');

  // Goal (target weight) editor
  const [goalEditing, setGoalEditing] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [startingInput, setStartingInput] = useState('');

  // Comments expansion
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentsData, setCommentsData] = useState<Record<string, ProfilePostComment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState<Record<string, boolean>>({});
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  // Inline comment-edit drafts, keyed by commentId.
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  const fetchPosts = useCallback(async (userId: string) => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/social/posts?userId=${userId}&page=1&limit=10`);
      if (res.ok) {
        const json = (await res.json()) as ApiEnvelope<SocialPostsListData>;
        const payload = json.data ?? { posts: [], hasMore: false };
        const list = (payload.posts ?? []) as ProfilePost[];
        setPosts(list);
        const liked: Record<string, boolean> = {};
        const counts: Record<string, number> = {};
        for (const p of list) {
          liked[p.id] = p.liked_by_user ?? false;
          counts[p.id] = p.likes_count ?? 0;
        }
        setLikedPosts(liked);
        setLikeCounts(counts);
      } else {
        setErrorBanner('Failed to load posts. Please try again.');
      }
    } catch (err) {
      console.error('fetchPosts failed', err);
      setErrorBanner('Failed to load posts. Please try again.');
    } finally {
      setPostsLoading(false);
    }
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load the user's daily weight entries for the Weight Graph. Tracks its OWN
  // loading/error state: the graph must gate on THIS fetch, not the unrelated
  // profile batch below. Previously the graph was gated on `dataLoading`, so
  // when that batch resolved before (or the weight fetch failed silently) the
  // chart rendered an empty box even though entries existed — the reported bug.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setWeightLoading(true);
      setWeightError(false);
      try {
        const r = await fetch('/api/patient/weight');
        const j = r.ok ? await r.json() : null;
        if (cancelled) return;
        if (j?.success) {
          setWeightLog(
            (j.data.entries ?? []) as { id: string; weight_lbs: number; recorded_on: string }[]
          );
        } else {
          setWeightError(true);
        }
      } catch {
        if (!cancelled) setWeightError(true);
      } finally {
        if (!cancelled) setWeightLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, weightReloadKey]);

  // Fetch all data on mount. Posts come through fetchPosts() to avoid a
  // double-fetch and to keep the like/count maps in sync.
  useEffect(() => {
    if (!user) return;

    const fetchAllData = async () => {
      setDataLoading(true);
      const [profileRes, photosRes, subRes, msgsRes] = await Promise.allSettled([
        fetch('/api/auth/profile'),
        fetch('/api/patient/progress-photos'),
        fetch('/api/payments/subscription'),
        fetch('/api/messages'),
      ]);

      // Messages
      if (msgsRes.status === 'fulfilled' && msgsRes.value.ok) {
        try {
          const json = (await msgsRes.value.json()) as ApiEnvelope<InboxResponse> | InboxResponse;
          const payload =
            'data' in json && json.data ? json.data : (json as InboxResponse);
          setConversations((payload.conversations ?? []).slice(0, 3));
          setTotalUnread(payload.total_unread ?? 0);
        } catch (err) {
          console.error('messages parse failed', err);
        }
      }

      // Profile
      if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
        try {
          const json = (await profileRes.value.json()) as
            | ApiEnvelope<AuthProfileResponse>
            | AuthProfileResponse;
          const payload =
            'data' in json && json.data ? json.data : (json as AuthProfileResponse);
          if (payload.profile) {
            setProfile(payload.profile);
            setAiConsent(Boolean(payload.profile.ai_personalization_consent));
          }
          if (payload.patientProfile) setPatientProfile(payload.patientProfile);
        } catch (err) {
          console.error('profile parse failed', err);
        }
      }

      // Progress photos
      if (photosRes.status === 'fulfilled' && photosRes.value.ok) {
        try {
          const data = (await photosRes.value.json()) as ProgressPhotosResponse;
          setProgressPhotos(Array.isArray(data.data) ? data.data : []);
        } catch (err) {
          console.error('photos parse failed', err);
        }
      }

      // Subscription
      if (subRes.status === 'fulfilled' && subRes.value.ok) {
        try {
          const data = (await subRes.value.json()) as SubscriptionResponse;
          if (data.subscription) setSubscription(data.subscription);
          setSubscriptionActive(data.active ?? false);
        } catch (err) {
          console.error('subscription parse failed', err);
        }
      }

      setDataLoading(false);

      // Posts: kick off via fetchPosts so liked/count maps stay in sync.
      // No await — runs in parallel with the loading state turning off.
      fetchPosts(user.id);
    };

    fetchAllData();
    // Key on user.id, NOT the whole user object: refreshUser() (fired after an
    // avatar upload to sync the community header) returns a new object
    // reference, and depending on `user` re-ran this whole loader — flashing
    // the entire page back to skeletons for ~2.5s. The id is stable across
    // that refresh, so keying on it keeps the avatar update seamless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, fetchPosts]);

  // Create post
  const handleCreatePost = async (input: {
    body: string;
    imageUrl: string | null;
    isPublic: boolean;
  }) => {
    if (!input.body.trim() || postSubmitting || !user) return;
    setPostSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        body: input.body.trim(),
        type: 'status',
        is_public: input.isPublic,
      };
      if (input.imageUrl) payload.image_url = input.imageUrl;

      const res = await fetch('/api/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await fetchPosts(user.id);
      } else {
        const json = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null;
        setErrorBanner(json?.error ?? 'Failed to create post. Please try again.');
        // Signal failure so PostComposer keeps the user's draft.
        throw new Error('create failed');
      }
    } catch (err) {
      console.error('createPost failed', err);
      setErrorBanner('Failed to create post. Please try again.');
      throw err instanceof Error ? err : new Error('create failed');
    } finally {
      setPostSubmitting(false);
    }
  };

  // Like post — optimistic with rollback.
  // Reflect an edited post back into the list (body / privacy / image).
  const handlePostSaved = (updated: PostCardData) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === updated.id
          ? { ...p, body: updated.body, is_public: updated.is_public, image_url: updated.image_url ?? null }
          : p
      )
    );
    setEditingPost(null);
  };

  const confirmDeletePost = async () => {
    if (!deletingPostId) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/social/posts/${deletingPostId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== deletingPostId));
      } else {
        setErrorBanner('Failed to delete post. Please try again.');
      }
    } catch (err) {
      console.error('delete post failed', err);
      setErrorBanner('Failed to delete post. Please try again.');
    } finally {
      setDeleteBusy(false);
      setDeletingPostId(null);
    }
  };

  const handleLike = async (postId: string) => {
    const wasLiked = likedPosts[postId] ?? false;
    setLikedPosts((prev) => ({ ...prev, [postId]: !wasLiked }));
    setLikeCounts((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? 0) + (wasLiked ? -1 : 1),
    }));

    try {
      const res = await fetch(`/api/social/posts/${postId}/like`, { method: 'POST' });
      if (res.ok) {
        const json = (await res.json()) as ApiEnvelope<SocialLikeData>;
        const likePayload = json.data;
        if (likePayload) {
          setLikedPosts((prev) => ({ ...prev, [postId]: likePayload.liked }));
          setLikeCounts((prev) => ({ ...prev, [postId]: likePayload.likesCount }));
        }
      } else {
        setLikedPosts((prev) => ({ ...prev, [postId]: wasLiked }));
        setLikeCounts((prev) => ({
          ...prev,
          [postId]: (prev[postId] ?? 0) + (wasLiked ? 1 : -1),
        }));
        setErrorBanner('Failed to update like.');
      }
    } catch (err) {
      console.error('like failed', err);
      setLikedPosts((prev) => ({ ...prev, [postId]: wasLiked }));
      setLikeCounts((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? 0) + (wasLiked ? 1 : -1),
      }));
      setErrorBanner('Failed to update like.');
    }
  };

  // Load comments for a post
  const handleToggleComments = async (postId: string) => {
    if (expandedComments[postId]) {
      setExpandedComments((prev) => ({ ...prev, [postId]: false }));
      return;
    }

    setExpandedComments((prev) => ({ ...prev, [postId]: true }));
    if (commentsData[postId]) return;

    setCommentsLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const res = await fetch(`/api/social/posts/${postId}/comments?page=1&limit=10`);
      if (res.ok) {
        const json = (await res.json()) as ApiEnvelope<SocialCommentsListData>;
        const list = (json.data?.comments ?? []) as ProfilePostComment[];
        setCommentsData((prev) => ({ ...prev, [postId]: list }));
      } else {
        setErrorBanner('Failed to load comments. Please try again.');
      }
    } catch (err) {
      console.error('comments fetch failed', err);
      setErrorBanner('Failed to load comments. Please try again.');
    } finally {
      setCommentsLoading((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleCommentTextChange = (postId: string, text: string) => {
    setCommentTexts((prev) => ({ ...prev, [postId]: text }));
  };

  // Submit a new comment on one of the owner's posts. Mirrors the community
  // feed flow (POST /comments → append + bump count). The global fetch patch
  // (auth-context) attaches the JWT, so no explicit Authorization header here.
  const handleAddComment = async (postId: string) => {
    const text = commentTexts[postId]?.trim();
    if (!text) return;
    try {
      const res = await fetch(`/api/social/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        setErrorBanner('Failed to add comment. Please try again.');
        return;
      }
      const json = (await res.json()) as ApiEnvelope<SocialCommentCreateData>;
      // The create endpoint returns the full comment contract (likes_count,
      // liked, user_id, profiles); the shared SocialComment type is narrower,
      // so read the extra fields through a structural cast.
      const raw = json.data?.comment as
        | (SocialCommentCreateData['comment'] & {
            user_id?: string;
            post_id?: string;
            updated_at?: string | null;
            likes_count?: number;
            liked?: boolean;
          })
        | undefined;
      if (!raw) {
        setErrorBanner('Failed to add comment. Please try again.');
        return;
      }
      const newComment: ProfilePostComment = {
        id: raw.id,
        body: raw.body,
        created_at: raw.created_at,
        updated_at: raw.updated_at ?? null,
        user_id: raw.user_id ?? user?.id,
        post_id: raw.post_id ?? postId,
        likes_count: raw.likes_count ?? 0,
        liked: raw.liked ?? false,
        profiles: raw.profiles,
        author: { name: raw.profiles?.name ?? raw.author?.name ?? user?.name ?? 'You' },
      };
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
    } catch (err) {
      console.error('addComment failed', err);
      setErrorBanner('Failed to add comment. Please try again.');
    }
  };

  // Like/unlike a comment — optimistic with rollback. Mirrors handleLike.
  const handleCommentLike = async (postId: string, commentId: string) => {
    const list = commentsData[postId] ?? [];
    const current = list.find((c) => c.id === commentId);
    const wasLiked = current?.liked ?? false;
    const patch = (liked: boolean, delta: number) =>
      setCommentsData((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? []).map((c) =>
          c.id === commentId
            ? { ...c, liked, likes_count: Math.max(0, (c.likes_count ?? 0) + delta) }
            : c
        ),
      }));
    patch(!wasLiked, wasLiked ? -1 : 1);
    try {
      const res = await fetch(
        `/api/social/posts/${postId}/comments/${commentId}/like`,
        { method: 'POST' }
      );
      if (!res.ok) {
        patch(wasLiked, wasLiked ? 1 : -1);
        setErrorBanner('Failed to update like.');
        return;
      }
      const json = (await res.json()) as ApiEnvelope<SocialLikeData>;
      const payload = json.data;
      if (payload) {
        setCommentsData((prev) => ({
          ...prev,
          [postId]: (prev[postId] ?? []).map((c) =>
            c.id === commentId
              ? { ...c, liked: payload.liked, likes_count: payload.likesCount }
              : c
          ),
        }));
      }
    } catch (err) {
      console.error('comment like failed', err);
      patch(wasLiked, wasLiked ? 1 : -1);
      setErrorBanner('Failed to update like.');
    }
  };

  const handleCommentEditStart = (comment: ProfilePostComment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.body);
  };

  const handleCommentEditCancel = () => {
    setEditingCommentId(null);
    setEditingCommentText('');
  };

  const handleCommentEditSave = async (postId: string, commentId: string) => {
    const text = editingCommentText.trim();
    if (!text) return;
    try {
      const res = await fetch(
        `/api/social/posts/${postId}/comments/${commentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        }
      );
      if (!res.ok) {
        setErrorBanner('Failed to edit comment. Please try again.');
        return;
      }
      const json = (await res.json()) as ApiEnvelope<SocialCommentCreateData>;
      const updated = json.data?.comment;
      setCommentsData((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? []).map((c) =>
          c.id === commentId
            ? {
                ...c,
                body: updated?.body ?? text,
                updated_at:
                  (updated as { updated_at?: string | null } | undefined)?.updated_at ??
                  new Date().toISOString(),
              }
            : c
        ),
      }));
      setEditingCommentId(null);
      setEditingCommentText('');
    } catch (err) {
      console.error('comment edit failed', err);
      setErrorBanner('Failed to edit comment. Please try again.');
    }
  };

  const handleCommentDelete = async (postId: string, commentId: string) => {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    try {
      const res = await fetch(
        `/api/social/posts/${postId}/comments/${commentId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        setErrorBanner('Failed to delete comment. Please try again.');
        return;
      }
      setCommentsData((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? []).filter((c) => c.id !== commentId),
      }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, comments_count: Math.max(0, p.comments_count - 1) }
            : p
        )
      );
    } catch (err) {
      console.error('comment delete failed', err);
      setErrorBanner('Failed to delete comment. Please try again.');
    }
  };

  // Logout handler
  const handleLogout = async () => {
    // Return the user to their tenant's splash (not a generic page) so the
    // per-tenant branded experience is preserved after sign-out.
    const slug = organization?.slug;
    await logout();
    router.push(slug ? `/org/${slug}` : '/login');
  };

  // AI personalization opt-in toggle. Optimistic flip, revert on failure.
  const handleToggleAiConsent = async () => {
    if (aiConsentSaving) return;
    const previous = aiConsent;
    const next = !previous;
    setAiConsent(next);
    setAiConsentSaving(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: { ai_personalization_consent: next },
        }),
      });
      if (!res.ok) {
        setAiConsent(previous);
        setErrorBanner('Failed to update AI preference. Please try again.');
      }
    } catch (err) {
      console.error('toggle AI consent failed', err);
      setAiConsent(previous);
      setErrorBanner('Failed to update AI preference. Please try again.');
    } finally {
      setAiConsentSaving(false);
    }
  };

  // Avatar upload handlers
  const handleEditPhotoClick = () => {
    if (avatarUploading) return;
    fileInputRef.current?.click();
  };

  const handleAvatarFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    // Always reset the input so re-selecting the same file fires onChange.
    if (e.target) e.target.value = '';
    if (!file) return;

    const MAX_BYTES = 25 * 1024 * 1024;
    const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!ALLOWED.has(file.type)) {
      setErrorBanner('Unsupported image type. Use PNG, JPEG, or WebP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setErrorBanner('Image is larger than 25MB.');
      return;
    }

    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as ApiEnvelope<{ avatar_url: string }>;
      if (!res.ok || !json.success || !json.data) {
        setErrorBanner(json.error ?? 'Failed to upload photo.');
        return;
      }
      setProfile((prev) =>
        prev ? { ...prev, avatar_url: json.data?.avatar_url } : prev
      );
      // Sync auth-context so the community header/composer avatar (which
      // reads user.avatarUrl) updates without a full page reload.
      void refreshUser().catch(() => {});
    } catch (err) {
      console.error('avatar upload failed', err);
      setErrorBanner('Failed to upload photo. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleLogWeight = async () => {
    const w = Number(weightInput);
    if (!Number.isFinite(w) || w <= 0 || w >= 2000) {
      setErrorBanner('Enter a valid weight in pounds.');
      return;
    }
    setWeightSubmitting(true);
    try {
      const res = await fetch('/api/patient/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight: w }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; data?: { entry: { id: string; weight_lbs: number; recorded_on: string } } }
        | null;
      if (res.ok && json?.success && json.data?.entry) {
        const entry = json.data.entry;
        // Replace today's entry (one row per day) and keep chronological order.
        setWeightLog((prev) =>
          [...prev.filter((e) => e.recorded_on !== entry.recorded_on), entry].sort((a, b) =>
            a.recorded_on.localeCompare(b.recorded_on)
          )
        );
        setWeightInput('');
      } else {
        setErrorBanner(json?.error ?? 'Could not save weight. Please try again.');
      }
    } catch (err) {
      console.error('log weight failed', err);
      setErrorBanner('Could not save weight. Please try again.');
    } finally {
      setWeightSubmitting(false);
    }
  };

  // Delete a logged weight for a given day (lets the user fix a mistyped entry).
  const handleDeleteWeight = async (recordedOn: string) => {
    try {
      const res = await fetch(`/api/patient/weight?date=${encodeURIComponent(recordedOn)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setWeightLog((prev) => prev.filter((e) => e.recorded_on !== recordedOn));
      } else {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorBanner(json?.error ?? 'Could not delete that entry. Please try again.');
      }
    } catch (err) {
      console.error('delete weight failed', err);
      setErrorBanner('Could not delete that entry. Please try again.');
    }
  };

  // Open the goal editor, prefilling with the best-known starting/target weights.
  const handleOpenGoalEditor = () => {
    const start =
      patientProfile?.starting_weight ?? firstLoggedWeight ?? currentWeight ?? 0;
    setStartingInput(start > 0 ? String(start) : '');
    setTargetInput(patientProfile?.target_weight ? String(patientProfile.target_weight) : '');
    setGoalEditing(true);
  };

  const handleSaveGoal = async () => {
    const target = Number(targetInput);
    const start = Number(startingInput);
    if (!Number.isFinite(target) || target <= 0 || target >= 2000) {
      setErrorBanner('Enter a valid goal weight in pounds.');
      return;
    }
    if (startingInput.trim() && (!Number.isFinite(start) || start <= 0 || start >= 2000)) {
      setErrorBanner('Enter a valid starting weight in pounds.');
      return;
    }
    setGoalSaving(true);
    try {
      const payload: Record<string, number> = { target_weight: target };
      if (startingInput.trim()) payload.starting_weight = start;
      const res = await fetch('/api/patient/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiEnvelope<PatientProfilePutRow>
        | null;
      if (!res.ok || !json?.success) {
        setErrorBanner(json?.error ?? 'Could not save goal. Please try again.');
        return;
      }
      // Merge the returned weights back into local state so the stat cards
      // (goal %, target) recompute immediately without a full refetch.
      const row = json.data;
      setPatientProfile((prev) => ({
        ...(prev ?? {}),
        target_weight: row?.target_weight ?? target,
        starting_weight: row?.starting_weight ?? (startingInput.trim() ? start : prev?.starting_weight),
        current_weight: row?.current_weight ?? prev?.current_weight,
      }));
      setGoalEditing(false);
    } catch (err) {
      console.error('save goal failed', err);
      setErrorBanner('Could not save goal. Please try again.');
    } finally {
      setGoalSaving(false);
    }
  };

  const handleAddProgressPhotoClick = () => {
    if (progressUploading) return;
    progressFileInputRef.current?.click();
  };

  const handleDeleteProgressPhoto = async (photoId: string) => {
    if (!window.confirm('Delete this progress photo? This cannot be undone.')) return;
    try {
      const res = await fetch(
        `/api/patient/progress-photos?photoId=${encodeURIComponent(photoId)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setProgressPhotos((prev) => prev.filter((p) => p.id !== photoId));
      } else {
        setErrorBanner('Failed to delete photo. Please try again.');
      }
    } catch (err) {
      console.error('delete progress photo failed', err);
      setErrorBanner('Failed to delete photo. Please try again.');
    }
  };

  const handleTogglePhotoPublic = async (photoId: string, makePublic: boolean) => {
    // Optimistic flip; revert on failure.
    setProgressPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, is_public: makePublic } : p))
    );
    try {
      const res = await fetch('/api/patient/progress-photos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId, is_public: makePublic }),
      });
      if (!res.ok) {
        setProgressPhotos((prev) =>
          prev.map((p) => (p.id === photoId ? { ...p, is_public: !makePublic } : p))
        );
        setErrorBanner('Failed to update photo privacy. Please try again.');
      }
    } catch (err) {
      console.error('toggle photo public failed', err);
      setProgressPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, is_public: !makePublic } : p))
      );
      setErrorBanner('Failed to update photo privacy. Please try again.');
    }
  };

  const handleProgressPhotoFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    const MAX_BYTES = 25 * 1024 * 1024;
    const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!ALLOWED.has(file.type)) {
      setErrorBanner('Unsupported image type. Use PNG, JPEG, or WebP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setErrorBanner('Image is larger than 25MB.');
      return;
    }

    setProgressUploading(true);
    setErrorBanner(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const caption = progressCaption.trim();
      if (caption) fd.append('notes', caption);
      const res = await fetch('/api/patient/progress-photos', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json().catch(() => null)) as
        | ApiEnvelope<ProfileProgressPhoto>
        | null;
      if (!res.ok || !json?.success || !json.data) {
        setErrorBanner(json?.error ?? 'Failed to upload progress photo.');
        return;
      }
      setProgressPhotos((prev) => [json.data as ProfileProgressPhoto, ...prev]);
      setProgressCaption('');
      setActiveTab('progress');
    } catch (err) {
      console.error('progress photo upload failed', err);
      setErrorBanner('Failed to upload progress photo. Please try again.');
    } finally {
      setProgressUploading(false);
    }
  };

  // Computed profile stats
  const displayName = profile?.name ?? user?.name ?? 'User';
  const displayEmail = profile?.email ?? user?.email ?? '';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // The dashboard stat cards should track the latest daily check-in so logging
  // a weight visibly moves "current" and "lbs lost" — not just the graph. Fall
  // back to the stored patient-profile weights when no entries exist yet.
  const latestLoggedWeight =
    weightLog.length > 0 ? weightLog[weightLog.length - 1].weight_lbs : undefined;
  const firstLoggedWeight = weightLog.length > 0 ? weightLog[0].weight_lbs : undefined;
  // SOURCE OF TRUTH = the logged weight entries. The header "lbs +/-" stat, the
  // goal-progress ring, and the Weight Graph must all use the SAME baseline.
  // Previously this preferred the stored `starting_weight` profile field, which
  // could disagree with the first logged entry (e.g. profile says 200 but the
  // first entry is 199) — producing a header that showed +1 while the graph/
  // mobile card correctly showed +2 from 199→201. Prefer the first logged entry
  // (what the graph uses: graphWeights[0]); fall back to the profile field only
  // when there are no entries yet.
  const startingWeight = firstLoggedWeight ?? patientProfile?.starting_weight ?? 0;
  const currentWeight = latestLoggedWeight ?? patientProfile?.current_weight ?? 0;
  const targetWeight = patientProfile?.target_weight ?? 0;
  // Round to 1 decimal — raw float subtraction produces artifacts like
  // 2.4000000000000004 which rendered verbatim in the header stat.
  const lbsLost = startingWeight > 0 ? Math.round((startingWeight - currentWeight) * 10) / 10 : 0;
  // Directional goal progress: works for weight loss (start > target) and gain
  // (start < target). Moving the wrong way clamps to 0; reaching/passing the
  // target clamps to 100. Guarding |start - target| > 0 avoids the meaningless
  // 0% that showed whenever the target sat at/above the starting weight.
  const goalPercent = (() => {
    if (startingWeight <= 0 || targetWeight <= 0 || currentWeight <= 0) return 0;
    const needed = startingWeight - targetWeight;
    if (Math.abs(needed) < 0.001) return 0;
    const achieved = startingWeight - currentWeight;
    return Math.max(0, Math.min(100, Math.round((achieved / needed) * 100)));
  })();

  // Weeks since account creation
  const weeksOnProgram = (() => {
    const dateStr = profile?.created_at;
    if (!dateStr) return 0;
    const created = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return Math.max(0, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)));
  })();

  const medicationType = patientProfile?.medication_type ?? '';
  // Weight graph is driven by standalone daily weight entries (weight_entries),
  // not progress photos.
  const graphWeights = weightLog.map((entry) => entry.weight_lbs);
  const graphStartWeight = graphWeights[0] ?? patientProfile?.starting_weight ?? 0;
  const graphCurrentWeight =
    graphWeights[graphWeights.length - 1] ?? patientProfile?.current_weight ?? 0;
  const graphDelta =
    graphStartWeight > 0 && graphCurrentWeight > 0
      ? Math.round((graphStartWeight - graphCurrentWeight) * 10) / 10
      : 0;
  const graphMax = graphWeights.length > 0 ? Math.max(...graphWeights) : 0;
  const graphMin = graphWeights.length > 0 ? Math.min(...graphWeights) : 0;
  const graphRange = graphMax - graphMin || 1;

  // Loading skeleton
  if (authLoading || (!isAuthenticated && !authLoading)) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="animate-pulse text-[var(--accent)] text-lg font-bold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] shadow-xl">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-3">
              <BrandLogo size={40} />
              <div><h1 className="text-lg font-bold text-[#2D352C]">Profile</h1><p className="text-xs text-[var(--accent)]">Your Journey</p></div>
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" className="px-4 py-4 space-y-4">
        {/* Error Banner */}
        {errorBanner && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
            <p className="text-sm text-red-700">{errorBanner}</p>
            <button
              onClick={() => setErrorBanner(null)}
              className="text-red-400 hover:text-red-600 ml-2 text-lg leading-none"
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        )}

        {/* Consult CTA */}
        <Link href="/telehealth" className="block bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] rounded-2xl p-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-white shadow-lg">
              <Image
                src="/doctor-chat-icon.png"
                alt="Provider"
                width={48}
                height={48}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1"><p className="font-bold text-white">Speak to a Provider</p><p className="text-xs text-white/80">Get your prescription</p></div>
            <span className="text-white">&rarr;</span>
          </div>
        </Link>

        {/* View public community profile */}
        {user?.id && (
          <Link
            href={`/community/users/${user.id}`}
            className="flex items-center gap-3 bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-sm hover:border-[var(--accent)] transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-[#EEF1ED] flex items-center justify-center text-[#6B7F65]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-bold text-[#2D352C] text-sm">View my community profile</p>
              <p className="text-xs text-[#8B9B83]">See your posts, followers &amp; following</p>
            </div>
            <span className="text-[#8B9B83]">&rarr;</span>
          </Link>
        )}

        {/* Refer & earn — removed for now per product decision (backend intact). */}

        {/* Profile Card */}
        {dataLoading ? (
          <ProfileSkeletonCard />
        ) : (
          <>
            <ProfileHeaderCard
              initials={initials}
              displayName={displayName}
              displayEmail={displayEmail}
              medicationType={medicationType}
              weeksOnProgram={weeksOnProgram}
              lbsLost={lbsLost}
              currentWeight={currentWeight}
              goalPercent={goalPercent}
              avatarUrl={profile?.avatar_url ?? null}
              onEditPhoto={handleEditPhotoClick}
              avatarUploading={avatarUploading}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={handleAvatarFileChange}
            />
          </>
        )}

        {/* Goal card — set / change a target weight so goal % is meaningful. */}
        {!dataLoading && (
          <section className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#2D352C]">Your Goal</h2>
                <p className="text-xs text-[#6B7567]">
                  {targetWeight > 0
                    ? `Goal weight ${targetWeight} lbs · ${goalPercent}% there`
                    : 'Set a goal weight to track your progress'}
                </p>
              </div>
              {!goalEditing && (
                <button
                  type="button"
                  onClick={handleOpenGoalEditor}
                  className="min-h-9 shrink-0 rounded-full bg-[#EEF1ED] px-3 text-xs font-bold text-[#53634D] hover:bg-[#E5EAE3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                >
                  {targetWeight > 0 ? 'Change goal' : 'Set goal'}
                </button>
              )}
            </div>

            {targetWeight > 0 && !goalEditing && (
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#EEF1ED]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--accent-secondary)] to-[var(--accent)]"
                  style={{ width: `${goalPercent}%` }}
                />
              </div>
            )}

            {goalEditing && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="goal-starting" className="mb-1 block text-xs font-semibold text-[#6B7567]">
                      Starting weight (lbs)
                    </label>
                    <input
                      id="goal-starting"
                      type="number"
                      inputMode="decimal"
                      min="1"
                      step="0.1"
                      value={startingInput}
                      onChange={(e) => setStartingInput(e.target.value)}
                      placeholder="e.g. 200"
                      className="w-full rounded-xl border border-[#E5EAE3] px-3 py-2 text-sm text-[#2D352C] focus:border-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="goal-target" className="mb-1 block text-xs font-semibold text-[#6B7567]">
                      Goal weight (lbs)
                    </label>
                    <input
                      id="goal-target"
                      type="number"
                      inputMode="decimal"
                      min="1"
                      step="0.1"
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                      placeholder="e.g. 170"
                      className="w-full rounded-xl border border-[#E5EAE3] px-3 py-2 text-sm text-[#2D352C] focus:border-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveGoal}
                    disabled={goalSaving || !targetInput.trim()}
                    className="min-h-[42px] flex-1 rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                  >
                    {goalSaving ? 'Saving…' : 'Save goal'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGoalEditing(false)}
                    className="min-h-[42px] rounded-xl border border-[#E5EAE3] px-4 text-sm font-bold text-[#6B7567] hover:bg-[#FAF9F6]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#2D352C]">Weight Graph</h2>
              <p className="text-xs text-[#6B7567]">
                Your daily weight check-ins
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('progress')}
              className="min-h-9 shrink-0 rounded-full bg-[#EEF1ED] px-3 text-xs font-bold text-[#53634D] hover:bg-[#E5EAE3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            >
              Open Photos
            </button>
          </div>

          <div className="mb-4 flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="weight-input" className="mb-1 block text-xs font-semibold text-[#6B7567]">
                Log today&apos;s weight (lbs)
              </label>
              <input
                id="weight-input"
                type="number"
                inputMode="decimal"
                min="1"
                step="0.1"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLogWeight();
                }}
                placeholder="e.g. 185.4"
                className="w-full rounded-xl border border-[#E5EAE3] px-3 py-2 text-sm text-[#2D352C] focus:border-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              />
            </div>
            <button
              type="button"
              onClick={handleLogWeight}
              disabled={weightSubmitting || !weightInput.trim()}
              className="min-h-[42px] rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            >
              {weightSubmitting ? 'Saving…' : 'Log'}
            </button>
          </div>

          {weightLoading ? (
            <div className="h-28 rounded-xl bg-[#EEF1ED] animate-pulse" />
          ) : weightError ? (
            <div className="rounded-xl bg-[#FAF9F6] p-4 text-center" role="alert">
              <p className="text-sm font-semibold text-[#2D352C]">
                Couldn&apos;t load your weight history
              </p>
              <button
                type="button"
                onClick={() => setWeightReloadKey((k) => k + 1)}
                className="mt-2 min-h-11 px-5 py-2 rounded-xl bg-[var(--accent-strong)] text-white text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
              >
                Try again
              </button>
            </div>
          ) : graphWeights.length > 0 ? (
            <>
              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-[#F5F8F3] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7567]">Start</p>
                  <p className="text-base font-bold text-[#2D352C]">{graphStartWeight} lbs</p>
                </div>
                <div className="rounded-xl bg-[#F5F8F3] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7567]">Now</p>
                  <p className="text-base font-bold text-[#2D352C]">{graphCurrentWeight} lbs</p>
                </div>
                <div className="rounded-xl bg-[#F5F8F3] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7567]">Change</p>
                  <p className="text-base font-bold text-[var(--accent-strong)]">{graphDelta > 0 ? '-' : graphDelta < 0 ? '+' : ''}{Math.round(Math.abs(graphDelta) * 10) / 10} lbs</p>
                </div>
              </div>
              <div className="flex h-44 items-end gap-2 rounded-xl bg-[#FAF9F6] p-3">
                {weightLog.map((entry) => {
                  const weight = entry.weight_lbs;
                  const height = 28 + ((weight - graphMin) / graphRange) * 72;
                  return (
                    <div key={entry.id} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-[var(--accent-secondary)] to-[var(--accent)]"
                        style={{ height: `${height}%` }}
                        aria-label={`${weight} pounds`}
                      />
                      <span className="text-[10px] font-semibold text-[#6B7567]">{weight}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[11px] font-semibold text-[#8B9B83]">
                <span>{new Date(`${weightLog[0].recorded_on}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span>{new Date(`${weightLog[weightLog.length - 1].recorded_on}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>

              {/* Recent entries with delete — lets a user correct a mistyped
                  weight (previously there was no way to remove an entry). */}
              <div className="mt-4 border-t border-[#E5EAE3] pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8B9B83]">Recent entries</p>
                <ul className="space-y-1.5">
                  {[...weightLog].reverse().slice(0, 5).map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between text-sm">
                      <span className="text-[#2D352C]">
                        <span className="font-semibold">{entry.weight_lbs} lbs</span>
                        <span className="ml-2 text-xs text-[#8B9B83]">
                          {new Date(`${entry.recorded_on}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteWeight(entry.recorded_on)}
                        aria-label={`Delete weight entry for ${entry.recorded_on}`}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-[#B04A4A] hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <div className="rounded-xl bg-[#FAF9F6] p-4 text-center">
              <p className="text-sm font-semibold text-[#2D352C]">No weight logged yet</p>
              <p className="mt-1 text-xs text-[#6B7567]">
                Enter your weight above to start tracking your progress.
              </p>
            </div>
          )}
        </section>

        {/* My Orders quick link */}
        <Link
          href="/profile/orders"
          className="block bg-white rounded-2xl border border-[#E5EAE3] shadow-xl p-4 hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#EEF1ED] flex items-center justify-center text-2xl">
              &#x1F4E6;
            </div>
            <div className="flex-1">
              <p className="font-bold text-[#2D352C]">My Orders</p>
              <p className="text-xs text-[#6B7567]">
                Track shipments and order history
              </p>
            </div>
            <span className="text-[#8B9B83]">&rarr;</span>
          </div>
        </Link>

        {/* Messages Panel */}
        <ProfileMessagesPanel conversations={conversations} totalUnread={totalUnread} />

        {/* Tabs */}
        <div className="flex gap-2 bg-white rounded-xl border border-[#E5EAE3] p-1 shadow-lg">
          {(['posts', 'progress', 'purchases'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold ${activeTab === tab ? 'bg-[var(--accent)] text-white' : 'text-[#6B7567]'}`}>{tab === 'progress' ? 'Photos' : tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'posts' && (
          <ProfilePostsTab
            displayName={displayName}
            avatarUrl={profile?.avatar_url ?? null}
            posts={posts}
            postsLoading={postsLoading}
            dataLoading={dataLoading}
            postSubmitting={postSubmitting}
            likedPosts={likedPosts}
            likeCounts={likeCounts}
            expandedComments={expandedComments}
            commentsData={commentsData}
            commentsLoading={commentsLoading}
            commentTexts={commentTexts}
            currentUserId={user?.id}
            editingCommentId={editingCommentId}
            editingCommentText={editingCommentText}
            onCreatePost={handleCreatePost}
            onError={setErrorBanner}
            onLike={handleLike}
            onToggleComments={handleToggleComments}
            onCommentTextChange={handleCommentTextChange}
            onAddComment={handleAddComment}
            onCommentLike={handleCommentLike}
            onCommentEditStart={handleCommentEditStart}
            onCommentEditChange={setEditingCommentText}
            onCommentEditSave={handleCommentEditSave}
            onCommentEditCancel={handleCommentEditCancel}
            onCommentDelete={handleCommentDelete}
            onEdit={setEditingPost}
            onDelete={setDeletingPostId}
          />
        )}

        {editingPost && (
          <EditPostModal
            post={{
              id: editingPost.id,
              body: editingPost.body,
              type: editingPost.type,
              is_public: editingPost.is_public,
              image_url: editingPost.image_url ?? null,
              likes_count: editingPost.likes_count,
              comments_count: editingPost.comments_count,
              liked: likedPosts[editingPost.id] ?? editingPost.liked_by_user ?? false,
              created_at: editingPost.created_at,
              profiles: editingPost.profiles ?? editingPost.author,
              user_id: user?.id ?? '',
            }}
            onClose={() => setEditingPost(null)}
            onSaved={handlePostSaved}
            onError={setErrorBanner}
          />
        )}

        {deletingPostId && (
          <ConfirmDialog
            title="Delete post?"
            message="This permanently removes the post and its comments. This can't be undone."
            destructive
            busy={deleteBusy}
            onConfirm={confirmDeletePost}
            onCancel={() => setDeletingPostId(null)}
          />
        )}

        {activeTab === 'progress' && (
          <>
            <input
              ref={progressFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={handleProgressPhotoFileChange}
            />
            <ProfileProgressTab
              progressPhotos={progressPhotos}
              weightEntries={weightLog}
              dataLoading={dataLoading}
              uploading={progressUploading}
              caption={progressCaption}
              onCaptionChange={setProgressCaption}
              onAddPhoto={handleAddProgressPhotoClick}
              onDeletePhoto={handleDeleteProgressPhoto}
              onTogglePublic={handleTogglePhotoPublic}
            />
          </>
        )}

        {activeTab === 'purchases' && (
          <ProfilePurchasesTab
            dataLoading={dataLoading}
            subscription={subscription}
            subscriptionActive={subscriptionActive}
          />
        )}

        {/* AI Assistant Preferences */}
        <ProfileAiPreferencesCard
          aiConsent={aiConsent}
          saving={aiConsentSaving}
          onToggle={handleToggleAiConsent}
        />

        {/* Menu */}
        <ProfileMenuList />

        <button onClick={handleLogout} className="w-full bg-white rounded-2xl border border-[#E5EAE3] shadow-xl p-4 text-center text-red-500 font-bold hover:bg-red-50">Log Out</button>
      </main>

      <BottomNav />
    </div>
  );
}
