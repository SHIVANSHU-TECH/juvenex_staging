-- 039: Plug Pep-pedia into the assistant knowledge base (Braeden request).
--
-- Replaces the two generic placeholders seeded in 038 with curated, Pep-pedia-
-- sourced reference entries for the peptides most relevant to Juvenex.
--
-- IMPORTANT — how this reaches the assistant:
--   src/app/api/ai/chat/route.ts :: loadKnowledgeCatalog selects the 12 most
--   recent ACTIVE rows and injects ONLY `topic`, `title`, and `summary`
--   (truncated to ~200 chars) into the system prompt. The `body` column is
--   stored for reference/curation but is NOT sent to the model. So the useful
--   signal lives in `summary` — keep it concise and general.
--
-- COMPLIANCE (mirrors 038): entries are REFERENCE ONLY. The assistant's
-- mandatory refusal rules (no dosing, no stacks, no diagnosis) still apply.
-- Summaries below are intentionally general/educational and contain NO dosing
-- numbers or stack recipes, even though pep-pedia.org pages do.
--
-- CONTENT: summaries are original, general-knowledge paraphrases of well-
-- established peptide pharmacology, attributed to Pep-pedia via source_url.
-- Idempotent: re-running upserts by slug.

-- 1. Retire the 038 placeholders.
UPDATE knowledge_entries
   SET is_active = false
 WHERE slug IN ('what-are-peptides', 'reading-a-certificate-of-analysis');

