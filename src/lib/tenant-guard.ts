// Server-side tenant-isolation helpers.
//
// Every API route uses the service-role Supabase client, which BYPASSES RLS, so
// cross-tenant access must be blocked in code. A caller may only touch resources
// belonging to their own organization; super_admin may touch any tenant. These
// helpers centralize the "does this resource belong to the caller's tenant?"
// check for the social / messaging surfaces (looked up by id), mirroring the
// pattern in authorizeOrgAdmin().

import { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

export interface TenantCaller {
  role: string
  organization_id: string | null
}

function sameOrg(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return (a ?? null) === (b ?? null)
}

/**
 * May the caller access a resource owned by `targetUserId`? Resolves the target
 * user's organization and compares to the caller's. super_admin always may.
 * Returns false for unknown users (treated as not accessible).
 */
export async function canAccessUserTenant(
  supabase: Admin,
  caller: TenantCaller,
  targetUserId: string
): Promise<boolean> {
  if (caller.role === 'super_admin') return true
  const { data } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', targetUserId)
    .maybeSingle<{ organization_id: string | null }>()
  if (!data) return false
  return sameOrg(data.organization_id, caller.organization_id)
}

/**
 * May the caller exchange DIRECT MESSAGES with `targetUserId`? Same tenant
 * rule as canAccessUserTenant, plus one deliberate exception: platform staff
 * (super_admin, organization_id NULL) must be reachable by every member —
 * they ARE the support/care team, and the strict same-org rule made them
 * unmessageable from inside any tenant (the "Message support" flows dumped
 * users on an inbox they could never start a thread from). Messaging ONLY —
 * social surfaces keep the strict rule.
 */
export async function canMessageUserTenant(
  supabase: Admin,
  caller: TenantCaller,
  targetUserId: string
): Promise<boolean> {
  if (caller.role === 'super_admin') return true
  const { data } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', targetUserId)
    .maybeSingle<{ organization_id: string | null; role: string | null }>()
  if (!data) return false
  if (data.role === 'super_admin') return true
  return sameOrg(data.organization_id, caller.organization_id)
}

/**
 * May the caller access `postId`? Posts carry organization_id (migration 030).
 * Returns whether the post exists and whether access is allowed, so callers can
 * 404 uniformly (never leak existence across tenants).
 */
export async function canAccessPostTenant(
  supabase: Admin,
  caller: TenantCaller,
  postId: string
): Promise<{ found: boolean; allowed: boolean }> {
  const { data } = await supabase
    .from('posts')
    .select('organization_id')
    .eq('id', postId)
    .maybeSingle<{ organization_id: string | null }>()
  if (!data) return { found: false, allowed: false }
  if (caller.role === 'super_admin') return { found: true, allowed: true }
  return { found: true, allowed: sameOrg(data.organization_id, caller.organization_id) }
}
