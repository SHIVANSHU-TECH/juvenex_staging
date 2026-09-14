import { NextRequest } from 'next/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { getGlobalPrescribeRxConfig } from '@/lib/prescriberx-config'
import {
  fetchEncounterTypeSchema,
  isEncounterTypesConfigured,
} from '@/lib/prescriberx-encounter-types'

// Returns the field schema for a single PrescribeRx telehealth encounter
// type. Path param `id` is validated as a UUID (the upstream IDs are
// UUID-v7-shaped — `z.string().uuid()` accepts them).
//
// Status mapping:
//   503 — upstream not configured (env vars missing)
//   400 — invalid id (not a UUID)
//   404 — upstream returned 404 for this id
//   502 — any other upstream failure
// We never forward upstream error bodies; failures are logged server-side.

const paramsSchema = z.object({ id: z.string().uuid() })

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isEncounterTypesConfigured()) {
    return Response.json(
      { success: false, error: 'Encounter types not configured' },
      { status: 503 }
    )
  }

  const resolved = await params
  const parsed = paramsSchema.safeParse(resolved)
  if (!parsed.success) {
    return Response.json(
      { success: false, error: 'Invalid encounter type id' },
      { status: 400 }
    )
  }

  try {
    // Schema is platform-wide metadata — use global config.
    const config = getGlobalPrescribeRxConfig()
    const data = await fetchEncounterTypeSchema(
      parsed.data.id,
      config ? { config } : {}
    )
    return Response.json({ success: true, data })
  } catch (error: unknown) {
    const status = (error as Error & { status?: number })?.status
    logger.error('encounter-type schema GET error', {
      encounterTypeId: parsed.data.id,
      error: error instanceof Error ? error.message : String(error),
    })
    if (status === 404) {
      return Response.json(
        { success: false, error: 'Encounter type not found' },
        { status: 404 }
      )
    }
    return Response.json(
      { success: false, error: 'Failed to load encounter type schema' },
      { status: 502 }
    )
  }
}
