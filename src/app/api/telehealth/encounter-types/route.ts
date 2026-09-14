import { logger } from '@/lib/logger'
import { getGlobalPrescribeRxConfig } from '@/lib/prescriberx-config'
import {
  fetchEncounterTypes,
  isEncounterTypesConfigured,
} from '@/lib/prescriberx-encounter-types'

// Public read-only listing of PrescribeRx telehealth encounter types
// (e.g. "GLP-1 Screening", "Female HRT", "Male TRT Consult").
//
// Mirrors the shape used by /api/packages: { success, data, meta }. We do
// NOT expose upstream error bodies to callers; failures are mapped to a
// generic 502/503 envelope and the upstream message is logged server-side.

export async function GET() {
  if (!isEncounterTypesConfigured()) {
    return Response.json(
      { success: false, error: 'Encounter types not configured' },
      { status: 503 }
    )
  }

  try {
    // Encounter types are platform-wide metadata — global config is correct
    // here even when the caller belongs to a tenant org.
    const config = getGlobalPrescribeRxConfig()
    const data = await fetchEncounterTypes(config ? { config } : {})
    return Response.json({
      success: true,
      data,
      meta: {
        total: data.length,
        source: 'prescriberx',
      },
    })
  } catch (error: unknown) {
    logger.error('encounter-types GET error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      { success: false, error: 'Failed to load encounter types' },
      { status: 502 }
    )
  }
}
