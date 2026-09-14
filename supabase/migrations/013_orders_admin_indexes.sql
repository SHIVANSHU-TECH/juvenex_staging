-- 013: Orders table + admin moderation columns
--
-- Changes:
--   1. New `orders` table for the admin Orders tab.
--      No prior migration created an `orders` or `payments` table — verified
--      against 001..012 before adding this. Stripe-related state still lives
--      on `subscriptions`; `orders` represents one-shot shop checkouts.
--   2. New `profiles.banned_at` column used by the admin Reports tab "Ban User"
--      action. NULL means active; non-NULL is a soft ban.
--   3. RLS: super_admin can read all orders; users can read their own; only
--      service-role inserts/updates orders (no client-side mutation policy).

-- ---------------------------------------------------------------------------
-- 1. orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_cents int NOT NULL CHECK (total_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'shipped', 'refunded', 'cancelled')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own orders.
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- Super admins can SELECT all orders.
DROP POLICY IF EXISTS "Super admins can view all orders" ON orders;
CREATE POLICY "Super admins can view all orders" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'super_admin'
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through service-role API
-- routes (checkout webhook, admin tools) which bypass RLS.

-- ---------------------------------------------------------------------------
-- 2. profiles.banned_at
-- ---------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS banned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_banned_at
  ON profiles(banned_at)
  WHERE banned_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. post_reports — extra index for admin filter-by-status queries.
-- ---------------------------------------------------------------------------
-- 010 already created idx_post_reports_status (status, created_at DESC).
-- No extra index needed; the migration file documents that the admin route
-- relies on it.
