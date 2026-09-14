-- 048_shop_quiz.sql
--
-- Durable store for the shop-entry quiz (5-question funnel → 1-3 peptide
-- recommendation). Primary purpose: so the quiz never re-nags a member once
-- they've completed OR skipped it, across devices (localStorage handles the
-- same-device case instantly; this is the cross-device + analytics backstop).
--
-- One row per submission (history kept); the latest row per user is what the
-- gate reads. This is a marketing funnel record, NOT clinical data — the real
-- clinical intake lives in the PrescribeRx embed.

create extension if not exists pgcrypto;

create table if not exists public.shop_quiz_responses (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  -- Q1 selected goals (up to 2).
  goals               text[] not null default '{}',
  -- Q2–Q4b branch answers keyed by goal, e.g. { "weight_loss": "never" }.
  branch_answers      jsonb not null default '{}'::jsonb,
  -- Q5 pre-screen flags (excluding 'none').
  prescreen_flags     text[] not null default '{}',
  -- Resolved recommendation.
  recommended_peptides text[] not null default '{}',
  suggested_tier      text,
  -- 'completed' = answered through to a recommendation; 'skipped' = dismissed.
  status              text not null default 'completed'
                        check (status in ('completed', 'skipped')),
  quiz_version        integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_shop_quiz_user_created
  on public.shop_quiz_responses (user_id, created_at desc);

-- All access is via the service-role admin client (server routes enforce the
-- authenticated owner). Enable RLS with no permissive policies so anon/auth
-- keys cannot read/write directly.
alter table public.shop_quiz_responses enable row level security;
