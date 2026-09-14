import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { verifyImageMagicBytes } from '@/lib/image-validation'

const PROGRESS_PHOTO_BUCKET = 'progress-photos'
const SIGNED_URL_TTL_SECONDS = 300
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * Fail-closed check: verifies the progress-photos bucket is NOT marked
 * `public` at the Supabase storage level. If the bucket is public, raw
 * photo_url values are accessible without a signed URL — a HIPAA risk.
 * Returns `true` when the bucket is safely private (or the check cannot
 * be evaluated defensively). Returns `false` ONLY when we positively
 * confirm public=true, in which case the caller must 503.
 */
async function isBucketPrivate(
  supabase: ReturnType<typeof getSupabase>
): Promise<{ ok: boolean; reason?: string; missing?: boolean }> {
  try {
    const { data: bucket, error } = await supabase.storage.getBucket(
      PROGRESS_PHOTO_BUCKET
    )
    if (error) {
      // "Bucket not found" means the bucket hasn't been provisioned yet.
      // This is not a HIPAA risk (no photos can exist without a bucket),
      // so treat it as "no data" rather than refusing service.
      const isMissing = /not found/i.test(error.message)
      if (isMissing) {
        return { ok: false, reason: 'bucket_missing', missing: true }
      }
      logger.error('progress-photos bucket lookup failed', {
        error: error.message,
      })
      return { ok: false, reason: 'bucket_lookup_failed' }
    }
    if (bucket?.public === true) {
      logger.error('progress-photos bucket is public — HIPAA risk', {
        bucket: PROGRESS_PHOTO_BUCKET,
      })
      return { ok: false, reason: 'bucket_public' }
    }
    return { ok: true }
  } catch (err: unknown) {
    logger.error('progress-photos bucket privacy check threw', {
      error: errorMessage(err),
    })
    return { ok: false, reason: 'bucket_check_threw' }
  }
}

interface ProgressPhotoRow {
  id: string
  user_id: string
  photo_url: string | null
  storage_path?: string | null
  weight: number | null
  notes: string | null
  is_public: boolean
  created_at: string
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}

function extensionFor(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    default:
      return 'bin'
  }
}

async function ensurePrivateBucket(
  supabase: ReturnType<typeof getSupabase>
): Promise<{ ok: boolean; error?: string }> {
  const privacy = await isBucketPrivate(supabase)
  if (privacy.ok) return { ok: true }
  if (!privacy.missing) return { ok: false, error: privacy.reason }

  const { error } = await supabase.storage.createBucket(PROGRESS_PHOTO_BUCKET, {
    public: false,
    fileSizeLimit: MAX_UPLOAD_BYTES,
    allowedMimeTypes: Array.from(ALLOWED_MIME),
  })
  if (error) {
    logger.error('progress-photos bucket create failed', {
      error: error.message,
    })
    return { ok: false, error: 'bucket_create_failed' }
  }
  return { ok: true }
}

/**
 * Extracts the storage object path from a full Supabase storage URL.
 * Accepts both public and signed URL shapes, e.g.:
 *   https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *   https://<proj>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=...
 * Returns null if the URL cannot be parsed into a bucket/path pair.
 */
