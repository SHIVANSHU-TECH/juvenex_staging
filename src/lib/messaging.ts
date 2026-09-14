// Shared types + helpers for the messaging feature.
// Server routes and client UI both import from here.

export interface Message {
  id: string
  from_user_id: string
  to_user_id: string
  body: string
  read_at: string | null
  created_at: string
}

export interface MessageUser {
  id: string
  email: string
  full_name: string | null
}

export interface ConversationSummary {
  user: MessageUser
  last_message: Message | null
  last_message_at: string | null
  unread_count: number
}

export interface MessageThreadResponse {
  thread_user: MessageUser
  messages: Message[]
}

export interface AdminUserListItem {
  id: string
  email: string
  full_name: string | null
  last_message_at: string | null
}

export const MESSAGE_BODY_MAX_LENGTH = 4000
export const MESSAGE_BODY_MIN_LENGTH = 1

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'super_admin' || role === 'org_admin'
}
