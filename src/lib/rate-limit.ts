// Rate limiting primitives.
//
// This file exposes TWO different rate-limiters with very different semantics:
//
//   1. rateLimit() — in-memory, per-process burst protection. Resets on PM2
//      restart by design; suitable for cheap "no more than N requests per
//      minute" checks where eventual leakage on restart is acceptable.
//
//   2. consumeDailyAiQuota() — Postgres-backed daily counter (table
//      ai_usage_daily, migration 020). Survives PM2 restarts and is the
//      authoritative free-tier gate.
//
// Do not collapse these into one function: per-route burst protection runs on
// every request and must be in-process to stay sub-millisecond, while the
// daily quota is durable, cross-instance, and tolerates a Postgres roundtrip.

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

const MAX_ENTRIES = 10000
const CLEANUP_INTERVAL_MS = 60_000

// Periodically purge expired entries to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(key)
    }
  }
}, CLEANUP_INTERVAL_MS)

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number } {
  const now = Date.now()
  const record = rateLimitMap.get(key)

  if (!record || now > record.resetTime) {
    // Enforce cap before inserting a new entry
    if (!record && rateLimitMap.size >= MAX_ENTRIES) {
      // Evict the oldest expired entry if any, otherwise deny to protect memory
      let evicted = false
      for (const [k, v] of rateLimitMap.entries()) {
        if (now > v.resetTime) {
          rateLimitMap.delete(k)
          evicted = true
          break
        }
      }
      if (!evicted) {
        return { success: false, remaining: 0 }
      }
    }

    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs })
    return { success: true, remaining: limit - 1 }
  }

  if (record.count >= limit) {
    return { success: false, remaining: 0 }
  }

  record.count++
  return { success: true, remaining: limit - record.count }
}

// =============================================================================
// Postgres-backed daily AI quota
// =============================================================================

export interface DailyQuotaResult {
  allowed: boolean
  used: number
  limit: number
  resetsAt: Date
}

/**
 * Compute the next UTC midnight from a given moment. The free-tier daily
 * counter resets at 00:00 UTC; surfacing this to the client lets the UI show a
 * countdown to reset.
 */
function nextUtcMidnight(from: Date): Date {
  const next = new Date(from)
  next.setUTCDate(next.getUTCDate() + 1)
  next.setUTCHours(0, 0, 0, 0)
  return next
}

/**
 * Consume one unit of a user's daily AI message quota.
 *
 * Strategy: SELECT current count, then UPSERT (newCount). The (user_id,
 * usage_date) primary key + onConflict serializes concurrent writes, so two
 * concurrent requests that both observed currentCount = 4 will both write
 * message_count = 5; the limit is honored within one off-by-one under burst
 * contention, which is bounded by the in-memory burst limiter (AI_CHAT_BURST_
 * LIMIT requests/minute).
 *
 * Failure mode: if Postgres is unreachable, FAIL OPEN (allow the request) and
 * log via logger.error. Failing closed would deny every free user during a
 * brief DB blip; over-serving by a few messages is the better trade-off for a
 * 5-message/day soft limit.
 */
export async function consumeDailyAiQuota(
  userId: string,
  dailyLimit: number
): Promise<DailyQuotaResult> {
  const now = new Date()
  const resetsAt = nextUtcMidnight(now)
  // ISO date for today. Aligns with the `usage_date DATE DEFAULT CURRENT_DATE`
  // column; app servers run in UTC so today's UTC date is what Postgres sees.
  const today = now.toISOString().slice(0, 10)

  try {
    const supabase = createAdminClient()

    const { data: existing, error: selectError } = await supabase
      .from('ai_usage_daily')
      .select('message_count')
      .eq('user_id', userId)
      .eq('usage_date', today)
      .maybeSingle<{ message_count: number }>()

    if (selectError) {
      logger.error('rate-limit: ai_usage_daily SELECT failed', {
        userId,
        error: selectError.message,
      })
      return { allowed: true, used: 0, limit: dailyLimit, resetsAt }
    }

    const currentCount = existing?.message_count ?? 0

    if (currentCount >= dailyLimit) {
      // Quota exhausted — do NOT increment.
      return {
        allowed: false,
        used: currentCount,
        limit: dailyLimit,
        resetsAt,
      }
    }

    const newCount = currentCount + 1

    const { error: upsertError } = await supabase
      .from('ai_usage_daily')
      .upsert(
        {
          user_id: userId,
          usage_date: today,
          message_count: newCount,
          updated_at: now.toISOString(),
        },
        { onConflict: 'user_id,usage_date' }
      )

    if (upsertError) {
      logger.error('rate-limit: ai_usage_daily UPSERT failed', {
        userId,
        error: upsertError.message,
      })
      // Fail open — see docstring.
      return { allowed: true, used: currentCount, limit: dailyLimit, resetsAt }
    }

    return {
      allowed: true,
      used: newCount,
      limit: dailyLimit,
      resetsAt,
    }
  } catch (error: unknown) {
    logger.error('rate-limit: consumeDailyAiQuota threw', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { allowed: true, used: 0, limit: dailyLimit, resetsAt }
  }
}
