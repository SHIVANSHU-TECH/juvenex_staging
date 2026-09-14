'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { ApiEnvelope } from '@/lib/api-types'
import { formatRelative } from '@/lib/format'

interface AdminBlog {
  id: string
  title: string
  slug: string
  excerpt: string
  cover_image: string | null
  section: string | null
  body: string
  author: string
  published_at: string | null
  created_at: string
  updated_at: string
}

interface AdminBlogsData {
  blogs: AdminBlog[]
  total: number
  hasMore: boolean
}

type BlogsResponse = ApiEnvelope<AdminBlogsData>
type CreateResponse = ApiEnvelope<{ blog: AdminBlog }>
type BlogStatus = 'all' | 'draft' | 'published' | 'scheduled'

interface BlogFormState {
  title: string
  slug: string
  excerpt: string
  cover_image: string
  section: string
  body: string
  author: string
  publishMode: 'draft' | 'now' | 'scheduled'
  published_at: string
}

const EMPTY_FORM: BlogFormState = {
  title: '',
  slug: '',
  excerpt: '',
  cover_image: '',
  section: '',
  body: '',
  author: 'Juvenex Team',
  publishMode: 'draft',
  published_at: '',
}

// Suggested editorial sections. Free-text is still allowed (datalist) so
// admins can introduce new sections without a code change.
const SECTION_SUGGESTIONS: ReadonlyArray<string> = [
  'GLP-1 Basics',
  'Nutrition',
  'Peptides',
  'Recovery & Sleep',
  'Research',
  'Patient Stories',
]

const STATUS_FILTERS: ReadonlyArray<{ value: BlogStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'scheduled', label: 'Scheduled' },
]

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
}

