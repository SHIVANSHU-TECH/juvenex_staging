'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

interface AdminShortcutProps {
  orgId: string
  orgSlug: string
  primaryColor: string
}

/**
 * Small client-only island rendered in the public whitelabel landing page.
 * Shows an "Admin" link only to users who can access the per-org admin
 * backend:
 *   - super_admin: always
 *   - org_admin of THIS specific org: only if user.organizationId === orgId
 *
 * The real access decision is enforced server-side on every /api/org/[slug]/admin
 * route; this is purely a UX affordance.
 */
export default function AdminShortcut({
  orgId,
  orgSlug,
  primaryColor,
}: AdminShortcutProps) {
  const { user, isLoading } = useAuth()

  if (isLoading || !user) return null

  const isSuperAdmin = user.role === 'super_admin'
  const isOwningOrgAdmin =
    user.role === 'org_admin' && user.organizationId === orgId

  if (!isSuperAdmin && !isOwningOrgAdmin) return null

  return (
    <Link
      href={`/org/${encodeURIComponent(orgSlug)}/admin`}
      className="text-xs px-3 py-1.5 rounded-full border font-medium transition-colors hover:bg-[#F0F2EE]"
      style={{ borderColor: primaryColor, color: primaryColor }}
    >
      Admin
    </Link>
  )
}
