// Centralized role enum. Mirrors profiles.role values in the database.
// Imported by route handlers and middleware so a typo in a string literal is
// caught at compile time. Call-site migration is intentionally deferred —
// Agent 5 will replace inline 'patient' / 'org_admin' / 'super_admin' string
// literals across the codebase.

export const ROLES = {
  PATIENT: 'patient',
  ORG_ADMIN: 'org_admin',
  SUPER_ADMIN: 'super_admin',
} as const

export type Role = typeof ROLES[keyof typeof ROLES]
