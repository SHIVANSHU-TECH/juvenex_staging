# Seamless one-charge checkout — technical plan

**Status:** proposal for review (no code written yet)
**Goal:** A customer selects a membership tier **and** products in one cart and pays **once**, instead of today's two-payment, two-redirect flow. Membership still auto-renews monthly; products are one-time.

---

## 1. Current state (verified)

A brand-new customer who wants a membership + one product makes **two separate payments**:

1. **Membership** — `POST /api/payments/membership/checkout` → Kurv hosted page → redirect back.
2. **Products** — return to `/shop`, add to cart, `POST /api/payments/checkout` → a *second* Kurv hosted page → redirect back.

They're forced to do membership first because the shop gates locked products (`shop/page.tsx` add-to-cart + checkout gates; `lib/membership.ts`). Two redirects + two card entries = the checkout drop-off Braeden flagged.

Prescription items additionally require an inline medical intake (`checkout/_components/IntakeForm.tsx`, server-validated in `api/payments/checkout/route.ts`). **This is a telehealth legal requirement, not removable friction** — it only appears when an Rx item is in the cart.

## 2. The hard constraint: what Kurv can and can't do

From Kurv's docs:

- ❌ **No tokenization / card-on-file / merchant-initiated charges.** We cannot store a card and charge it later. So "enter card once, we charge products separately afterward" is **impossible**.
- ❌ **No embedded/inline card form** — only a hosted redirect (`long_url`). One redirect per charge is unavoidable.
- ✅ **One payment-request can carry `cart_items`** (array of `{name, qty, sales_price}`) for an itemized pay page.
- ✅ **A recurring request separates two amounts:** `initial_payment_amount` (charged immediately) from the recurring `amount` (charged each `payment_frequency` from `payment_start_date`).

**The unlock:** put the *whole first purchase* into `initial_payment_amount`, and only the membership into the recurring `amount`.

## 3. Proposed design

### One Kurv request does it all
When the cart contains a membership tier + products, create a **single recurring** Kurv payment-request:

| Field | Value |
|---|---|
| `initial_payment_amount` | first-month membership **+ all products** (charged now) |
| `amount` (recurring) | membership monthly price |
| `payment_frequency` | `MONTHLY` |
| `payment_start_date` | now **+ 1 month** (safely future; see the bug we already fixed) |
| `total_number_of_payments` | 120 (until cancelled) |
| `cart_items` | membership line + each product line (for the pay page) |

Result: **one redirect, one card entry.** Customer is charged membership + products now; only the membership recurs monthly. Products are correctly never re-billed.

If the cart has **products only and the user is already a member** → fall back to today's **one-time** charge (unchanged).

### Cart model
Extend the cart (`glp-cart` in localStorage) to hold an optional single **membership selection** (`{ plan, selectedProtocols }`) alongside product items. Membership is a distinct cart slot, not a product row.

### Combined checkout API
Extend `POST /api/payments/checkout` to accept an optional `membership: { plan, selectedProtocols }`:

1. Auth + rate limit (existing).
2. Resolve membership tier server-side (`resolveMembershipSelection`) — **price is server-authoritative**, never client-supplied.
3. Compute product totals from `shop_products` (existing logic).
4. `initialAmountCents = membershipFirstMonth + productsTotal`; `recurringAmountCents = membershipMonthly`.
5. Rx intake gate (existing) when Rx products present.
6. Create **one** order: `items = [membershipLineItem, ...productItems]`, `total_cents = initialAmountCents`.
7. Create **one** Kurv session: recurring (table above) when membership present; one-time otherwise.
8. Return `sessionUrl`.

### Activation + fulfillment on payment (mostly already built)
On the paid webhook/verify (`api/payments/webhook`, `api/payments/verify`):
- `activateMembershipFromOrder` parses the membership line → activates the recurring subscription. (It already ignores non-membership items.)
- The `order.paid` audit event drives the existing manual PrescribeRx fulfillment for the product lines.
- **One paid order → membership active + product order queued**, no new fulfillment plumbing.

### Gating change (removes the "membership first" trip)
- Let non-members **add gated products to the cart**.
- At checkout, if the cart has tier-gated products and the user has no active membership and no membership in the cart → one-click **"Add {tier} membership"** into the same cart, then proceed to the single checkout.
- Already-active members → products-only one-time charge.

## 4. File-by-file change list

| File | Change |
|---|---|
| `checkout/_components/cart.ts` (+ shop cart util) | Add a membership slot to the cart model + helpers. |
| `app/shop/page.tsx` | Locked-product CTA adds the product + prompts to add the required tier (instead of bouncing to a separate membership checkout). |
| `app/checkout/page.tsx` | Render the membership line; show "Due today" (initial) vs "Then $X/mo". Pass membership to submit. |
| `checkout/_components/CartReview.tsx`, `ReviewSubmit.tsx` | Display combined breakdown + recurring disclosure. |
| `api/payments/checkout/route.ts` | Accept `membership`; compute combined initial + recurring; build combined order; single Kurv session (recurring when membership present). Reuse `resolveMembershipSelection` / `buildMembershipOrderItem`. |
| `lib/payments/provider.ts` + `lib/payments/kurv-provider.ts` | Add `cartItems` to `CheckoutSessionRequest`; send Kurv `cart_items`. Recurring fields already exist. |
| `api/payments/membership/checkout/route.ts` | Keep for membership-only purchases (back-compat) or internally route through the unified path. |
| `lib/membership-checkout.ts`, webhook, verify | No change expected — confirm combined items activate membership + don't break the amount check. |

## 5. Risks & edge cases

- **Amount integrity (the one thing to verify live):** the webhook/verify amount check compares Kurv's reported charge to `order.total_cents`. We set `total_cents = initial_payment_amount`. We must confirm Kurv's **first** charge reports `initial_payment_amount` (not the recurring `amount`). Kurv's docs don't state this → **must be confirmed by one live test.** If it reports the recurring amount instead, we adjust which value we store as `total_cents`.
- **Double membership:** if an already-active member somehow has a membership in cart, drop it server-side (no double subscription).
- **Refunds:** a combined order refunds all-or-nothing through Kurv — note for support/ops.
- **Cancellation:** unchanged — `Cancel membership` stops the recurring; delivered products are unaffected.
- **Rx intake:** unchanged; required only when Rx products are in the cart.
- **Still one redirect:** Kurv has no embedded form; we can't make it fully on-site.

## 6. Test plan (live key — no sandbox available)

1. Membership-less test account: add the **cheapest tier + one cheap non-Rx product**, run the unified checkout.
2. Confirm on Kurv: status **ACK**, `payment_frequency MONTHLY`, next charge ~+1 month, charged amount = initial (membership + product).
3. Confirm in app: order → `paid`, subscription → `active` (recurring), product order queued, **no** "amount mismatch" or "decode failed" in logs.
4. Immediately **cancel** the test membership (and optionally refund the test charge) to stop the future charge.

## 7. Rollout

Build behind the existing flow → deploy → run the single test → if clean, ship. If the amount check fails, switch `total_cents` to Kurv's reported first-charge value and re-test. Low blast radius: the membership-only and products-only paths keep working throughout.

## 8. Open questions for Braeden

1. Are **all** store items members-only, or only the higher-tier gated ones? (Affects whether non-members can ever buy products without a membership.)
2. Confirm the recurring membership should always renew **monthly** (vs offering 3-/6-month prepaid one-time options that avoid recurring entirely).
3. Refund policy on a combined membership+product order.

---

**Estimate:** ~1 focused day to build + the single live test. Nothing here is shipped until reviewed and the test passes.
