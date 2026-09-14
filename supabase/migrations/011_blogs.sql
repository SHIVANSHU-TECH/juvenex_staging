-- 011: Featured Blogs
--
-- Adds an editorial blog table separate from the peptide reference content
-- in /learn. Blogs live at /blog/[slug] and are surfaced on the dashboard
-- home page. Public read is restricted to rows whose published_at is in
-- the past; admins (profiles.role = 'super_admin') can do anything.
--
-- NOTE: 010 is reserved for the parallel community task. Do not renumber.

-- ============================================================
-- 1. blogs table
-- ============================================================

CREATE TABLE IF NOT EXISTS blogs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  slug         text NOT NULL UNIQUE,
  excerpt      text NOT NULL,
  cover_image  text,
  body         text NOT NULL,
  author       text NOT NULL DEFAULT 'Juvenex Team',
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE blogs IS
  'Editorial blog posts shown on dashboard and at /blog/[slug]. Distinct from /learn peptide reference content.';
COMMENT ON COLUMN blogs.published_at IS
  'When the blog became publicly visible. NULL = draft. Future timestamps remain hidden until reached.';

-- Index supports the "most recent published" query path used by /api/blogs.
CREATE INDEX IF NOT EXISTS idx_blogs_published_at
  ON blogs (published_at DESC)
  WHERE published_at IS NOT NULL;

-- ============================================================
-- 2. updated_at trigger (mirrors pattern used elsewhere)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_blogs_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_blogs_updated_at ON blogs;
CREATE TRIGGER trg_blogs_updated_at
  BEFORE UPDATE ON blogs
  FOR EACH ROW EXECUTE FUNCTION public.set_blogs_updated_at();

-- ============================================================
-- 3. Row Level Security
-- ============================================================

ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;

-- Public read: only rows that are published and whose publish time has passed.
DROP POLICY IF EXISTS blogs_public_read ON blogs;
CREATE POLICY blogs_public_read ON blogs
  FOR SELECT
  USING (published_at IS NOT NULL AND published_at <= now());

-- Super admin: full access. profiles.role is defined in 001_initial_schema.sql
-- with CHECK (role IN ('patient', 'org_admin', 'super_admin')).
DROP POLICY IF EXISTS blogs_admin_all ON blogs;
CREATE POLICY blogs_admin_all ON blogs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

-- ============================================================
-- 4. Seed: 3 placeholder posts (idempotent via unique slug)
-- ============================================================

INSERT INTO blogs (title, slug, excerpt, cover_image, body, author, published_at)
VALUES
  (
    'GLP-1 101: What Every Beginner Should Know',
    'glp-1-101-what-every-beginner-should-know',
    'A plain-English introduction to semaglutide and tirzepatide — how they work, what to expect in the first month, and the questions to bring to your prescriber.',
    '/blog/glp-1-101-what-every-beginner-should-know-cover.jpg',
    'GLP-1 receptor agonists like semaglutide (Ozempic, Wegovy) and tirzepatide (Mounjaro, Zepbound) work by mimicking a hormone your gut already produces after meals. They slow gastric emptying, blunt appetite signals in the brain, and improve how your body handles glucose. The result is a quieter relationship with food and, for most patients, gradual and sustained weight loss.

The first month is usually the hardest. Mild nausea, early fullness, and occasional fatigue are common as your body adjusts to a starting dose. These side effects almost always improve within a few weeks. Eating smaller portions of bland, protein-forward meals — and staying well hydrated — makes the transition much smoother. If symptoms become severe, your prescriber may slow the titration schedule or hold the dose for a cycle.

Set expectations honestly: GLP-1s are tools, not miracles. The patients who do best treat the medication as the start of a behavior shift — protein at every meal, resistance training to preserve lean mass, and sleep treated as a non-negotiable. Track your weight, your dose, and how you feel each week. Bring that record to every visit. The clearer your picture, the better your prescriber can personalize your protocol.',
    'Juvenex Team',
    now()
  ),
  (
    'Sleep & Semaglutide: Optimizing Recovery',
    'sleep-and-semaglutide-optimizing-recovery',
    'Why sleep is the most underrated lever on a GLP-1 protocol — what the fatigue patterns mean, and a simple framework for protecting recovery while you titrate.',
    '/blog/sleep-and-semaglutide-optimizing-recovery-cover.jpg',
    'Sleep is the lever most patients underestimate when they start a GLP-1. The medication reduces hunger and stabilizes glucose, but body recomposition still happens overnight. Growth hormone, cortisol regulation, and appetite hormones leptin and ghrelin all reset during deep and REM sleep. A patient who is dosed perfectly but sleeping six fragmented hours will plateau faster than one who protects a consistent eight.

Many patients also report a transient fatigue pattern in the first few weeks, especially after a dose escalation. Some of this is metabolic — your body is suddenly running on fewer calories, and energy follows. Some of it is GI: nausea and reduced appetite often mean you are short on protein, electrolytes, or both. The fix is rarely caffeine. It is usually a deliberate front-loaded breakfast, a salt and magnesium habit, and a hard cap on screens within an hour of bed.

Build a recovery floor before you build anything else: a fixed wake time, daylight in the first thirty minutes, and a wind-down ritual that starts before you feel tired. If you train, schedule lifts on the days furthest from your injection. Track sleep with whatever device you already own and treat anything under seven hours as a yellow flag. Recovery is not optional on GLP-1 — it is where the results are actually built.',
    'Juvenex Team',
    now()
  ),
  (
    'Stacking Peptides Safely: A Practical Guide',
    'stacking-peptides-safely-a-practical-guide',
    'What stacking actually means, what should never be combined without supervision, and the conversation to have with your provider before adding anything to your protocol.',
    '/blog/stacking-peptides-safely-a-practical-guide-cover.jpg',
    'Stacking simply means running more than one peptide or peptide-adjacent compound at the same time, usually with the goal of layering complementary effects. A common example is pairing a GLP-1 like semaglutide for appetite control with a recovery peptide like BPC-157 for gut tolerance. Stacking is not inherently dangerous, but it is also not a free upgrade — every additional compound adds variables to side effects, dosing schedules, and how your prescriber interprets your bloodwork.

There are combinations to avoid without close medical supervision. Layering two GLP-1 agonists multiplies GI side effects without proportional benefit. Combining growth hormone secretagogues with high insulin loads can affect glucose handling in ways that are hard to predict. Anything injected, anything imported from a source that is not pharmacy-grade, and anything sold with claims that sound like marketing copy deserves the same skepticism you would apply to any prescription drug. If a vendor will not show you a certificate of analysis, treat that as a no.

The safest approach is boring on purpose: one change at a time, two to four weeks of observation between additions, and labs before and after any meaningful protocol shift. Bring the full list — including supplements, peptides, and over-the-counter medications — to every provider visit. A good clinician will not judge you for asking about a stack; they will help you sequence it so that if something goes wrong, you can tell which lever caused it.',
    'Juvenex Team',
    now()
  )
ON CONFLICT (slug) DO NOTHING;
