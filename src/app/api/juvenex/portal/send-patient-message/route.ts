import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { juvenexClient } from '@/lib/juvenex/client'
import { orderIdSchema, sendPatientMessageSchema } from '@/lib/juvenex/schemas'
import { parseBody, requireUser, upstreamError } from '@/lib/juvenex/route-utils'
import { requireOwnedOrder } from '../_utils'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_MULTIPART_SIZE = 11 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])
const multipartMessageSchema = z.object({
  order_id: orderIdSchema,
  text: z.string().trim().max(10_000).optional(),
})

function isAllowedFile(file: File) {
  return ALLOWED_TYPES.has(file.type)
}

async function hasValidSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (file.type === 'application/pdf') return String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
  if (file.type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (file.type === 'image/png') return bytes.slice(0, 8).every((byte, i) => byte === [137, 80, 78, 71, 13, 10, 26, 10][i])
  if (file.type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(String.fromCharCode(...bytes.slice(0, 6)))
  if (file.type === 'image/webp') {
    return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  }
  return false
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(10, 'portal-message-send')
  if ('response' in auth) return auth.response

  let input: { order_id: string; text?: string }
  let file: File | undefined
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''

  if (contentType.startsWith('multipart/form-data')) {
    const contentLength = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_SIZE) {
      return Response.json({ error: 'Upload must be 10MB or smaller' }, { status: 413 })
    }
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return Response.json({ error: 'Invalid multipart form body' }, { status: 400 })
    }

    const rawFile = form.get('file')
    if (rawFile !== null && !(rawFile instanceof File)) {
      return Response.json({ error: 'Invalid file upload' }, { status: 400 })
    }
    file = rawFile instanceof File && rawFile.size > 0 ? rawFile : undefined

    const parsed = multipartMessageSchema.safeParse({
      order_id: form.get('order_id'),
      text: form.get('text') || undefined,
    })
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    input = parsed.data

    if (!input.text && !file) {
      return Response.json({ error: 'A message or file is required' }, { status: 400 })
    }
    if (file && file.size > MAX_FILE_SIZE) {
      return Response.json({ error: 'File must be 10MB or smaller' }, { status: 413 })
    }
    if (file && !isAllowedFile(file)) {
      return Response.json({ error: 'Only JPEG, PNG, WebP, GIF, and PDF files are allowed' }, { status: 415 })
    }
    if (file && !(await hasValidSignature(file))) {
      return Response.json({ error: 'File contents do not match the selected file type' }, { status: 415 })
    }
  } else if (contentType.startsWith('application/json')) {
    const parsed = await parseBody(request, sendPatientMessageSchema)
    if ('response' in parsed) return parsed.response
    input = parsed.data
  } else {
    return Response.json(
      { error: 'Content-Type must be application/json or multipart/form-data' },
      { status: 415 }
    )
  }

  try {
    const owned = await requireOwnedOrder(input.order_id, auth.user)
    if ('response' in owned) return owned.response

    return Response.json(await juvenexClient.sendPatientMessage(input, file))
  } catch (error: unknown) {
    return upstreamError(error)
  }
}
