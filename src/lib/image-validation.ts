/**
 * Image MIME validation by magic bytes.
 *
 * Why: A client can declare any Content-Type header on an upload. Trusting the
 * declared MIME alone lets an attacker upload an executable script disguised
 * with `image/png` and have us hand back a public URL to it. We verify the
 * file's leading bytes match the declared format before accepting it.
 *
 * Supported formats (matches the upload route's ALLOWED_MIME set):
 *   - image/png   89 50 4E 47 0D 0A 1A 0A
 *   - image/jpeg  FF D8 FF
 *   - image/webp  "RIFF" .... "WEBP"  (52 49 46 46 ?? ?? ?? ?? 57 45 42 50)
 *   - image/gif   "GIF87a" or "GIF89a" (47 49 46 38 37/39 61)
 */

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const JPEG_MAGIC = [0xff, 0xd8, 0xff] as const
const GIF87_MAGIC = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const
const GIF89_MAGIC = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46] as const
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50] as const

function startsWith(bytes: Uint8Array, sig: readonly number[]): boolean {
  if (bytes.length < sig.length) return false
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) return false
  }
  return true
}

function isPng(bytes: Uint8Array): boolean {
  return startsWith(bytes, PNG_MAGIC)
}

function isJpeg(bytes: Uint8Array): boolean {
  return startsWith(bytes, JPEG_MAGIC)
}

function isGif(bytes: Uint8Array): boolean {
  return startsWith(bytes, GIF87_MAGIC) || startsWith(bytes, GIF89_MAGIC)
}

function isWebp(bytes: Uint8Array): boolean {
  // RIFF ???? WEBP — 4 bytes for "RIFF", 4 bytes for size, then "WEBP".
  if (bytes.length < 12) return false
  if (!startsWith(bytes, RIFF_MAGIC)) return false
  for (let i = 0; i < WEBP_MAGIC.length; i++) {
    if (bytes[8 + i] !== WEBP_MAGIC[i]) return false
  }
  return true
}

/**
 * Verify that the first bytes of `buf` match the declared MIME type.
 * Returns true only when both the buffer is recognised AND it matches the
 * declared MIME. Unknown MIME types always fail closed.
 */
export function verifyImageMagicBytes(
  buf: ArrayBuffer,
  declaredMime: string
): boolean {
  // 12 bytes is enough for every supported format (WebP needs 12).
  const head = new Uint8Array(buf.slice(0, 12))
  switch (declaredMime.toLowerCase()) {
    case 'image/png':
      return isPng(head)
    case 'image/jpeg':
    case 'image/jpg':
      return isJpeg(head)
    case 'image/webp':
      return isWebp(head)
    case 'image/gif':
      return isGif(head)
    default:
      return false
  }
}
