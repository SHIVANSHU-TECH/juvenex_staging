// =====================================================
// GLP App Configuration
// =====================================================

// AI chat tier and rate-limit constants. Centralized here so admin/ops can
// adjust quotas without hunting through route handlers.
//
// FREE_TIER_DAILY_LIMIT/WINDOW_MS: free-tier daily AI message budget.
//   Pro (active/trialing subscription) is unlimited subject to BURST_LIMIT.
// BURST_LIMIT/WINDOW_MS: per-minute burst limit applied to everyone.
// MAX_HISTORY_MESSAGES: maximum number of conversation messages forwarded
//   upstream. The latest user turn is always retained; oldest pairs are
//   trimmed first to preserve role flow.
export const AI_CHAT_FREE_TIER_DAILY_LIMIT = 5
export const AI_CHAT_FREE_TIER_WINDOW_MS = 24 * 60 * 60 * 1000
export const AI_CHAT_BURST_LIMIT = 20
export const AI_CHAT_BURST_WINDOW_MS = 60_000
export const AI_CHAT_MAX_HISTORY_MESSAGES = 20

export const config = {
  // AI Settings
  ai: {
    provider: process.env.AI_PROVIDER || 'grok', // 'grok', 'anthropic', 'openai', or 'gemini'
    model: process.env.AI_MODEL || process.env.GROK_MODEL || 'grok-4-1-fast-non-reasoning',
    maxTokens: 2048,
    temperature: 0.7,
  },

  // App Settings
  app: {
    name: 'Juvenex',
    // Include basePath so payment/auth absolute redirects land under /staging.
    url: (() => {
      const raw = (process.env.NEXT_PUBLIC_APP_URL || 'https://juvenex.space').replace(
        /\/$/,
        ''
      )
      const base = (process.env.NEXT_PUBLIC_BASE_PATH || '/staging').replace(/\/$/, '')
      if (!base) return raw
      if (raw.endsWith(base)) return raw
      return `${raw}${base}`
    })(),
    environment: process.env.NODE_ENV || 'development',
  },

  // Feature Flags
  features: {
    teleHealthEnabled: process.env.NEXT_PUBLIC_TELEHEALTH_ENABLED === 'true',
    socialFeedEnabled: process.env.NEXT_PUBLIC_SOCIAL_FEED_ENABLED === 'true',
    progressPicsEnabled: process.env.NEXT_PUBLIC_PROGRESS_PICS_ENABLED === 'true',
    aiMealPlansEnabled: process.env.NEXT_PUBLIC_AI_MEAL_PLANS_ENABLED === 'true',
    chatBotEnabled: process.env.NEXT_PUBLIC_CHATBOT_ENABLED === 'true',
    // 7-day free trial on paid memberships (card-required, auto-converts at
    // trial end via Kurv's future-start recurring contract). Off by default
    // until the live-card activation signal is confirmed end-to-end.
    membershipTrialEnabled: process.env.NEXT_PUBLIC_MEMBERSHIP_TRIAL_ENABLED === 'true',
  },

  // Telehealth Integration
  telehealth: {
    provider: process.env.TELEHEALTH_PROVIDER || 'daily', // 'daily', 'twilio', etc.
    apiKey: process.env.DAILY_CO_API_KEY,
    domain: process.env.DAILY_CO_DOMAIN,
  },

  // Database
  database: {
    url: process.env.DATABASE_URL,
    provider: process.env.DB_PROVIDER || 'supabase', // 'supabase', 'postgres'
  },

  // Auth
  auth: {
    provider: process.env.AUTH_PROVIDER || 'clerk', // 'clerk', 'custom'
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },

  // Payments
  payments: {
    provider: process.env.PAYMENT_PROVIDER || 'stripe',
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },

  // Membership
  membership: {
    // Comma-separated promo codes that comp a membership (100% off): entering
    // one at checkout activates the selected plan/peptides without a charge.
    // Configure via MEMBERSHIP_FREE_PROMO_CODES; a default is provided so the
    // team can test the purchase flow without paying.
    freePromoCodes: (process.env.MEMBERSHIP_FREE_PROMO_CODES || 'JUVENEXTEST')
      .split(',')
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean),
  },

  // Notifications
  notifications: {
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    },
    sendGrid: {
      apiKey: process.env.SENDGRID_API_KEY,
    },
  },
};

export default config;