-- 2. Upsert the Pep-pedia reference set.
INSERT INTO knowledge_entries (topic, title, slug, summary, body, source_name, source_url, is_active)
VALUES
  (
    'Weight Loss (GLP-1)', 'Semaglutide', 'pep-semaglutide',
    'GLP-1 receptor agonist that mimics the incretin hormone GLP-1 to reduce appetite, slow gastric emptying, and improve blood sugar; studied for type 2 diabetes and chronic weight management.',
    'Semaglutide is a GLP-1 receptor agonist. By mimicking the body''s natural incretin hormone it lowers appetite, slows stomach emptying, and improves glycemic control. It is widely studied for type 2 diabetes and for chronic weight management. General educational reference only.',
    'Pep-pedia', 'https://pep-pedia.org/peptides/semaglutide', true
  ),
  (
    'Weight Loss (GIP/GLP-1)', 'Tirzepatide', 'pep-tirzepatide',
    'Dual GIP and GLP-1 receptor agonist that curbs appetite and improves glucose control; researched for type 2 diabetes and weight management, often with greater effect than GLP-1-only agents.',
    'Tirzepatide activates both the GIP and GLP-1 receptors. This dual action curbs appetite and improves glucose handling, and in studies it frequently shows greater metabolic and weight effects than single GLP-1 agonists. General educational reference only.',
    'Pep-pedia', 'https://pep-pedia.org/peptides/tirzepatide', true
  ),
  (
    'Weight Loss (investigational)', 'Retatrutide', 'pep-retatrutide',
    'Investigational triple agonist (GIP, GLP-1, and glucagon receptors) being studied for obesity and metabolic disease. Not FDA-approved; still in clinical trials.',
    'Retatrutide is an investigational triple hormone-receptor agonist (GIP, GLP-1, glucagon) in clinical development for obesity and metabolic disease. It is not FDA-approved. General educational reference only.',
    'Pep-pedia', 'https://pep-pedia.org/peptides/retatrutide', true
  ),
  (
    'Growth Hormone Support', 'Sermorelin', 'pep-sermorelin',
    'GHRH analog that stimulates the pituitary to release the body''s own growth hormone; researched for adult GH support, recovery, and sleep quality.',
    'Sermorelin is a growth-hormone-releasing-hormone (GHRH) analog that prompts the pituitary to secrete the body''s own growth hormone, rather than supplying GH directly. Researched for adult GH support, recovery, and sleep. General educational reference only.',
    'Pep-pedia', 'https://pep-pedia.org/peptides/sermorelin', true
  ),
  (
    'Growth', 'Tesamorelin', 'pep-tesamorelin',
    'Stabilized GHRH analog that boosts natural growth hormone; FDA-approved to reduce excess visceral abdominal fat in HIV-associated lipodystrophy.',
    'Tesamorelin is a stabilized GHRH analog that raises endogenous growth hormone. It is FDA-approved to reduce excess visceral abdominal fat in HIV-associated lipodystrophy. General educational reference only.',
    'Pep-pedia', 'https://pep-pedia.org/peptides/tesamorelin', true
  ),
  (
    'Growth Hormone Support', 'Ipamorelin', 'pep-ipamorelin',
    'Selective growth-hormone secretagogue (ghrelin-receptor agonist) that prompts GH release with minimal effect on cortisol or appetite; studied for recovery and body composition.',
    'Ipamorelin is a selective growth-hormone secretagogue acting on the ghrelin receptor to trigger a GH pulse, with little impact on cortisol or appetite. Studied for recovery and body composition. General educational reference only.',
    'Pep-pedia', 'https://pep-pedia.org/peptides/ipamorelin', true
  ),
  (
    'Growth Hormone Support', 'CJC-1295', 'pep-cjc-1295',
    'Long-acting GHRH analog that raises growth hormone and IGF-1 levels; commonly studied alongside ghrelin-type secretagogues for recovery and body composition.',
    'CJC-1295 is a long-acting GHRH analog that elevates growth hormone and IGF-1. It is commonly researched together with ghrelin-type secretagogues for recovery and body composition. General educational reference only.',
    'Pep-pedia', 'https://pep-pedia.org/peptides/cjc-1295', true
  ),
  (
    'Recovery (research)', 'BPC-157', 'pep-bpc-157',
    'Synthetic peptide derived from a gastric protein, researched for tissue repair, gut health, and tendon/ligament healing. Research use only; not FDA-approved.',
    'BPC-157 is a synthetic peptide based on a sequence found in a gastric protein. It is researched for tissue repair, gut health, and tendon/ligament healing. Research use only; not FDA-approved. General educational reference only.',
    'Pep-pedia', 'https://pep-pedia.org/peptides/bpc-157', true
  ),
  (
    'Recovery (research)', 'TB-500 (Thymosin Beta-4)', 'pep-tb-500',
    'Synthetic form of thymosin beta-4 studied for tissue repair, flexibility, and recovery via actin regulation and cell migration. Research use only; not FDA-approved.',
    'TB-500 is a synthetic fragment related to thymosin beta-4, studied for tissue repair, flexibility, and recovery through effects on actin and cell migration. Research use only; not FDA-approved. General educational reference only.',
    'Pep-pedia', 'https://pep-pedia.org/peptides/tb-500', true
  ),
  (
    'Skin & Anti-Aging', 'GHK-Cu', 'pep-ghk-cu',
    'Naturally occurring copper-binding peptide studied for skin regeneration, collagen synthesis, and wound healing; common in topical cosmetic research.',
    'GHK-Cu is a naturally occurring copper-binding tripeptide studied for skin regeneration, collagen synthesis, and wound healing, and is widely used in topical cosmetic research. General educational reference only.',
    'Pep-pedia', 'https://pep-pedia.org/peptides/ghk-cu', true
  ),
  (
    'Metabolic & Longevity', 'NAD+', 'pep-nad',
    'Coenzyme central to cellular energy metabolism and DNA repair; supplementation is researched for energy, metabolic health, and healthy aging.',
    'NAD+ (nicotinamide adenine dinucleotide) is a coenzyme essential to cellular energy production and DNA repair. Supplementation and precursors are researched for energy, metabolic health, and healthy aging. General educational reference only.',
    'Pep-pedia', 'https://pep-pedia.org/peptides/nad', true
  ),
  (
    'Sexual Health', 'PT-141 (Bremelanotide)', 'pep-pt-141',
    'Melanocortin receptor agonist researched for sexual dysfunction; the related drug bremelanotide is FDA-approved for hypoactive sexual desire disorder in some women.',
    'PT-141 (bremelanotide) is a melanocortin receptor agonist researched for sexual dysfunction. The drug bremelanotide is FDA-approved for hypoactive sexual desire disorder in certain premenopausal women. General educational reference only.',
    'Pep-pedia', 'https://pep-pedia.org/peptides/pt-141', true
  )
ON CONFLICT (slug) DO UPDATE SET
  topic       = EXCLUDED.topic,
  title       = EXCLUDED.title,
  summary     = EXCLUDED.summary,
  body        = EXCLUDED.body,
  source_name = EXCLUDED.source_name,
  source_url  = EXCLUDED.source_url,
  is_active   = true,
  updated_at  = now();
