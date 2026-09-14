-- Migration 004: Schema fixes to align database with API code
-- Applied: 2026-04-15

-- Fix 1: appointments.intake_data must be text, not jsonb.
-- The API encrypts intake PHI with AES-256-GCM and stores the result as an
-- "iv:tag:ciphertext" hex string. PostgreSQL rejects that string as invalid JSON.
ALTER TABLE appointments ALTER COLUMN intake_data TYPE text;

-- Fix 2: progress_photos is missing the photo_url column.
-- The API inserts and selects photo_url; the schema only had storage_path.
ALTER TABLE progress_photos ADD COLUMN IF NOT EXISTS photo_url text;

-- Fix 3: meal_plans is missing plan and request_params columns.
-- The API inserts the generated meal plan JSON into `plan` and the generation
-- parameters into `request_params`; the schema only had meals/nutrition_summary/preferences.
ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS plan jsonb;
ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS request_params jsonb;

-- Fix 4: groups is missing the member_count column.
-- The API increments/decrements member_count on join/leave and inserts with
-- member_count = 1 on group creation.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS member_count int DEFAULT 0;

-- Note on post_comments / post_likes (Fix 5):
-- The database tables are correctly named `comments` and `likes`.
-- Three API files referenced the wrong names (post_comments, post_likes) and
-- were corrected in code — no DDL change required:
--   src/app/api/social/posts/[id]/comments/route.ts
--   src/app/api/social/posts/[id]/like/route.ts
--   src/app/api/social/feed/route.ts

-- Note on audit_logs RLS (Fix 6):
-- RLS was already enabled on audit_logs (relrowsecurity = true). No action needed.

-- Note on ENCRYPTION_KEY (Fix 7):
-- A strong 32-byte random hex key was generated with `openssl rand -hex 32`
-- and written to .env.local. The placeholder value is no longer present.
