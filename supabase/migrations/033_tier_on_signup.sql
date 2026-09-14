-- 033: Allow 'pending' subscription status for tier-on-signup flow.
--
-- New register flow creates a subscriptions row at signup with status
-- 'pending' until the payment processor confirms. Free tier users still get
-- no subscription row.

BEGIN;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (
    status IN (
      'active',
      'canceled',
      'past_due',
      'trialing',
      'pending'
    )
  );

COMMENT ON COLUMN public.subscriptions.status IS
  'Subscription lifecycle status. "pending" indicates a tier was selected at signup but payment is not yet confirmed.';

COMMIT;
