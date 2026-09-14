import { randomBytes, createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

/**
 * Length of an auto-generated admin password. 16 chars of base64url is
 * ~96 bits of entropy, well past the 72-bit floor we target for human-relayed
 * one-time credentials.
 */
const GENERATED_PASSWORD_LENGTH = 16

/**
 * Generate a cryptographically secure 16-char base64url password. Uses
 * `crypto.randomBytes` (not Math.random) so the output is suitable for
 * unguessable one-time credentials.
 */
export function generateSecurePassword(length: number = GENERATED_PASSWORD_LENGTH): string {
  // 16 chars of base64url needs ceil(16 * 6 / 8) = 12 bytes of entropy.
  const byteLen = Math.ceil((length * 6) / 8)
  return randomBytes(byteLen)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, length)
}

/**
 * Hash a password for AUDIT-LOGGING purposes only (so we can confirm a specific
 * password was issued without leaking plaintext to PM2 logs).
 *
 * NOTE: This is NOT for storing passwords. Supabase handles password storage
 * via its own auth.users table. This helper exists exclusively so the route
 * can log a non-reversible reference when it auto-generates credentials.
 */
export function hashPasswordForLogReference(password: string): string {
  return createHash('sha256').update(password).digest('hex').slice(0, 16)
}

export interface ProvisionAdminInput {
  organizationId: string
  email: string
  firstName: string | null
  lastName: string | null
  password: string
}

export interface ProvisionAdminResult {
  adminId: string
  adminEmail: string
}

/**
 * Create the initial org_admin user for a freshly-created organization.
 *
 * Sequence:
 *  1. `auth.admin.createUser` — creates the auth row with email_confirm=true.
 *  2. Upsert into `profiles` — sets role=org_admin and links to the org. The
 *     auth.users trigger may have already inserted a baseline profile row; we
 *     upsert to either fill that row or insert a fresh one.
 *
 * On any step failure, the caller is expected to roll back the parent
 * organization row. This helper signals failure via thrown errors with
 * descriptive `cause` so the route handler can decide rollback scope.
 */
export async function provisionOrgAdmin(
  supabase: SupabaseClient,
  input: ProvisionAdminInput
): Promise<ProvisionAdminResult> {
  const { organizationId, email, firstName, lastName, password } = input

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName ?? undefined,
      last_name: lastName ?? undefined,
    },
  })

  if (authError || !authData?.user) {
    const reason = authError?.message ?? 'unknown auth error'
    logger.error('provisionOrgAdmin: auth.admin.createUser failed', {
      organizationId,
      reason,
    })
    throw new ProvisioningError('auth_create_failed', reason)
  }

  const adminId = authData.user.id

  // Build a display name from first/last so the `profiles.name` column (which
  // is NOT NULL in older migrations) gets a sane value even if the trigger
  // didn't populate it.
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || email

  // The `profiles` schema (migration 001) has `name`, not first_name/last_name.
  // We fold the optional first/last into the canonical `name` column and keep
  // the originals only in `user_metadata` on the auth row above.
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: adminId,
        organization_id: organizationId,
        role: 'org_admin',
        email,
        name: displayName,
      },
      { onConflict: 'id' }
    )

  if (profileError) {
    logger.error('provisionOrgAdmin: profile upsert failed', {
      organizationId,
      adminId,
      reason: profileError.message,
    })
    // Roll back the auth user we just created so the caller only needs to
    // worry about the organization row.
    const { error: deleteError } = await supabase.auth.admin.deleteUser(adminId)
    if (deleteError) {
      logger.error('provisionOrgAdmin: rollback deleteUser failed', {
        adminId,
        reason: deleteError.message,
      })
    }
    throw new ProvisioningError('profile_insert_failed', profileError.message)
  }

  return { adminId, adminEmail: email }
}

export type ProvisioningStage = 'auth_create_failed' | 'profile_insert_failed'

/**
 * Typed error so the route handler can distinguish at which stage provisioning
 * failed and decide whether to roll back the organization row.
 */
export class ProvisioningError extends Error {
  public readonly stage: ProvisioningStage

  constructor(stage: ProvisioningStage, message: string) {
    super(message)
    this.name = 'ProvisioningError'
    this.stage = stage
  }
}
