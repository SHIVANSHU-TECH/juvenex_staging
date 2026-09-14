-- Migration 008: HIPAA PHI encryption at rest (§164.312(a)(2)(iv))
-- ------------------------------------------------------------------
-- Adds parallel _enc columns for PHI that the app previously wrote as
-- plaintext. The application writes encrypted ciphertext (v1: scrypt +
-- AES-256-GCM, envelope "v1:<iv>:<tag>:<ct>") to the _enc columns and
-- reads from _enc when present, falling back to the legacy plaintext
-- column for rollback safety.
--
-- IMPORTANT: This migration does NOT drop the original plaintext
-- columns. Existing rows stay readable via the fallback path. A future
-- migration 009 will:
--   1. Backfill _enc columns by encrypting existing plaintext rows
--      (run server-side with access to ENCRYPTION_KEY + ENCRYPTION_KEY_SALT).
--   2. Drop the plaintext columns once backfill is verified.
-- post-launch: backfill _enc columns and drop plaintext columns in migration 009

-- ============================================================
-- 1. patient_profiles: add encrypted mirror columns
-- ============================================================

ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS allergies_enc       TEXT,
  ADD COLUMN IF NOT EXISTS medications_enc     TEXT,
  ADD COLUMN IF NOT EXISTS conditions_enc      TEXT,
  ADD COLUMN IF NOT EXISTS restrictions_enc    TEXT,
  ADD COLUMN IF NOT EXISTS foods_to_avoid_enc  TEXT;

COMMENT ON COLUMN patient_profiles.allergies_enc IS
  'PHI: AES-256-GCM ciphertext of JSON-encoded allergies[]. See src/lib/encryption.ts.';
COMMENT ON COLUMN patient_profiles.medications_enc IS
  'PHI: AES-256-GCM ciphertext of JSON-encoded medications[].';
COMMENT ON COLUMN patient_profiles.conditions_enc IS
  'PHI: AES-256-GCM ciphertext of JSON-encoded conditions[].';
COMMENT ON COLUMN patient_profiles.restrictions_enc IS
  'PHI: AES-256-GCM ciphertext of JSON-encoded restrictions[].';
COMMENT ON COLUMN patient_profiles.foods_to_avoid_enc IS
  'PHI: AES-256-GCM ciphertext of JSON-encoded foods_to_avoid[].';

-- Backfill is a no-op here — existing plaintext rows remain in original
-- columns. Application falls back to them when *_enc is NULL.
-- (Explicit UPDATE to NULL is unnecessary on a freshly added column.)

-- ============================================================
-- 2. ai_conversations: add encrypted messages column
-- ============================================================

ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS messages_enc TEXT;

COMMENT ON COLUMN ai_conversations.messages_enc IS
  'PHI: AES-256-GCM ciphertext of JSON.stringify(messages[]). '
  'Supersedes plaintext messages JSONB once migration 009 drops it.';
