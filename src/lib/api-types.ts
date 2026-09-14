/**
 * Shared API response envelope and request/response types used by client
 * components. Centralizing these here avoids re-declaring the same shapes
 * in every fetch call site and lets the server routes import the same
 * type once they are migrated.
 *
 * TODO: have route files in src/app/api/admin/orders/route.ts,
 * src/app/api/admin/reports/route.ts, and src/app/api/org/[slug]/admin/*
 * import these types from here instead of re-declaring them locally.
 */

import type {
  OrderStatus,
  PaymentStatus,
  PrescriberxStatus,
} from '@/lib/order-status'

// Re-export the canonical status string-literal unions so callers can keep
// importing them from `@/lib/api-types` if they want to. Source of truth
// stays in `@/lib/order-status`.
export type { OrderStatus, PaymentStatus, PrescriberxStatus }

/** Standard envelope wrapping every JSON response from /api/*. */
export interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}

// ---------------------------------------------------------------------------
// Social / community
// ---------------------------------------------------------------------------

export interface SocialPostsListData {
  posts: SocialPost[]
  hasMore: boolean
  total?: number
}

export interface SocialPost {
  id: string
  user_id: string
  type: string
  group_id?: string | null
  title?: string | null
  body: string
  image_url?: string | null
  is_public: boolean
  likes_count: number
  comments_count: number
  liked?: boolean
  liked_by_user?: boolean
  created_at: string
  updated_at?: string
  profiles?: { id: string; name: string; avatar_url?: string }
  author?: { id: string; name: string; avatar_url?: string }
}

export interface SocialLikeData {
  liked: boolean
  likesCount: number
}

export interface SocialCommentsListData {
  comments: SocialComment[]
}

export interface SocialComment {
  id: string
  body: string
  created_at: string
  profiles?: { id: string; name: string; avatar_url?: string }
  author?: { name: string }
}

export interface SocialCommentCreateData {
  comment: SocialComment
}

export interface SocialFeedData {
  posts: SocialPost[]
  hasMore: boolean
}

export interface GroupsListData {
  groups: Array<{
    id: string
    name: string
    description: string
    slug: string
    member_count?: number
    is_member?: boolean
    group_members?: Array<{ count: number }>
    created_at: string
  }>
}

// ---------------------------------------------------------------------------
// Admin / org-admin shared shapes
//
// These mirror the `interface` declarations exported by the API route
// handlers. Keeping them here avoids drift between client and server.
// ---------------------------------------------------------------------------

/**
 * Row shape returned by `GET /api/admin/orders`.
 *
 * The LIST endpoint joins the orders row with the customer profile and
 * surfaces the fulfillment / payment columns directly so the admin and
 * fulfillment tables can render without a per-row detail call. Keep this
 * in lockstep with the `AdminOrder` interface declared in
 * `src/app/api/admin/orders/route.ts` — those two declarations should be
 * structurally identical.
 *
 * Status fields are typed as `string` (not the literal unions) because the
 * server defends against malformed legacy rows by returning whatever the
 * DB has rather than throwing. UI components narrow at the call site via
 * `isOrderStatus` / `isPrescriberxStatus`.
 */
export interface AdminOrder {
  id: string
  user_id: string
  customer_name: string | null
  customer_email: string | null
  total_cents: number
  currency: string
  status: string
  items: unknown
  created_at: string
  payment_status: string | null
  prescriberx_status: string | null
  prescriberx_reference: string | null
  prescriberx_sent_at: string | null
  fulfilled_at: string | null
  contact_email: string | null
}

export interface AdminOrdersData {
  orders: AdminOrder[]
  total: number
  hasMore: boolean
}

/**
 * Row shape returned by `GET /api/admin/orders/[id]`.
 *
 * Superset of `AdminOrder` — adds the address blobs, intake answers,
 * payment-provider references, admin notes, and the `fulfilled_by` audit
 * column. Mirrors the server-side `AdminOrderDetail` declared in
 * `src/app/api/admin/orders/[id]/route.ts`.
 */
export interface AdminOrderDetail {
  id: string
  user_id: string
  customer_name: string | null
  customer_email: string | null
  total_cents: number
  currency: string
  status: string
  items: unknown
  created_at: string
  shipping_address: unknown | null
  billing_address: unknown | null
  intake_answers: unknown | null
  contact_email: string | null
  contact_phone: string | null
  payment_provider: string | null
  payment_reference: string | null
  payment_status: string | null
  prescriberx_status: string | null
  prescriberx_reference: string | null
  prescriberx_sent_at: string | null
  fulfilled_by: string | null
  fulfilled_at: string | null
  admin_notes: string | null
}

export interface AdminReport {
  id: string
  status: string
  reason: string
  created_at: string
  reporter: { id: string; name: string | null; email: string } | null
  post: {
    id: string
    body: string
    image_url: string | null
    is_public: boolean
    created_at: string
    author: { id: string; name: string | null; email: string } | null
  } | null
}

export interface AdminReportsData {
  reports: AdminReport[]
  total: number
  hasMore: boolean
}

export interface OrgMember {
  id: string
  name: string | null
  email: string
  role: string
  created_at: string
  banned_from_org_at: string | null
}

export interface OrgMembersData {
  members: OrgMember[]
}

export interface OrgSummary {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string | null
  phone: string | null
  email: string | null
  website: string | null
}

export interface OrgStats {
  total_members: number
  orders_this_month: number
  pending_reports: number
}

export interface OrgOverviewData {
  organization: OrgSummary
  stats: OrgStats
}

export interface OrgUpdateData {
  organization: OrgSummary
}
