import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { verifyImageMagicBytes } from '@/lib/image-validation'
import { errorMessage } from '@/lib/error-utils'

// Bucket assumed to exist (provisioned out-of-band). When the bucket is
// missing (e.g. fresh tenant install) we fall back to a data-URL stored
// directly in profiles.avatar_url so the feature still works.
const AVATARS_BUCKET = 'avatars'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB
const ALLOWED_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
])

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

function bufferToDataUrl(buf: ArrayBuffer, mime: string): string {
  const base64 = Buffer.from(buf).toString('base64')
  return `data:${mime};base64,${base64}`
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

    const rl = rateLimit(`avatar-upload:${user.id}`, 5, 60_000)
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
      logger.warn('avatar-upload formData parse failed', {
        error: errorMessage(err),
      })
      return Response.json(
        { success: false, error: 'Invalid multipart payload' },
        { status: 400 }
      )
    }

    const fileEntry = formData.get('file')
    if (!(fileEntry instanceof File)) {
      return Response.json(
        {
          success: false,
          error: 'Field "file" is required and must be a file',
        },
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
        { success: false, error: 'File exceeds 25MB limit' },
        { status: 413 }
      )
    }

    const mime = (fileEntry.type || '').toLowerCase()
    if (!ALLOWED_MIME.has(mime)) {
      return Response.json(
        {
          success: false,
          error: 'Unsupported file type. Use PNG, JPEG, or WebP.',
        },
        { status: 415 }
      )
    }

    const arrayBuf = await fileEntry.arrayBuffer()

    if (!verifyImageMagicBytes(arrayBuf, mime)) {
      logger.warn('avatar-upload magic-byte mismatch', {
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

    const supabase = createAdminClient()
    const ext = extensionFor(mime)
    const objectName = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`

    let avatarUrl: string | null = null

    const { error: uploadError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(objectName, arrayBuf, {
        contentType: mime,
        cacheControl: '31536000',
        upsert: false,
      })

    if (uploadError) {
      // Bucket may not exist for this tenant — fall back to data-URL storage.
      logger.warn('avatar-upload bucket upload failed, falling back to data URL', {
        error: uploadError.message,
        userId: user.id,
      })
      avatarUrl = bufferToDataUrl(arrayBuf, mime)
    } else {
      const { data: publicUrl } = supabase.storage
        .from(AVATARS_BUCKET)
        .getPublicUrl(objectName)
      if (!publicUrl?.publicUrl) {
        logger.error('avatar-upload public URL missing', { objectName })
        return Response.json(
          { success: false, error: 'Failed to resolve uploaded image URL' },
          { status: 500 }
        )
      }
      avatarUrl = publicUrl.publicUrl
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id)

    if (updateError) {
      logger.error('avatar-upload profile update failed', {
        error: updateError.message,
        userId: user.id,
      })
      return Response.json(
        { success: false, error: 'Failed to save avatar' },
        { status: 500 }
      )
    }

    return Response.json(
      {
        success: true,
        data: { avatar_url: avatarUrl },
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    logger.error('avatar-upload error', { error: errorMessage(error) })
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
