import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { verifyImageMagicBytes } from '@/lib/image-validation'
import { errorMessage } from '@/lib/error-utils'

const POST_IMAGES_BUCKET = 'post-images'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

function extensionFor(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    default:
      return 'bin'
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const rl = rateLimit(`post-image-upload:${user.id}`, 10, 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many uploads' },
        { status: 429 }
      )
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (err: unknown) {
      logger.warn('post-image-upload formData parse failed', {
        error: errorMessage(err),
      })
      return Response.json(
        { success: false, error: 'Invalid multipart payload' },
        { status: 400 }
      )
    }

    const fileEntry = formData.get('image')
    if (!(fileEntry instanceof File)) {
      return Response.json(
        { success: false, error: 'Field "image" is required and must be a file' },
        { status: 400 }
      )
    }

    if (fileEntry.size <= 0) {
      return Response.json(
        { success: false, error: 'Empty file' },
        { status: 400 }
      )
    }

    if (fileEntry.size > MAX_BYTES) {
      return Response.json(
        { success: false, error: 'File exceeds 5MB limit' },
        { status: 413 }
      )
    }

    const mime = (fileEntry.type || '').toLowerCase()
    if (!ALLOWED_MIME.has(mime)) {
      return Response.json(
        { success: false, error: 'Unsupported file type. Use PNG, JPEG, WebP, or GIF.' },
        { status: 415 }
      )
    }

    const supabase = createAdminClient()

    const ext = extensionFor(mime)
    // Path layout: <userId>/<timestamp>-<random>.<ext>
    // Storage RLS (see migration 010) requires the first folder to equal the
    // user id; the service role bypasses RLS but we keep the layout consistent.
    const objectName = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`

    const arrayBuf = await fileEntry.arrayBuffer()

    // Defense-in-depth: the declared Content-Type header is attacker-controlled.
    // Verify the file's magic bytes match the declared MIME before persisting.
    if (!verifyImageMagicBytes(arrayBuf, mime)) {
      logger.warn('post-image-upload magic-byte mismatch', {
        userId: user.id,
        declared: mime,
      })
      return Response.json(
        {
          success: false,
          error: 'File contents do not match the declared image type.',
        },
        { status: 415 }
      )
    }

    const { error: uploadError } = await supabase.storage
      .from(POST_IMAGES_BUCKET)
      .upload(objectName, arrayBuf, {
        contentType: mime,
        cacheControl: '31536000',
        upsert: false,
      })

    if (uploadError) {
      logger.error('post-image-upload failed', {
        error: uploadError.message,
        userId: user.id,
      })
      return Response.json(
        { success: false, error: 'Failed to upload image' },
        { status: 500 }
      )
    }

    const { data: publicUrl } = supabase.storage
      .from(POST_IMAGES_BUCKET)
      .getPublicUrl(objectName)

    if (!publicUrl?.publicUrl) {
      logger.error('post-image-upload public URL missing', { objectName })
      return Response.json(
        { success: false, error: 'Failed to resolve uploaded image URL' },
        { status: 500 }
      )
    }

    return Response.json(
      {
        success: true,
        data: { url: publicUrl.publicUrl, path: objectName },
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    logger.error('post-image-upload error', { error: errorMessage(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
