-- 038: AI Assistant Knowledge Base (Path A — curated prompt-injection)
--
-- Backs the "plug Pep-pedia into the assistant" request (Braeden). This is the
-- lightweight Path A: a curated reference table whose active rows are stuffed
-- into the ai/chat system prompt at request time, exactly like the existing
-- product and blog catalogs (see src/app/api/ai/chat/route.ts). No embeddings
-- or vector search — that is the future Path B (RAG over the full site).
--
-- The /learn page already hosts peptide reference content; this table is the
-- *assistant-facing* knowledge surface, kept separate so curation here never
-- changes what users browse there.
--
-- COMPLIANCE: entries are REFERENCE ONLY. The assistant's mandatory refusal
-- rules (no dosing, no stacks, no diagnosis -> consult) still apply on top of
-- anything injected from here. Do NOT seed dosing protocols or stack recipes.
--
-- CONTENT RIGHTS: the two rows seeded below are generic, original placeholders
-- written for this migration — NOT copied from pep-pedia.org. Replace them with
-- licensed Pep-pedia content once rights are confirmed.

-- ============================================================
-- 1. knowledge_entries table
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       text NOT NULL,
  title       text NOT NULL,
  slug        text NOT NULL UNIQUE,
  summary     text NOT NULL,
  body        text NOT NULL,
  source_name text NOT NULL DEFAULT 'Pep-pedia',
  source_url  text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE knowledge_entries IS
  'Curated reference snippets injected into the ai/chat system prompt (Path A). Reference-only; refusal rules still apply. Distinct from the user-facing /learn content.';
COMMENT ON COLUMN knowledge_entries.summary IS
  'Short reference blurb (~1-2 sentences) interpolated into the system prompt. Keep concise — this is token budget.';
COMMENT ON COLUMN knowledge_entries.is_active IS
  'Only is_active rows are surfaced to the assistant. Use as a draft/disable switch.';

-- The loader reads active rows ordered most-recent-first; index that path.
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_active
  ON knowledge_entries (created_at DESC)
  WHERE is_active = true;

-- ============================================================
-- 2. updated_at trigger (mirrors set_blogs_updated_at pattern)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_knowledge_entries_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_entries_updated_at ON knowledge_entries;
CREATE TRIGGER trg_knowledge_entries_updated_at
  BEFORE UPDATE ON knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_knowledge_entries_updated_at();

-- ============================================================
-- 3. Row Level Security
-- ============================================================

ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;

-- Public read: active rows only. The ai/chat route reads with the caller's
-- authenticated client, so authenticated users (any tier) can read active rows.
DROP POLICY IF EXISTS knowledge_entries_public_read ON knowledge_entries;
CREATE POLICY knowledge_entries_public_read ON knowledge_entries
  FOR SELECT
  USING (is_active = true);

-- Super admin: full curation access (mirrors blogs_admin_all).
DROP POLICY IF EXISTS knowledge_entries_admin_all ON knowledge_entries;
CREATE POLICY knowledge_entries_admin_all ON knowledge_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  );

GRANT SELECT ON knowledge_entries TO authenticated;

-- ============================================================
-- 4. Seed: 2 placeholder entries (idempotent via unique slug)
--    Generic/original — replace with licensed Pep-pedia content.
-- ============================================================

INSERT INTO knowledge_entries (topic, title, slug, summary, body, source_name, source_url)
VALUES
  (
    'Peptide Basics',
    'What Are Peptides?',
    'what-are-peptides',
    'Peptides are short chains of amino acids that act as signaling molecules; in a health context they are used to support metabolism, recovery, and other targeted functions under medical guidance.',
    'Peptides are short chains of amino acids — smaller than proteins — that the body uses as signaling molecules. Different peptides carry different instructions: some influence appetite and glucose handling, others support tissue repair or recovery. In a clinical weight and wellness context they are tools used alongside lifestyle changes, never substitutes for them. Quality, sourcing, and supervision matter far more than any single compound. Always work with a prescriber before considering any peptide.',
    'Pep-pedia',
    'https://pep-pedia.org'
  ),
  (
    'Safety & Sourcing',
    'Reading a Certificate of Analysis (COA)',
    'reading-a-certificate-of-analysis',
    'A Certificate of Analysis documents a compound''s identity, purity, and contaminant testing; if a vendor cannot provide a recent third-party COA, treat that as a reason not to buy.',
    'A Certificate of Analysis (COA) is a lab document that verifies what is actually in a product — its identity, its purity percentage, and screening for contaminants such as heavy metals or endotoxins. A trustworthy COA is recent, comes from an independent third-party lab, and matches the specific lot you are receiving. If a vendor will not provide one, or the document is generic and unsigned, that is a strong signal to walk away. A COA does not make any compound appropriate for you — that is a conversation for your prescriber — but it is a baseline safety filter for sourcing quality.',
    'Pep-pedia',
    'https://pep-pedia.org'
  )
ON CONFLICT (slug) DO NOTHING;
