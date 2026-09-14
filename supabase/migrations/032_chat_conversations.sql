-- =============================================================================
-- Migration 032: Normalized chat conversations + messages ("AI memory bank")
-- =============================================================================
-- Client (Braeden) referred to this as the "AI memory bank (mb file)" - the
-- intent is that AI answers refer back to prior turns first instead of costing
-- new tokens on every call. The pre-existing `ai_conversations` table stored
-- the full transcript as an encrypted JSONB blob, which made it expensive to
-- append a single message (read-decrypt-mutate-encrypt-write) and impossible
-- to query message-level metadata (token counts, role distribution, etc.).
--
-- This migration introduces a normalized pair of tables:
--   - chat_conversations: one row per thread (owned by a user, optionally
--     scoped to a tenant organization).
--   - chat_messages:      one row per turn (role/content/token_count).
--
-- The existing `ai_conversations` table is left intact for now. The API route
-- will be moved over to the new tables in this same migration wave; legacy
-- data will be migrated in a follow-up if/when the product calls for it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. chat_conversations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  title           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_conversations_user_updated_idx
  ON public.chat_conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS chat_conversations_org_idx
  ON public.chat_conversations (organization_id)
  WHERE organization_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. chat_messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         text NOT NULL,
  token_count     integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx
  ON public.chat_messages (conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- 3. updated_at trigger on chat_conversations
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_chat_conversations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_conversations_set_updated_at ON public.chat_conversations;
CREATE TRIGGER chat_conversations_set_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_chat_conversations_updated_at();

-- Also bump the parent conversation's updated_at whenever a new message is
-- appended. This keeps "recent threads first" ordering accurate without the
-- API layer needing a separate UPDATE roundtrip.
CREATE OR REPLACE FUNCTION public.bump_chat_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_conversations
     SET updated_at = now()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_bump_conversation ON public.chat_messages;
CREATE TRIGGER chat_messages_bump_conversation
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_chat_conversation_on_message();

-- -----------------------------------------------------------------------------
-- 4. Row-Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_conversations_select_own ON public.chat_conversations;
CREATE POLICY chat_conversations_select_own
  ON public.chat_conversations
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS chat_conversations_insert_own ON public.chat_conversations;
CREATE POLICY chat_conversations_insert_own
  ON public.chat_conversations
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS chat_conversations_update_own ON public.chat_conversations;
CREATE POLICY chat_conversations_update_own
  ON public.chat_conversations
  FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS chat_conversations_delete_own ON public.chat_conversations;
CREATE POLICY chat_conversations_delete_own
  ON public.chat_conversations
  FOR DELETE
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS chat_messages_select_own ON public.chat_messages;
CREATE POLICY chat_messages_select_own
  ON public.chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.chat_conversations c
       WHERE c.id      = chat_messages.conversation_id
         AND c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS chat_messages_insert_own ON public.chat_messages;
CREATE POLICY chat_messages_insert_own
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.chat_conversations c
       WHERE c.id      = chat_messages.conversation_id
         AND c.user_id = (SELECT auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Grants
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations TO authenticated;
GRANT SELECT, INSERT                ON public.chat_messages      TO authenticated;