function toDatetimeLocal(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

function publishStatus(blog: AdminBlog): { label: string; className: string } {
  if (!blog.published_at) {
    return {
      label: 'Draft',
      className: 'bg-[#F5F8F3] text-[#6B7568] ring-[#E5EAE3]',
    }
  }
  const published = new Date(blog.published_at).getTime()
  if (Number.isFinite(published) && published > Date.now()) {
    return {
      label: 'Scheduled',
      className: 'bg-blue-50 text-blue-700 ring-blue-200',
    }
  }
  return {
    label: 'Published',
    className: 'bg-[#E6EFE2] text-[var(--accent-strong)] ring-[#CFE0C8]',
  }
}

function publishedAtPayload(form: BlogFormState): string | null {
  if (form.publishMode === 'draft') return null
  if (form.publishMode === 'now') return new Date().toISOString()
  if (!form.published_at) return null
  const date = new Date(form.published_at)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function BlogRow({
  blog,
  onEdit,
  onDelete,
  isEditing,
  isDeleting,
}: {
  blog: AdminBlog
  onEdit: (blog: AdminBlog) => void
  onDelete: (blog: AdminBlog) => void
  isEditing: boolean
  isDeleting: boolean
}) {
  const status = publishStatus(blog)
  return (
    <article
      className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${isEditing ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30' : 'border-[#E5EAE3]'}`}
    >
      <div className="p-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-[#2D352C] break-words">
              {blog.title}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <p className="text-sm text-[#6B7568] line-clamp-2">{blog.excerpt}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8B9B83]">
            <span className="font-mono">/{blog.slug}</span>
            {blog.section && (
              <span className="inline-flex items-center rounded-full bg-[#EEF1ED] px-2 py-0.5 font-medium text-[#4A5A4C]">
                {blog.section}
              </span>
            )}
            <span>{blog.author}</span>
            <span title={new Date(blog.created_at).toLocaleString()}>
              Created {formatRelative(blog.created_at)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 shrink-0 md:items-end">
          {blog.published_at && (
            <div className="text-xs text-[#6B7568] md:text-right">
              <p className="font-semibold uppercase tracking-wider text-[#8B9B83]">
                Publish time
              </p>
              <p>{new Date(blog.published_at).toLocaleString()}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onEdit(blog)}
              className="h-9 px-3 inline-flex items-center justify-center rounded-lg bg-white border border-[#E5EAE3] text-[#2D352C] text-sm hover:bg-[#F5F8F3]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(blog)}
              disabled={isDeleting}
              className="h-9 px-3 inline-flex items-center justify-center rounded-lg bg-white border border-red-200 text-red-700 text-sm hover:bg-red-50 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function BlogsTab() {
  const [blogs, setBlogs] = useState<AdminBlog[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<BlogStatus>('all')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<BlogFormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '25', page: '1', status })
    if (search.trim()) params.set('search', search.trim())
    return params.toString()
  }, [search, status])

  const loadBlogs = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/blogs?${query}`, {
        headers: authHeaders(),
      })
      const json = (await res.json()) as BlogsResponse
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Failed to load blogs')
        setBlogs([])
        setTotal(0)
        return
      }
      setBlogs(json.data?.blogs ?? [])
      setTotal(json.data?.total ?? 0)
    } catch {
      setError('Network error loading blogs')
      setBlogs([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [query])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBlogs()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadBlogs])

  const updateTitle = (title: string) => {
    setForm((prev) => ({
      ...prev,
      title,
      slug: prev.slug ? prev.slug : slugify(title),
    }))
  }

  const startEdit = (blog: AdminBlog) => {
    const publishMode: BlogFormState['publishMode'] = !blog.published_at
      ? 'draft'
      : new Date(blog.published_at).getTime() > Date.now()
        ? 'scheduled'
        : 'now'
    setForm({
      title: blog.title,
      slug: blog.slug,
      excerpt: blog.excerpt,
      cover_image: blog.cover_image ?? '',
      section: blog.section ?? '',
      body: blog.body,
      author: blog.author,
      publishMode,
      published_at:
        publishMode === 'scheduled' && blog.published_at
          ? toDatetimeLocal(new Date(blog.published_at))
          : '',
    })
    setEditingId(blog.id)
    setError(null)
    setSaveMessage(null)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setSaveMessage(null)
  }

  const handleImageUpload = async (file: File) => {
    setIsUploading(true)
    setError(null)
    try {
      const body = new FormData()
      body.set('image', file)
      const res = await fetch('/api/admin/blogs/upload', {
        method: 'POST',
        headers: authHeaders(),
        body,
      })
      const json = (await res.json()) as ApiEnvelope<{ url: string; path: string }>
      if (!res.ok || !json.success || !json.data?.url) {
        setError(json.error ?? 'Failed to upload image')
        return
      }
      setForm((prev) => ({ ...prev, cover_image: json.data!.url }))
    } catch {
      setError('Network error uploading image')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (blog: AdminBlog) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Delete “${blog.title}”? This cannot be undone.`)
    ) {
      return
    }
    setDeletingId(blog.id)
    setError(null)
    setSaveMessage(null)
    try {
      const res = await fetch(`/api/admin/blogs/${blog.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      const json = (await res.json()) as ApiEnvelope<{ id: string }>
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Failed to delete blog')
        return
      }
      if (editingId === blog.id) cancelEdit()
      setSaveMessage('Blog deleted')
      await loadBlogs()
    } catch {
      setError('Network error deleting blog')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    setSaveMessage(null)
    try {
      const payload = {
        title: form.title,
        slug: form.slug,
        excerpt: form.excerpt,
        cover_image: form.cover_image.trim() || null,
        section: form.section.trim() || null,
        body: form.body,
        author: form.author,
        published_at: publishedAtPayload(form),
      }
      const res = await fetch(
        editingId ? `/api/admin/blogs/${editingId}` : '/api/admin/blogs',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload),
        }
      )
      const json = (await res.json()) as CreateResponse
      if (!res.ok || !json.success) {
        setError(json.error ?? `Failed to ${editingId ? 'update' : 'create'} blog`)
        return
      }
      setForm(EMPTY_FORM)
      setSaveMessage(editingId ? 'Blog updated' : 'Blog created')
      setEditingId(null)
      await loadBlogs()
    } catch {
      setError(`Network error ${editingId ? 'updating' : 'creating'} blog`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#2D352C]">Blogs</h1>
          <p className="text-sm text-[#6B7567] mt-1">
            Create editorial posts for Learn and the public blog.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadBlogs()}
          disabled={isLoading}
          className="h-9 inline-flex items-center justify-center gap-2 px-3 rounded-lg bg-white border border-[#E5EAE3] text-[#2D352C] text-sm hover:bg-[#F5F8F3] disabled:opacity-50"
        >
          <span
            className={`h-4 w-4 rounded-full border-2 border-[#E5EAE3] border-t-[var(--accent)] ${isLoading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Refresh
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-[#FEE2E2] border border-red-200 text-[#7F1D1D] text-sm rounded-xl px-4 py-3"
        >
          {error}
        </div>
      )}
      {saveMessage && (
        <div
          role="status"
          className="bg-[#E6EFE2] border border-[#CFE0C8] text-[#2D352C] text-sm rounded-xl px-4 py-3"
        >
          {saveMessage}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#E5EAE3] rounded-2xl shadow-sm p-5 space-y-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#2D352C]">
            {editingId ? 'Edit blog post' : 'Create blog post'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="h-9 px-3 inline-flex items-center justify-center rounded-lg bg-white border border-[#E5EAE3] text-[#2D352C] text-sm hover:bg-[#F5F8F3]"
            >
              Cancel edit
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="block text-xs font-medium text-[#6B7567] mb-1">
              Title
            </span>
            <input
              required
              value={form.title}
              onChange={(e) => updateTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-[#6B7567] mb-1">
              Slug
            </span>
            <input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={form.slug}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, slug: slugify(e.target.value) }))
              }
              className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-[#6B7567] mb-1">
              Author
            </span>
            <input
              required
              value={form.author}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, author: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-[#6B7567] mb-1">
              Cover image
            </span>
            <input
              value={form.cover_image}
              placeholder="Upload below or paste a URL"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, cover_image: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] placeholder:text-[#8B9B83] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
            />
            <div className="mt-2 flex items-center gap-3">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={isUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleImageUpload(file)
                  e.target.value = ''
                }}
                className="block w-full text-xs text-[#6B7567] file:mr-3 file:rounded-lg file:border-0 file:bg-[#EEF1ED] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#2D352C] hover:file:bg-[#E5EAE3] disabled:opacity-50"
              />
              {isUploading && (
                <span className="text-xs text-[#8B9B83] shrink-0">Uploading…</span>
              )}
            </div>
            {form.cover_image && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={form.cover_image}
                alt="Cover preview"
                className="mt-2 h-24 w-full max-w-xs rounded-lg border border-[#E5EAE3] object-cover"
              />
            )}
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-[#6B7567] mb-1">
              Section
            </span>
            <input
              list="blog-section-suggestions"
              value={form.section}
              placeholder="Select an existing section or type a new one"
              maxLength={80}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, section: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] placeholder:text-[#8B9B83] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
            />
            <datalist id="blog-section-suggestions">
              {Array.from(
                new Set([
                  // Sections already in use (so admins can pick existing ones),
                  ...blogs
                    .map((b) => b.section)
                    .filter((s): s is string => Boolean(s)),
                  ...SECTION_SUGGESTIONS,
                ])
              ).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-[#6B7567] mb-1">
            Excerpt
          </span>
          <textarea
            required
            rows={3}
            maxLength={500}
            value={form.excerpt}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, excerpt: e.target.value }))
            }
            className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[#6B7567] mb-1">
            Body
          </span>
          <textarea
            required
            rows={10}
            value={form.body}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, body: e.target.value }))
            }
            className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
          <label className="block">
            <span className="block text-xs font-medium text-[#6B7567] mb-1">
              Publish mode
            </span>
            <select
              value={form.publishMode}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  publishMode: e.target.value as BlogFormState['publishMode'],
                  published_at:
                    e.target.value === 'scheduled' && !prev.published_at
                      ? toDatetimeLocal(new Date(Date.now() + 60 * 60 * 1000))
                      : prev.published_at,
                }))
              }
              className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
            >
              <option value="draft">Draft</option>
              <option value="now">Publish now</option>
              <option value="scheduled">Schedule</option>
            </select>
          </label>

          {form.publishMode === 'scheduled' && (
            <label className="block">
              <span className="block text-xs font-medium text-[#6B7567] mb-1">
                Scheduled time
              </span>
              <input
                type="datetime-local"
                required
                value={form.published_at}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    published_at: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
              />
            </label>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving || isUploading}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent)] disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : editingId ? 'Save changes' : 'Create post'}
          </button>
        </div>
      </form>

      <section className="space-y-4" aria-labelledby="blog-list-heading">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2
              id="blog-list-heading"
              className="text-lg font-semibold text-[#2D352C]"
            >
              Existing posts
            </h2>
            <p className="text-xs text-[#6B7568]">
              Showing {blogs.length} of {total}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              placeholder="Search posts"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 px-3 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] placeholder:text-[#8B9B83] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BlogStatus)}
              className="h-9 px-3 text-sm bg-white border border-[#E5EAE3] rounded-lg text-[#2D352C] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]"
            >
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-[#E5EAE3]/50 animate-pulse"
              />
            ))}
          </div>
        ) : blogs.length === 0 ? (
          <div className="bg-white border border-[#E5EAE3] rounded-2xl shadow-sm px-6 py-12 text-center text-sm text-[#6B7568]">
            No blog posts match this view.
          </div>
        ) : (
          <div className="space-y-3">
            {blogs.map((blog) => (
              <BlogRow
                key={blog.id}
                blog={blog}
                onEdit={startEdit}
                onDelete={handleDelete}
                isEditing={editingId === blog.id}
                isDeleting={deletingId === blog.id}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
