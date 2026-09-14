import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { verifyImageMagicBytes } from '@/lib/image-validation'
import { errorMessage } from '@/lib/error-utils'

// White-label signup is an UNAUTHENTICATED flow (the org admin does not exist
// yet), so this logo upload is public and rate-limited by IP. We reuse the
// existing public-read `post-images` bucket under a `white-label-logos/`
// prefix; the resulting *.supabase.co URL passes the image URL allowlist
// (src/lib/url-allowlist.ts), which is exactly why pasting an external URL
// failed and an upload is needed.
const LOGO_BUCKET = 'post-images'
const LOGO_PREFIX = 'white-label-logos'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB
const ALLOWED_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
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
    case 'image/svg+xml':
      return 'svg'
    default:
      return 'bin'
  }
}

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    // Generous burst budget — a user picking the right logo may try a few
    // times. This is upload-only and does not consume the signup attempt
    // budget, so failed picks no longer lock anyone out of signing up.
    const rl = rateLimit(`white-label-logo-upload:${ip}`, 20, 10 * 60_000)
    if (!rl.success) {
      return Response.json(
        { success: false, error: 'Too many uploads. Please wait a few minutes.' },
        { status: 429 }
      )
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (err: unknown) {
      logger.warn('white-label-logo formData parse failed', { error: errorMessage(err) })
      return Response.json(
        { success: false, error: 'Invalid upload. Please choose an image file.' },
        { status: 400 }
      )
    }

    const fileEntry = formData.get('logo') ?? formData.get('image')
    if (!(fileEntry instanceof File)) {
      return Response.json(
        { success: false, error: 'Please choose an image file to upload.' },
        { status: 400 }
      )
    }

    if (fileEntry.size <= 0) {
      return Response.json({ success: false, error: 'That file is empty.' }, { status: 400 })
    }

    if (fileEntry.size > MAX_BYTES) {
      return Response.json(
        { success: false, error: 'Logo must be 25MB or smaller.' },
        { status: 413 }
      )
    }

    const mime = (fileEntry.type || '').toLowerCase()
    if (!ALLOWED_MIME.has(mime)) {
      return Response.json(
        { success: false, error: 'Unsupported file type. Use PNG, JPEG, WebP, GIF, or SVG.' },
        { status: 415 }
      )
    }

    const arrayBuf = await fileEntry.arrayBuffer()

    // Defense-in-depth: the declared Content-Type is client-controlled. Verify
    // magic bytes for raster formats. SVG is text/XML (no reliable magic bytes)
    // so we do a light sanity check that it actually starts like SVG/XML.
    if (mime === 'image/svg+xml') {
      const head = Buffer.from(arrayBuf.slice(0, 512)).toString('utf8').trimStart().toLowerCase()
      if (!head.startsWith('<svg') && !head.startsWith('<?xml')) {
        return Response.json(
          { success: false, error: 'File contents do not look like an SVG.' },
          { status: 415 }
        )
      }
    } else if (!verifyImageMagicBytes(arrayBuf, mime)) {
      return Response.json(
        { success: false, error: 'File contents do not match the declared image type.' },
        { status: 415 }
      )
    }

    const supabase = createAdminClient()
    const ext = extensionFor(mime)
    const objectName = `${LOGO_PREFIX}/${Date.now()}-${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(objectName, arrayBuf, {
        contentType: mime,
        cacheControl: '31536000',
        upsert: false,
      })

    if (uploadError) {
      logger.error('white-label-logo upload failed', { error: uploadError.message })
      return Response.json(
        { success: false, error: 'Could not store the logo. Please try again.' },
        { status: 500 }
      )
    }

    const { data: publicUrl } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(objectName)
    if (!publicUrl?.publicUrl) {
      logger.error('white-label-logo public URL missing', { objectName })
      return Response.json(
        { success: false, error: 'Could not resolve the logo URL.' },
        { status: 500 }
      )
    }

    return Response.json(
      { success: true, data: { url: publicUrl.publicUrl, path: objectName } },
      { status: 201 }
    )
  } catch (error: unknown) {
    logger.error('white-label-logo error', { error: errorMessage(error) })
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
