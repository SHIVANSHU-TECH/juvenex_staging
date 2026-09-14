import 'server-only'

import { access } from 'node:fs/promises'
import path from 'node:path'

/**
 * Resolves the hero's scrub videos at request time.
 *
 * The two clips are not in the repository — they could not be pulled out of the
 * source design project (the design MCP truncates files at 256 KiB and both are
 * several MB). See public/jx/video/README.md.
 *
 * Checking on the server rather than letting the client fetch-and-catch keeps a
 * pair of 404s out of every visitor's console, and means dropping the files in
 * activates the video hero with no code change and no redeploy of the client
 * bundle.
 */

const PUBLIC_DIR = path.join(process.cwd(), 'public')

const CANDIDATES = {
  a: '/jx/video/hero-a.mp4',
  b: '/jx/video/hero-b.mp4',
} as const

export interface HeroMedia {
  videoA: string | null
  videoB: string | null
}

async function exists(publicPath: string): Promise<boolean> {
  try {
    await access(path.join(PUBLIC_DIR, publicPath))
    return true
  } catch {
    return false
  }
}

export async function getHeroMedia(): Promise<HeroMedia> {
  const [a, b] = await Promise.all([exists(CANDIDATES.a), exists(CANDIDATES.b)])
  return {
    videoA: a ? CANDIDATES.a : null,
    // The second clip is only meaningful as the continuation of the first;
    // showing it alone would start the hero mid-story.
    videoB: a && b ? CANDIDATES.b : null,
  }
}
