// Shared social post types and utilities used across multiple API routes.

export interface PostRow {
  id: string
  user_id: string
  type: string
  group_id: string | null
  title: string | null
  body: string
  image_url: string | null
  is_public: boolean
  likes_count: number
  comments_count: number
  created_at: string
  updated_at: string
  author_id: string
  author_name: string | null
  author_avatar_url: string | null
}

export function formatPost(row: PostRow) {
  const { author_id, author_name, author_avatar_url, ...post } = row
  return {
    ...post,
    profiles: {
      id: author_id,
      name: author_name,
      avatar_url: author_avatar_url,
    },
  }
}
