import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

interface BlogDetail {
  id: string
  title: string
  slug: string
  excerpt: string
  cover_image: string | null
  body: string
  author: string
  published_at: string
  created_at: string
  updated_at: string
}

interface BlogPageProps {
  params: Promise<{ slug: string }>
}

const BLOG_COLUMNS =
  'id, title, slug, excerpt, cover_image, body, author, published_at, created_at, updated_at'

/**
 * Fetches a single published blog post directly via Supabase admin client.
 * Avoids the self-RTT of the previous `fetch('/api/blogs/[slug]')` from a
 * Server Component.
 */
async function getBlogBySlug(slug: string): Promise<BlogDetail | null> {
  if (!slug || slug.length > 200) return null

  try {
    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    const { data, error } = await supabase
      .from('blogs')
      .select(BLOG_COLUMNS)
      .eq('slug', slug)
      .not('published_at', 'is', null)
      .lte('published_at', nowIso)
      .maybeSingle()

    if (error) {
      logger.error('Blog detail fetch error', { error: error.message, slug })
      return null
    }

    return (data as BlogDetail | null) ?? null
  } catch (err) {
    logger.error('Blog detail unexpected error', {
      error: err instanceof Error ? err.message : 'Unknown error',
      slug,
    })
    return null
  }
}

function formatPublishedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

export default async function BlogDetailPage({ params }: BlogPageProps) {
  const { slug } = await params
  const blog = await getBlogBySlug(slug)

  if (!blog) {
    notFound()
  }

  const publishedLabel = formatPublishedDate(blog.published_at)

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] shadow-xl">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-3">
              <Image
                src="/juvenex-logo.jpg"
                alt="Juvenex Logo"
                width={40}
                height={40}
                className="rounded-xl shadow-lg object-contain bg-white p-1"
              />
              <div>
                <h1 className="text-lg font-bold text-[#2D352C]">Juvenex</h1>
                <p className="text-xs text-[var(--accent)]">Featured Blog</p>
              </div>
            </Link>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-bold text-[var(--accent)] hover:underline"
        >
          <span aria-hidden>&larr;</span> Back to home
        </Link>

        <article className="bg-white rounded-2xl border border-[#E5EAE3] shadow-xl overflow-hidden">
          {blog.cover_image && (
            <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-[#F5F8F3] to-[#EEF1ED]">
              <Image
                src={blog.cover_image}
                alt={blog.title}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
                priority
              />
            </div>
          )}

          <div className="p-5 sm:p-6 space-y-4">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2D352C] leading-tight">
                {blog.title}
              </h1>
              <p className="text-xs text-[#8B9B83]">
                By <span className="font-semibold text-[#6B7567]">{blog.author}</span>
                {publishedLabel ? <> &middot; {publishedLabel}</> : null}
              </p>
            </div>

            <p className="text-base text-[#4A5A4C] leading-relaxed border-l-4 border-[var(--accent)] pl-3 italic">
              {blog.excerpt}
            </p>

            <div className="text-base text-[#2D352C] leading-relaxed whitespace-pre-wrap">
              {blog.body}
            </div>
          </div>
        </article>
      </main>

      <BottomNav />
    </div>
  )
}
