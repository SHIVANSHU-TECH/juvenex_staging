'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { ApiEnvelope } from '@/lib/api-types'

interface BlogListItem {
  id: string
  title: string
  slug: string
  excerpt: string
  cover_image: string | null
  author: string
  published_at: string
  created_at: string
  updated_at: string
}

interface FeaturedBlogsState {
  blogs: BlogListItem[]
  isLoading: boolean
  error: string | null
}

const INITIAL_STATE: FeaturedBlogsState = {
  blogs: [],
  isLoading: true,
  error: null,
}

const SKELETON_KEYS = ['s1', 's2', 's3'] as const

export default function FeaturedBlogs() {
  const [state, setState] = useState<FeaturedBlogsState>(INITIAL_STATE)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const res = await fetch('/api/blogs?limit=3', {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!res.ok) {
          setState({ blogs: [], isLoading: false, error: 'Failed to load blogs' })
          return
        }
        const json = (await res.json()) as ApiEnvelope<{ blogs?: BlogListItem[] }>
        const blogs = json?.data?.blogs ?? []
        setState({ blogs, isLoading: false, error: null })
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('FeaturedBlogs load failed', error)
        setState({ blogs: [], isLoading: false, error: 'Failed to load blogs' })
      }
    }

    load()
    return () => controller.abort()
  }, [])

  return (
    <section aria-labelledby="featured-blogs-heading" className="space-y-3">
      <h2
        id="featured-blogs-heading"
        className="font-bold text-[#2D352C] px-1 text-base"
      >
        Featured Blogs
      </h2>

      {state.isLoading ? (
        <div className="grid grid-cols-1 gap-3">
          {SKELETON_KEYS.map((key) => (
            <div
              key={key}
              className="bg-gradient-to-br from-[#F5F8F3] to-[#EEF1ED] rounded-2xl border border-[#E5EAE3] shadow-xl overflow-hidden animate-pulse"
            >
              <div className="w-full aspect-[16/9] bg-[#E5EAE3]" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-[#E5EAE3] rounded w-3/4" />
                <div className="h-3 bg-[#E5EAE3] rounded w-full" />
                <div className="h-3 bg-[#E5EAE3] rounded w-5/6" />
              </div>
            </div>
          ))}
        </div>
      ) : state.blogs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-xl p-6 text-center">
          <p className="text-sm text-[#6B7567]">No blogs yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {state.blogs.map((blog) => (
            <Link
              key={blog.id}
              href={`/blog/${blog.slug}`}
              className="group bg-gradient-to-br from-[#F5F8F3] to-[#EEF1ED] rounded-2xl border border-[#E5EAE3] shadow-xl hover:shadow-2xl hover:border-[var(--accent)] transition-all overflow-hidden flex flex-col"
            >
              {blog.cover_image ? (
                <div className="relative w-full aspect-[16/9] bg-[#E2E8DF]">
                  <Image
                    src={blog.cover_image}
                    alt={blog.title}
                    width={640}
                    height={360}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                  />
                </div>
              ) : (
                <div className="w-full aspect-[16/9] bg-[#E2E8DF] flex items-center justify-center text-4xl">
                  &#x1F4D6;
                </div>
              )}
              <div className="p-4 space-y-2 flex-1 flex flex-col">
                <h3 className="font-bold text-base text-[#2D352C] leading-snug">
                  {blog.title}
                </h3>
                <p className="text-xs text-[#6B7567] line-clamp-2 flex-1">
                  {blog.excerpt}
                </p>
                <span className="text-xs font-bold text-[var(--accent)] mt-1">
                  Read more &rarr;
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
