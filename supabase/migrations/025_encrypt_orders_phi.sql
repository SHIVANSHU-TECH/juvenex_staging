-- Migration 025: PHI encryption at rest for orders table (HIPAA §164.312(a)(2)(iv))
-- -----------------------------------------------------------------------------------
-- ROLLOUT STRATEGY (dual-write grace period):
--
--   Phase 1 (this migration): Add _enc text columns alongside the existing plaintext
--     columns. Writers now persist encrypted ciphertext to the _enc columns AND keep
--     writing cleartext to the original columns (dual-write). Readers fall back to
--     cleartext when _enc IS NULL, so existing rows and any reader that has not yet
--     been updated continue to work without disruption.
--
--   Phase 2 (migration 026, next deploy after all writers are updated):
--     a. Backfill _enc for rows where it is still NULL by running a server-side
--        script with access to ENCRYPTION_KEY + ENCRYPTION_KEY_SALT.
--     b. Verify the backfill with a spot-check query:
--            SELECT COUNT(*) FROM orders WHERE intake_answers IS NOT NULL
--              AND intake_answers_enc IS NULL;
--        Expected result: 0 rows.
--     c. Once backfill is verified, drop the cleartext columns:
--            ALTER TABLE public.orders
--              DROP COLUMN intake_answers,
--              DROP COLUMN shipping_address,
--              DROP COLUMN billing_address;
--     These DROPs are intentionally deferred to give the current deploy cycle time
--     to propagate and for ops to validate the backfill in staging before production.
--
--   Ciphertext format: "v1:<ivHex>:<authTagHex>:<ciphertextHex>" — AES-256-GCM with
--   a per-value random IV, authenticated tag, and scrypt KDF applied to
--   ENCRYPTION_KEY + ENCRYPTION_KEY_SALT at module load in src/lib/encryption.ts.
--
-- IMPORTANT: The DROP statements in Phase 2 must NOT be added to this file.
-- They belong in migration 026 to ensure the grace period is always observed.

-- ============================================================
-- 1. orders: add encrypted PHI mirror columns
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS intake_answers_enc   TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address_enc TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_enc  TEXT;

-- Column comments document the encryption contract for future maintainers and
-- auditors. They explain the fallback path and the schema version.
COMMENT ON COLUMN public.orders.intake_answers_enc IS
  'PHI (HIPAA §164.312(a)(2)(iv)): AES-256-GCM ciphertext of '
  'JSON.stringify(intake_answers). Envelope format: '
  '"v1:<ivHex>:<authTagHex>:<ciphertextHex>". See src/lib/encryption.ts. '
  'NULL for rows written before migration 025. '
  'Readers must fall back to cleartext intake_answers when this is NULL. '
  'Cleartext intake_answers will be dropped in migration 026 after backfill.';

COMMENT ON COLUMN public.orders.shipping_address_enc IS
  'PHI (HIPAA §164.312(a)(2)(iv)): AES-256-GCM ciphertext of '
  'JSON.stringify(shipping_address). Same envelope as intake_answers_enc. '
  'NULL for rows written before migration 025. '
  'Cleartext shipping_address will be dropped in migration 026 after backfill.';

COMMENT ON COLUMN public.orders.billing_address_enc IS
  'PHI (HIPAA §164.312(a)(2)(iv)): AES-256-GCM ciphertext of '
  'JSON.stringify(billing_address). Same envelope as intake_answers_enc. '
  'NULL for rows written before migration 025. '
  'Cleartext billing_address will be dropped in migration 026 after backfill.';

-- ============================================================
-- 2. Backfill note
-- ============================================================
--
-- Existing rows have intake_answers_enc / shipping_address_enc /
-- billing_address_enc = NULL. They are non-PHI dev/test rows and are safely
-- handled by the application fallback path (decryptIfPresent falls back to
-- the cleartext column when _enc IS NULL).
--
-- In production, before dropping the cleartext columns in migration 026, run:
--
--   node scripts/backfill-orders-phi-encryption.js
--
-- which must be written to SELECT rows where *_enc IS NULL, encrypt each
-- field, and UPDATE in batches. Access to ENCRYPTION_KEY + ENCRYPTION_KEY_SALT
-- is required — do not run this script without those env vars set.
