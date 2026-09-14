import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { verifyImageMagicBytes } from '@/lib/image-validation'
import { errorMessage } from '@/lib/error-utils'

// POST /api/admin/blogs/upload — upload a blog cover image (super_admin only).
// Reuses the already-provisioned public `post-images` bucket under a blog/
// prefix so no new storage bucket needs provisioning.
const BUCKET = 'post-images'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

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
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (user.role !== 'super_admin') {
      return Response.json(
        { success: false, error: 'Forbidden: super_admin role required' },
        { status: 403 }
      )
    }

    const rl = rateLimit(`blog-image-upload:${user.id}`, 20, 60_000)
    if (!rl.success) {
      return Response.json({ success: false, error: 'Too many uploads' }, { status: 429 })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (err: unknown) {
      logger.warn('blog-image-upload formData parse failed', { error: errorMessage(err) })
      return Response.json({ success: false, error: 'Invalid multipart payload' }, { status: 400 })
    }

    const fileEntry = formData.get('image')
    if (!(fileEntry instanceof File)) {
      return Response.json(
        { success: false, error: 'Field "image" is required and must be a file' },
        { status: 400 }
      )
    }
    if (fileEntry.size <= 0) {
      return Response.json({ success: false, error: 'Empty file' }, { status: 400 })
    }
    if (fileEntry.size > MAX_BYTES) {
      return Response.json({ success: false, error: 'File exceeds 5MB limit' }, { status: 413 })
    }

    const mime = (fileEntry.type || '').toLowerCase()
    if (!ALLOWED_MIME.has(mime)) {
      return Response.json(
        { success: false, error: 'Unsupported file type. Use PNG, JPEG, WebP, or GIF.' },
        { status: 415 }
      )
    }

    const arrayBuf = await fileEntry.arrayBuffer()
    if (!verifyImageMagicBytes(arrayBuf, mime)) {
      logger.warn('blog-image-upload magic-byte mismatch', { userId: user.id, declared: mime })
      return Response.json(
        { success: false, error: 'File contents do not match the declared image type.' },
        { status: 415 }
      )
    }

    const supabase = createAdminClient()
    const ext = extensionFor(mime)
    const objectName = `blog/${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(objectName, arrayBuf, {
        contentType: mime,
        cacheControl: '31536000',
        upsert: false,
      })

    if (uploadError) {
      logger.error('blog-image-upload failed', { error: uploadError.message, userId: user.id })
      return Response.json({ success: false, error: 'Failed to upload image' }, { status: 500 })
    }

    const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(objectName)
    if (!publicUrl?.publicUrl) {
      logger.error('blog-image-upload public URL missing', { objectName })
      return Response.json(
        { success: false, error: 'Failed to resolve uploaded image URL' },
        { status: 500 }
      )
    }

    return Response.json(
      { success: true, data: { url: publicUrl.publicUrl, path: objectName } },
      { status: 201 }
    )
  } catch (error: unknown) {
    logger.error('blog-image-upload error', { error: errorMessage(error) })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
