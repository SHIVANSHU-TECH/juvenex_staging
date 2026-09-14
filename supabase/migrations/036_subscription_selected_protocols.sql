-- Persist the protocols a member chose for protocol-based marketplace access.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS selected_protocols jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.subscriptions.selected_protocols IS
  'Selected Juvenex protocol slugs for marketplace access, e.g. weight_loss, metabolic, growth, sexual_health.';
