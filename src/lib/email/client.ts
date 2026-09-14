/**
 * Transactional email transport (Resend).
 *
 * NEVER THROWS — READ THIS BEFORE EDITING
 * The only caller today is the order-confirmation endpoint, which runs after
 * the customer's card has already been charged. A mail failure must never
 * become an order failure, so every path here resolves to a result object
 * instead of raising. Callers branch on `ok`; they never need a try/catch.
 *
 * UNCONFIGURED ENVIRONMENTS ARE A SUPPORTED STATE
 * `RESEND_API_KEY` is absent in local dev and in any environment where the key
 * has not been provisioned yet. That is not an error condition: `sendEmail`
 * logs once and returns `{ ok: false, error: 'not_configured' }`. Nothing
 * crashes, and the order still completes.
 */
import { Resend } from 'resend'
import { logger } from '@/lib/logger'

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
}

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
}

const DEFAULT_FROM = 'orders@juvenex.app'

/**
 * Cached across invocations so we do not rebuild the client per send. Stays
 * null until the first send in a configured environment — constructing it at
 * module load would run at build time, where the key is absent.
 */
let cached: Resend | null = null

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!cached) cached = new Resend(apiKey)
  return cached
}

/** True when a key is present, so callers can skip composing a message that
 *  could not be sent. Purely an optimisation — `sendEmail` is safe regardless. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getClient()
  if (!client) {
    logger.warn('sendEmail: RESEND_API_KEY not set — skipping send', {
      subject: input.subject,
    })
    return { ok: false, error: 'not_configured' }
  }

  const from = process.env.EMAIL_FROM || DEFAULT_FROM
  const replyTo = process.env.EMAIL_REPLY_TO

  try {
    const { data, error } = await client.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(replyTo ? { replyTo } : {}),
    })

    // The SDK reports delivery problems in `error` rather than by throwing,
    // so this branch — not the catch — is the common failure path.
    if (error) {
      logger.warn('sendEmail: provider rejected the message', {
        subject: input.subject,
        error: error.message,
      })
      return { ok: false, error: error.message }
    }

    return { ok: true, id: data?.id }
  } catch (cause: unknown) {
    // Network fault, malformed key, SDK bug — anything.
    logger.error('sendEmail: unexpected transport failure', {
      subject: input.subject,
      error: cause instanceof Error ? cause.message : String(cause),
    })
    return { ok: false, error: cause instanceof Error ? cause.message : 'unknown_error' }
  }
}
