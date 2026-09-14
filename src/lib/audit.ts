import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

interface AuditParams {
  userId?: string
  action: string
  resourceType?: string
  resourceId?: string
  details?: Record<string, unknown>
  ipAddress?: string
}

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Write to the dead-letter queue when audit_logs INSERT fails. Returns true
 * on success so the caller can decide whether to escalate to logger.error.
 *
 * The DLQ table (migration 020) accepts the same columns as audit_logs plus a
 * `failure_reason` text column. A separate replay job will drain it back into
 * audit_logs once the underlying issue (RLS misconfig, schema drift, brief
 * outage, etc.) is resolved.
 */
async function writeAuditDlq(
  supabase: SupabaseClient,
  params: AuditParams,
  resourceType: string,
  failureReason: string
): Promise<boolean> {
  try {
    const { error } = await supabase.from('audit_log_dlq').insert({
      user_id: params.userId ?? null,
      action: params.action,
      resource_type: resourceType,
      resource_id: params.resourceId ?? null,
      details: params.details ?? null,
      ip_address: params.ipAddress ?? null,
      failure_reason: failureReason,
    })
    if (error) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Append-only HIPAA audit log writer. Two-step fail-safe:
 *   1. Try INSERT into audit_logs.
 *   2. If that fails, INSERT into audit_log_dlq with the original failure
 *      reason; a background replay job drains the DLQ later.
 *   3. If THAT also fails, surface via logger.error so structured logging
 *      catches it. Never throw — audit failures must not break the request.
 *
 * Per HIPAA §164.312(b), the audit trail must be reliable; silently swallowing
 * errors as the previous implementation did is a compliance gap (Tier 2 #14
 * in docs/COMPREHENSIVE_AUDIT_2026-04-27.md).
 */
export async function logAudit(params: AuditParams): Promise<void> {
  // audit_logs.resource_type is NOT NULL — default to the action name when
  // not provided.
  const resourceType = params.resourceType ?? params.action

  let supabase: SupabaseClient
  try {
    supabase = getSupabase()
  } catch (error: unknown) {
    logger.error('[AUDIT] Failed to construct Supabase client', {
      action: params.action,
      userId: params.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return
  }

  let primaryFailureReason: string | null = null

  try {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: params.userId ?? null,
      action: params.action,
      resource_type: resourceType,
      resource_id: params.resourceId ?? null,
      details: params.details ?? null,
      ip_address: params.ipAddress ?? null,
    })
    if (error) {
      primaryFailureReason = error.message
    }
  } catch (error: unknown) {
    primaryFailureReason =
      error instanceof Error ? error.message : 'Unknown error'
  }

  if (primaryFailureReason === null) {
    return // primary write succeeded
  }

  // Step 2: try the DLQ.
  const dlqOk = await writeAuditDlq(
    supabase,
    params,
    resourceType,
    primaryFailureReason
  )

  if (dlqOk) {
    // Best-effort observability: log a warning so monitoring can alert on
    // sustained DLQ growth even though we recovered from this individual
    // event.
    logger.warn('[AUDIT] primary write failed; row written to audit_log_dlq', {
      action: params.action,
      userId: params.userId,
      reason: primaryFailureReason,
    })
    return
  }

  // Step 3: both writes failed — escalate via the structured logger so the
  // event is at least captured in stderr/log shipping, even though the
  // database record is lost.
  logger.error('[AUDIT] primary AND DLQ writes failed', {
    action: params.action,
    userId: params.userId,
    reason: primaryFailureReason,
  })
}
