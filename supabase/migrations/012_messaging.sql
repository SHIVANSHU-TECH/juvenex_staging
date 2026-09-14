-- 012: Direct messaging (admin -> user, MVP).
--
-- Schema: 1-on-1 messages between two users, identified by from_user_id and
-- to_user_id. The `thread` between a pair of users is derived by querying both
-- directions. Schema does NOT bake in the "admin only sends" rule; that is
-- enforced by the RLS INSERT policy below, so reversing direction later only
-- requires policy changes (no migration).
--
-- Confirmed against 001_initial_schema.sql:
--   * `profiles` table exists with PRIMARY KEY id (FK to auth.users)
--   * `profiles.role` text column with values: 'patient' | 'org_admin' | 'super_admin'

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_no_self_send CHECK (from_user_id <> to_user_id)
);

-- Inbox queries: latest messages for a recipient.
CREATE INDEX IF NOT EXISTS idx_messages_to_created
  ON messages (to_user_id, created_at DESC);

-- Sender queries (admin viewing what they sent).
CREATE INDEX IF NOT EXISTS idx_messages_from_created
  ON messages (from_user_id, created_at DESC);

-- Symmetric thread index: order-independent pair (LEAST, GREATEST) so a thread
-- between users (A, B) clusters together regardless of who sent which message.
CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON messages (
    LEAST(from_user_id, to_user_id),
    GREATEST(from_user_id, to_user_id),
    created_at DESC
  );

-- Unread inbox lookups.
CREATE INDEX IF NOT EXISTS idx_messages_to_unread
  ON messages (to_user_id)
  WHERE read_at IS NULL;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Sender or recipient can read a message.
DROP POLICY IF EXISTS messages_recipient_read ON messages;
CREATE POLICY messages_recipient_read ON messages
  FOR SELECT
  USING (
    to_user_id = (SELECT auth.uid())
    OR from_user_id = (SELECT auth.uid())
  );

-- Only super_admin or org_admin can INSERT messages (MVP: admin -> user).
-- Recipient cannot reply yet; flipping that on later means adding a second
-- INSERT policy without touching schema.
DROP POLICY IF EXISTS messages_admin_insert ON messages;
CREATE POLICY messages_admin_insert ON messages
  FOR INSERT
  WITH CHECK (
    from_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('super_admin', 'org_admin')
    )
  );

-- Recipient can mark their own messages as read (and only update read_at).
DROP POLICY IF EXISTS messages_recipient_update ON messages;
CREATE POLICY messages_recipient_update ON messages
  FOR UPDATE
  USING (to_user_id = (SELECT auth.uid()))
  WITH CHECK (to_user_id = (SELECT auth.uid()));