function extractStoragePath(rawUrl: string, bucket: string): string | null {
  try {
    const url = new URL(rawUrl)
    const marker = `/storage/v1/object/`
    const idx = url.pathname.indexOf(marker)
    if (idx === -1) return null
    // Strip up through `/object/` and then the leading access qualifier
    // (e.g. `public/`, `sign/`, `authenticated/`).
    const afterObject = url.pathname.slice(idx + marker.length)
    const parts = afterObject.split('/')
    if (parts.length < 2) return null
    const [, maybeBucket, ...rest] = parts
    // Layout is `<qualifier>/<bucket>/<path...>`
    if (maybeBucket !== bucket) return null
    return rest.join('/')
  } catch (error: unknown) {
    logger.error('patient/progress-photos extractStoragePath error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function toSignedPhoto(
  photo: ProgressPhotoRow
): Promise<ProgressPhotoRow> {
  const storagePath =
    photo.storage_path ||
    (photo.photo_url
      ? extractStoragePath(photo.photo_url, PROGRESS_PHOTO_BUCKET)
      : null)
  if (!storagePath) return photo

  const supabase = getSupabase()
  const { data, error } = await supabase.storage
    .from(PROGRESS_PHOTO_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    logger.error('Failed to create signed URL for progress photo', {
      photoId: photo.id,
      error: error?.message,
    })
    return photo
  }

  return { ...photo, photo_url: data.signedUrl }
}

// GET /api/patient/progress-photos - Fetch user's progress photos
export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = getSupabase()

    // Fail-closed HIPAA check: refuse service if the storage bucket is
    // public. Signed URLs alone are not enough if the raw ACL is public.
    const privacy = await isBucketPrivate(supabase)
    if (!privacy.ok) {
      // Bucket not provisioned yet → no photos can exist; return empty.
      if (privacy.missing) {
        return Response.json({ success: true, data: [] })
      }
      return Response.json(
        { success: false, error: 'Storage misconfigured. Contact admin.' },
        { status: 503 }
      )
    }

    const { data, error } = await supabase
      .from('progress_photos')
      .select('id, user_id, photo_url, storage_path, weight, notes, is_public, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      logger.error('Failed to fetch progress photos', { error: error.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const rows = (data ?? []) as ProgressPhotoRow[]
    const signed = await Promise.all(rows.map(toSignedPhoto))

    await logAudit({
      userId: user.id,
      action: 'view_progress_photos',
      resourceType: 'progress_photo',
    }).catch(() => {})

    return Response.json({ success: true, data: signed })
  } catch (error: unknown) {
    logger.error('Failed to fetch progress photos', { error: errorMessage(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

const progressPhotoSchema = z.object({
  photo_url: z.string().url().refine(url => {
    try {
      const host = new URL(url).hostname
      return host.endsWith('.supabase.co') || host === 'localhost'
    } catch { return false }
  }, 'Photo URL must be from approved storage'),
  weight: z.number().positive().optional(),
  notes: z.string().max(1000).optional(),
  is_public: z.boolean().optional(),
})

async function parseProgressPhotoPayload(
  request: NextRequest,
  userId: string,
  supabase: ReturnType<typeof getSupabase>
): Promise<
  | { ok: true; photo_url: string; storage_path: string | null; weight?: number; notes?: string; is_public: boolean }
  | { ok: false; response: Response }
> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    const body: unknown = await request.json()
    const parsed = progressPhotoSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        response: Response.json(
          { success: false, error: 'Validation failed', details: parsed.error.issues },
          { status: 400 }
        ),
      }
    }
    return {
      ok: true,
      photo_url: parsed.data.photo_url,
      storage_path: extractStoragePath(parsed.data.photo_url, PROGRESS_PHOTO_BUCKET),
      weight: parsed.data.weight,
      notes: parsed.data.notes,
      is_public: parsed.data.is_public ?? false,
    }
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (error: unknown) {
    logger.warn('progress-photo formData parse failed', {
      error: errorMessage(error),
    })
    return {
      ok: false,
      response: Response.json(
        { success: false, error: 'Invalid multipart payload' },
        { status: 400 }
      ),
    }
  }

  const fileEntry = formData.get('file')
  if (!(fileEntry instanceof File)) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: 'Field "file" is required and must be a file' },
        { status: 400 }
      ),
    }
  }

  if (fileEntry.size <= 0) {
    return {
      ok: false,
      response: Response.json({ success: false, error: 'Empty file' }, { status: 400 }),
    }
  }

  if (fileEntry.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: 'File exceeds 25MB limit' },
        { status: 413 }
      ),
    }
  }

  const mime = (fileEntry.type || '').toLowerCase()
  if (!ALLOWED_MIME.has(mime)) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: 'Unsupported file type. Use PNG, JPEG, or WebP.' },
        { status: 415 }
      ),
    }
  }

  const arrayBuf = await fileEntry.arrayBuffer()
  if (!verifyImageMagicBytes(arrayBuf, mime)) {
    logger.warn('progress-photo magic-byte mismatch', {
      userId,
      declared: mime,
    })
    return {
      ok: false,
      response: Response.json(
        { success: false, error: 'File contents do not match the declared image type.' },
        { status: 415 }
      ),
    }
  }

  const bucket = await ensurePrivateBucket(supabase)
  if (!bucket.ok) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: 'Storage misconfigured. Contact admin.' },
        { status: 503 }
      ),
    }
  }

  const ext = extensionFor(mime)
  const storagePath = `${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from(PROGRESS_PHOTO_BUCKET)
    .upload(storagePath, arrayBuf, {
      contentType: mime,
      cacheControl: '31536000',
      upsert: false,
    })

  if (uploadError) {
    logger.error('progress-photo storage upload failed', {
      userId,
      error: uploadError.message,
    })
    return {
      ok: false,
      response: Response.json(
        { success: false, error: 'Failed to upload image' },
        { status: 500 }
      ),
    }
  }

  const { data: publicUrl } = supabase.storage
    .from(PROGRESS_PHOTO_BUCKET)
    .getPublicUrl(storagePath)

  if (!publicUrl?.publicUrl) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: 'Failed to resolve uploaded image URL' },
        { status: 500 }
      ),
    }
  }

  const weightRaw = formData.get('weight')
  const parsedWeight: number | null =
    typeof weightRaw === 'string' && weightRaw.trim() !== ''
      ? Number(weightRaw)
      : null
  const notesRaw = formData.get('notes')
  const notes =
    typeof notesRaw === 'string' && notesRaw.trim() !== ''
      ? notesRaw.trim().slice(0, 1000)
      : undefined

  const isPublicRaw = formData.get('is_public')
  const isPublic = isPublicRaw === 'true' || isPublicRaw === '1'

  return {
    ok: true,
    photo_url: publicUrl.publicUrl,
    storage_path: storagePath,
    weight: parsedWeight !== null && Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : undefined,
    notes,
    is_public: isPublic,
  }
}

// POST /api/patient/progress-photos - Add a new progress photo record
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const rl = rateLimit(`progress-photos:${user.id}`, 20, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    const supabase = getSupabase()
    const payload = await parseProgressPhotoPayload(request, user.id, supabase)
    if (!payload.ok) return payload.response

    const bucket = await ensurePrivateBucket(supabase)
    if (!bucket.ok) {
      return Response.json(
        { success: false, error: 'Storage misconfigured. Contact admin.' },
        { status: 503 }
      )
    }

    const { data, error } = await supabase
      .from('progress_photos')
      .insert({
        user_id: user.id,
        photo_url: payload.photo_url,
        storage_path: payload.storage_path,
        weight: payload.weight ?? null,
        notes: payload.notes ?? null,
        is_public: payload.is_public,
      })
      .select('id, user_id, photo_url, storage_path, weight, notes, is_public, created_at')
      .single()

    if (error || !data) {
      logger.error('Failed to create progress photo', { error: error?.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const row = data as ProgressPhotoRow

    await logAudit({
      userId: user.id,
      action: 'upload_progress_photo',
      resourceType: 'progress_photo',
      resourceId: row.id,
    }).catch(() => {})

    const signed = await toSignedPhoto(row)

    return Response.json({ success: true, data: signed }, { status: 201 })
  } catch (error: unknown) {
    logger.error('Failed to create progress photo', { error: errorMessage(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

const patchSchema = z.object({
  photoId: z.string().uuid('Invalid photo id'),
  is_public: z.boolean(),
})

// PATCH /api/patient/progress-photos - Toggle a photo's public/private state.
// Owner-only. Public photos surface on the user's community profile; private
// ones stay visible only to the owner in /profile.
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`progress-photos-patch:${user.id}`, 40, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const body: unknown = await request.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('progress_photos')
      .update({ is_public: parsed.data.is_public })
      .eq('id', parsed.data.photoId)
      .eq('user_id', user.id)
      .select('id, user_id, photo_url, storage_path, weight, notes, is_public, created_at')
      .maybeSingle()

    if (error) {
      logger.error('Failed to update progress photo privacy', { error: error.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!data) {
      // No row matched the owner filter → not found or not owned.
      return Response.json({ success: false, error: 'Photo not found' }, { status: 404 })
    }

    await logAudit({
      userId: user.id,
      action: parsed.data.is_public ? 'publish_progress_photo' : 'unpublish_progress_photo',
      resourceType: 'progress_photo',
      resourceId: parsed.data.photoId,
    }).catch(() => {})

    const signed = await toSignedPhoto(data as ProgressPhotoRow)
    return Response.json({ success: true, data: signed })
  } catch (error: unknown) {
    logger.error('Failed to update progress photo privacy', { error: errorMessage(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/patient/progress-photos?photoId=xxx - Delete a progress photo
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const photoId = request.nextUrl.searchParams.get('photoId')
    if (!photoId) {
      return Response.json(
        { success: false, error: 'photoId query parameter is required' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    // Verify ownership
    const { data: photo, error: fetchError } = await supabase
      .from('progress_photos')
      .select('id, user_id, photo_url, storage_path')
      .eq('id', photoId)
      .maybeSingle()

    if (fetchError) {
      logger.error('Failed to fetch progress photo for delete', { error: fetchError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!photo) {
      return Response.json(
        { success: false, error: 'Photo not found' },
        { status: 404 }
      )
    }

    if (photo.user_id !== user.id) {
      return Response.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    const { error: deleteError } = await supabase
      .from('progress_photos')
      .delete()
      .eq('id', photoId)
      .eq('user_id', user.id)

    if (deleteError) {
      logger.error('Failed to delete progress photo', { error: deleteError.message })
      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }

    const storagePath =
      typeof photo.storage_path === 'string' && photo.storage_path.length > 0
        ? photo.storage_path
        : typeof photo.photo_url === 'string'
          ? extractStoragePath(photo.photo_url, PROGRESS_PHOTO_BUCKET)
          : null
    if (storagePath) {
      const { error: storageDeleteError } = await supabase.storage
        .from(PROGRESS_PHOTO_BUCKET)
        .remove([storagePath])
      if (storageDeleteError) {
        logger.warn('Failed to delete progress photo storage object', {
          photoId: photo.id,
          storagePath,
          error: storageDeleteError.message,
        })
      }
    }

    await logAudit({
      userId: user.id,
      action: 'delete_progress_photo',
      resourceType: 'progress_photo',
      resourceId: photo.id,
    }).catch(() => {})

    return Response.json({ success: true, message: 'Photo deleted' })
  } catch (error: unknown) {
    logger.error('Failed to delete progress photo', { error: errorMessage(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
