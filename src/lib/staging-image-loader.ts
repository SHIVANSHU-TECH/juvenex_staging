/**
 * Custom next/image loader for basePath `/staging`.
 *
 * Local public files are returned as direct `/staging/...` URLs (no optimizer).
 * That avoids 404s from the optimizer and from `unoptimized` images that would
 * otherwise keep a root-relative `/file.png` src.
 */
export default function stagingImageLoader({
  src,
}: {
  src: string
  width: number
  quality?: number
}): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/staging'

  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:') ||
    src.startsWith('blob:')
  ) {
    return src
  }

  if (src.startsWith(basePath + '/') || src === basePath) return src
  return `${basePath}${src.startsWith('/') ? src : `/${src}`}`
}
