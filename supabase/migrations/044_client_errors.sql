-- 044: client_errors — captures browser/client-side errors so production
-- frontend failures are visible (the app had no client-side error reporting).
-- Written by the client-error reporter (window error/unhandledrejection/resource
-- + console.error) via POST /api/client-error, inserted with the service role.
CREATE TABLE IF NOT EXISTS public.client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  organization_id uuid,
  error_type text,
  message text NOT NULL,
  stack text,
  source_url text,
  line_no int, col_no int,
  page_url text,
  user_agent text,
  app_release text,
  extra jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON public.client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_user ON public.client_errors (user_id);
-- Service role inserts (bypasses RLS). No SELECT policy → only service-role/admin reads.
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
