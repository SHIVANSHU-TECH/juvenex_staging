-- 047_coupons.sql
--
-- Admin-managed discount coupons for membership checkout.
--
-- Motivation: the previous "free promo code" mechanism was a hard-coded env
-- list (MEMBERSHIP_FREE_PROMO_CODES) — 100%-off only, no per-code limits, no
-- audit trail, and only changeable by a redeploy. This adds a proper,
-- database-backed coupon system that super_admins create + configure from the
-- admin console: any percent (incl. 100%) or fixed-dollar discount, optional
-- redemption caps, per-user limits, and expiry. Redemptions are recorded so a
-- coupon's remaining uses can be enforced and reported.
--
-- Scope: coupons apply to the Juvenex-side MEMBERSHIP checkout (the only
-- checkout Juvenex charges directly; shop items go through the PrescribeRx
-- hosted embed). `applies_to` is kept as a column for future expansion.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- coupons — one row per discount code.
-- ---------------------------------------------------------------------------
create table if not exists public.coupons (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,
  description       text,
  -- 'percent' → discount_value is 1..100 (percent off).
  -- 'fixed'   → discount_value is a positive amount in CENTS off.
  discount_type     text not null check (discount_type in ('percent', 'fixed')),
  discount_value    integer not null check (discount_value >= 0),
  -- Which checkout the code is valid on. Only 'membership' is honored today.
  applies_to        text not null default 'membership'
                      check (applies_to in ('membership', 'all')),
  -- null = unlimited total redemptions.
  max_redemptions   integer check (max_redemptions is null or max_redemptions > 0),
  -- 0 = unlimited per user; otherwise the max times one user may redeem it.
  per_user_limit    integer not null default 1 check (per_user_limit >= 0),
  -- Maintained by the trigger below (cached count of coupon_redemptions rows).
  redeemed_count    integer not null default 0 check (redeemed_count >= 0),
  expires_at        timestamptz,
  active            boolean not null default true,
  -- null = global (any tenant). Set to scope a code to one organization.
  organization_id   uuid references public.organizations(id) on delete cascade,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Codes are matched case-insensitively; enforce uniqueness on the upper form.
create unique index if not exists idx_coupons_code_unique
  on public.coupons (upper(code));
create index if not exists idx_coupons_active on public.coupons (active);
create index if not exists idx_coupons_org on public.coupons (organization_id);

-- ---------------------------------------------------------------------------
-- coupon_redemptions — one row per successful application of a coupon.
-- The unique index on order_id makes recording idempotent (an order can carry
-- exactly one coupon), so the payment webhook + success-return verify paths can
-- both call recordCouponRedemption without double-counting.
-- ---------------------------------------------------------------------------
create table if not exists public.coupon_redemptions (
  id             uuid primary key default gen_random_uuid(),
  coupon_id      uuid not null references public.coupons(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  order_id       uuid references public.orders(id) on delete set null,
  discount_cents integer not null default 0 check (discount_cents >= 0),
  created_at     timestamptz not null default now()
);

create unique index if not exists idx_coupon_redemptions_order
  on public.coupon_redemptions (order_id) where order_id is not null;
create index if not exists idx_coupon_redemptions_coupon
  on public.coupon_redemptions (coupon_id);
create index if not exists idx_coupon_redemptions_coupon_user
  on public.coupon_redemptions (coupon_id, user_id);

-- ---------------------------------------------------------------------------
-- Keep coupons.redeemed_count in lockstep with coupon_redemptions rows so
-- validation ("uses remaining") and the admin UI never drift. Atomic under
-- concurrency because it's a single UPDATE inside the row trigger.
-- ---------------------------------------------------------------------------
create or replace function public.sync_coupon_redeemed_count()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    update public.coupons
       set redeemed_count = redeemed_count + 1, updated_at = now()
     where id = new.coupon_id;
  elsif (tg_op = 'DELETE') then
    update public.coupons
       set redeemed_count = greatest(redeemed_count - 1, 0), updated_at = now()
     where id = old.coupon_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_coupon_redeemed_count on public.coupon_redemptions;
create trigger trg_coupon_redeemed_count
  after insert or delete on public.coupon_redemptions
  for each row execute function public.sync_coupon_redeemed_count();

-- ---------------------------------------------------------------------------
-- RLS: all access is via the service-role admin client (server routes enforce
-- super_admin). Enable RLS with no permissive policies so anon/authenticated
-- keys cannot read or write coupons directly.
-- ---------------------------------------------------------------------------
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
