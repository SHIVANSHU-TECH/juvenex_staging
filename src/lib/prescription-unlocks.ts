import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

interface AppointmentRefRow {
  provider_patient_ref: string | null
  organization_id: string | null
}

interface UnlockRow {
  product_id: string
}

export async function fetchPrescriptionUnlockedProductIds(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    organizationId?: string | null
    productIds?: readonly string[]
  } = {}
): Promise<Set<string>> {
  try {
    let refsQuery = supabase
      .from('appointments')
      .select('provider_patient_ref, organization_id')
      .eq('user_id', userId)
      .not('provider_patient_ref', 'is', null)

    if (opts.organizationId) {
      refsQuery = refsQuery.eq('organization_id', opts.organizationId)
    }

    const { data: refRows, error: refsError } = await refsQuery
    if (refsError) {
      logger.warn('prescription-unlocks: appointment refs lookup failed', {
        userId,
        error: refsError.message,
      })
      return new Set()
    }

    const rows = (refRows ?? []) as AppointmentRefRow[]
    const providerRefs = Array.from(
      new Set(rows.map((row) => row.provider_patient_ref).filter(Boolean) as string[])
    )
    const organizationIds = Array.from(
      new Set(
        rows
          .map((row) => row.organization_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    )

    if (providerRefs.length === 0) return new Set()

    let unlocksQuery = supabase
      .from('prescription_unlocks')
      .select('product_id')
      .in('provider_patient_ref', providerRefs)
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

    if (opts.organizationId) {
      unlocksQuery = unlocksQuery.eq('organization_id', opts.organizationId)
    } else if (organizationIds.length > 0) {
      unlocksQuery = unlocksQuery.in('organization_id', organizationIds)
    }

    if (opts.productIds && opts.productIds.length > 0) {
      unlocksQuery = unlocksQuery.in('product_id', Array.from(new Set(opts.productIds)))
    }

    const { data: unlockRows, error: unlocksError } = await unlocksQuery
    if (unlocksError) {
      logger.warn('prescription-unlocks: unlock lookup failed', {
        userId,
        error: unlocksError.message,
      })
      return new Set()
    }

    return new Set(((unlockRows ?? []) as UnlockRow[]).map((row) => row.product_id))
  } catch (error: unknown) {
    logger.warn('prescription-unlocks: lookup threw', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return new Set()
  }
}
