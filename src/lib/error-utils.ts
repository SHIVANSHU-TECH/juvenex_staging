// Shared helper for narrowing `unknown` errors to a string message. Replaces
// per-file copies of the same helper in API route handlers.
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}
