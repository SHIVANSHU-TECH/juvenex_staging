import Image from 'next/image'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

// Blog index / listing page. Previously /blog 404'd (only /blog/[slug]
// existed); posts were reachable only from the dashboard's featured section.
// This lists every published post as a card linking to its detail page.

interface BlogListItem {
  id: string
  title: string
  slug: string
  excerpt: string
  cover_image: string | null
  section: string | null
  author: string
  published_at: string
}

const LIST_COLUMNS = 'id, title, slug, excerpt, cover_image, section, author, published_at'

const UNCATEGORIZED_LABEL = 'More articles'

async function getPublishedBlogs(): Promise<BlogListItem[]> {
  try {
    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('blogs')
      .select(LIST_COLUMNS)
      .not('published_at', 'is', null)
      .lte('published_at', nowIso)
      .order('published_at', { ascending: false })
      .limit(50)

    if (error) {
      logger.error('Blog index fetch error', { error: error.message })
      return []
    }
    return (data as BlogListItem[] | null) ?? []
  } catch (err) {
    logger.error('Blog index unexpected error', {
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return []
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

function sectionLabel(section: string | null): string {
  return section && section.trim() ? section.trim() : UNCATEGORIZED_LABEL
}

// Distinct section labels in stable first-appearance order (posts already
// arrive newest-first). Uncategorized posts are grouped under a trailing
// "More articles" bucket.
function distinctSections(posts: BlogListItem[]): string[] {
  const named: string[] = []
  let hasUncategorized = false
  for (const post of posts) {
    if (post.section && post.section.trim()) {
      const label = post.section.trim()
      if (!named.includes(label)) named.push(label)
    } else {
      hasUncategorized = true
    }
  }
  return hasUncategorized ? [...named, UNCATEGORIZED_LABEL] : named
}

function BlogCard({ post }: { post: BlogListItem }) {
  const date = formatPublishedDate(post.published_at)
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="block bg-white rounded-2xl border border-[#E5EAE3] shadow-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
    >
      {post.cover_image && (
        <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-[#F5F8F3] to-[#EEF1ED]">
          <Image
            src={post.cover_image}
            alt={post.title}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      )}
      <div className="p-5 space-y-2">
        {post.section && (
          <span className="inline-block rounded-full bg-[#EEF1ED] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--accent)]">
            {post.section}
          </span>
        )}
        <h2 className="text-xl font-extrabold text-[#2D352C] leading-tight">
          {post.title}
        </h2>
        <p className="text-xs text-[#8B9B83]">
          By <span className="font-semibold text-[#6B7567]">{post.author}</span>
          {date ? <> &middot; {date}</> : null}
        </p>
        <p className="text-sm text-[#4A5A4C] leading-relaxed line-clamp-3">
          {post.excerpt}
        </p>
        <span className="inline-block text-sm font-bold text-[var(--accent)]">
          Read more &rarr;
        </span>
      </div>
    </Link>
  )
}

interface BlogIndexPageProps {
  searchParams: Promise<{ section?: string | string[] }>
}

export default async function BlogIndexPage({ searchParams }: BlogIndexPageProps) {
  const posts = await getPublishedBlogs()

  const sections = distinctSections(posts)
  const rawSection = (await searchParams).section
  const requested = Array.isArray(rawSection) ? rawSection[0] : rawSection
  // Only honor a filter that actually matches an existing section label.
  const activeSection =
    requested && sections.includes(requested) ? requested : null

  const visiblePosts = activeSection
    ? posts.filter((post) => sectionLabel(post.section) === activeSection)
    : posts

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] shadow-xl">
        <div className="px-4 py-4">
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
              <p className="text-xs text-[var(--accent)]">Blog</p>
            </div>
          </Link>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-bold text-[var(--accent)] hover:underline"
        >
          <span aria-hidden>&larr;</span> Back to home
        </Link>

        {sections.length > 1 && (
          <nav aria-label="Filter articles by section" className="flex flex-wrap gap-2">
            <Link
              href="/blog"
              aria-current={activeSection === null ? 'page' : undefined}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-bold border transition-colors ${
                activeSection === null
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-white text-[#4A5A4C] border-[#E5EAE3] hover:bg-[#F0F2EE]'
              }`}
            >
              All
            </Link>
            {sections.map((section) => (
              <Link
                key={section}
                href={`/blog?section=${encodeURIComponent(section)}`}
                aria-current={activeSection === section ? 'page' : undefined}
                className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-bold border transition-colors ${
                  activeSection === section
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-white text-[#4A5A4C] border-[#E5EAE3] hover:bg-[#F0F2EE]'
                }`}
              >
                {section}
              </Link>
            ))}
          </nav>
        )}

        {visiblePosts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              {posts.length === 0
                ? 'No articles published yet. Check back soon.'
                : 'No articles in this section yet.'}
            </p>
          </div>
        ) : activeSection !== null ? (
          <ul className="space-y-4 list-none p-0">
            {visiblePosts.map((post) => (
              <li key={post.id}>
                <BlogCard post={post} />
              </li>
            ))}
          </ul>
        ) : (
          // No filter: group by section with a heading per group.
          <div className="space-y-8">
            {sections.map((section) => {
              const groupPosts = posts.filter(
                (post) => sectionLabel(post.section) === section
              )
              if (groupPosts.length === 0) return null
              return (
                <section key={section} className="space-y-4" aria-label={section}>
                  {sections.length > 1 && (
                    <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
                      {section}
                    </h2>
                  )}
                  <ul className="space-y-4 list-none p-0">
                    {groupPosts.map((post) => (
                      <li key={post.id}>
                        <BlogCard post={post} />
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
