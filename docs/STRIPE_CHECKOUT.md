# Store checkout — Stripe tokenized payment

Status: **built, typechecked, not live.** The code ships in a disabled state
because the Stripe account keys have not been provisioned yet. Nothing is
charged and nothing throws until the keys land — see *Go-live* below.

Scope: the `(jx)` storefront checkout (`/store/checkout`) against WhiteLabelMD.
Membership billing is a separate path (Kurv) and is not affected by any of this.

## Why it was rebuilt

The previous checkout posted card fields to our own API and forwarded them to
the vendor's `Create_Order`. That put raw PAN data in our request logs, our
process memory, and our PCI scope. WhiteLabelMD's guidance is to charge the
card ourselves and hand them a `payment_token` instead, so the rebuild moves
card entry into Stripe's iframe and our servers never see a card number.

## The flow

```
browser                     our server                    Stripe        vendor
   │                             │                           │             │
   │ POST create-intent          │                           │             │
   │  {lines, coupons}           │  price each line via      │             │
   │────────────────────────────>│  Get_Product_Details ─────┼────────────>│
   │                             │  discounts via Check_Coupons ───────────>│
   │                             │  create PaymentIntent     │             │
   │                             │  capture_method: manual ─>│             │
   │ <──── client_secret ────────│                           │             │
   │                             │                           │             │
   │ stripe.confirmPayment ──────┼──────────────────────────>│  AUTHORIZED │
   │                             │                        (requires_capture)
   │ POST finalize               │                           │             │
   │  {intent_id, lines}         │  Create_Order_Offline ×N  │             │
   │────────────────────────────>│  same payment_token ──────┼────────────>│
   │                             │                           │             │
   │                             │  all N ok → capture ─────>│   CHARGED   │
   │                             │  any fail → cancel ──────>│  HOLD FREED │
   │ <──── result ───────────────│                           │             │
```

Files:

| Path | Role |
|---|---|
| `src/lib/juvenex/stripe.ts` | Client accessor, `isStripeConfigured()`, the shared 503, `discountToCents()` |
| `src/app/api/juvenex/orders/create-intent/route.ts` | Prices the bag server-side, opens one manual-capture intent |
| `src/app/api/juvenex/orders/finalize/route.ts` | N vendor orders, then capture-or-cancel |
| `src/components/jx/checkout/CheckoutForm.tsx` | `<Elements>` + `<PaymentElement>`, drives both routes |
| `src/lib/juvenex/schemas.ts` | `createIntentSchema`, `finalizeOrderSchema`, `finalizeOrderLineSchema` |

## Four invariants worth not breaking

**One intent per cart, not per line.** The vendor takes one product per
`Create_Order_Offline` call, so a bag of N items is N calls — but a
PaymentElement is bound to one client secret for its lifetime, so a per-line
intent would make the customer re-enter their card for every item. One
authorization covers the cart total; `finalize` passes that same `pi_…` id to
every vendor call as `payment_token`.

**The client never names a price.** `createIntentSchema` accepts product ids and
coupon codes and nothing else, `.strict()`. Every price comes from
`Get_Product_Details` and every discount from `Check_Coupons`, both server-side.
A tampered request can change *what* is bought, never *what it costs*.

**Manual capture is what makes it atomic.** The N vendor calls can each fail
independently, and they happen after the card is entered. Authorizing first and
capturing only once every call has succeeded means the customer is either
charged and holding orders, or not charged at all — never partially charged. A
failed bag cancels the authorization instead of leaving a charge to refund by
hand.

**Unconfigured is a supported state, not an error.** No module throws at load
and no route throws on a missing key. `getStripeClient()` returns null and the
routes return a 503 `payment_not_configured` that the UI explains. A 500 stack
trace on an unconfigured box would be indistinguishable from a real outage.
`.env.example`'s `pk_test_placeholder_…` / `sk_test_placeholder_…` and the older
`your_…` convention are both recognised as absent, so copying the example file
cannot be mistaken for a working configuration.

## Known landmines

1. **`discount_amount` has no documented format.** `Check_Coupons` returns it as
   a bare string and the vendor docs never say whether it is dollars or a
   percentage. `discountToCents()` handles both (anything containing `%` is a
   percentage of the line price) and returns `null` when it cannot parse.
   **Callers must treat `null` as "refuse to build a charge", never as "no
   discount"** — silently charging full price on a coupon the vendor accepted is
   worse than failing the checkout. Confirm the real format with the vendor
   before the first coupon goes live.

2. **Stripe rejects anything under 50 cents.** A 100%-off comp code lands below
   the minimum, so a fully comped bag cannot go through a PaymentIntent at all.
   `STRIPE_MIN_CENTS` in `create-intent` guards it today; a comped bag needs a
   path that skips Stripe entirely if the client wants to keep issuing 100%
   codes here.

3. **Orphaned vendor orders on partial failure.** Cancelling the hold does not
   delete vendor orders that already succeeded earlier in the same bag. Those
   ids come back in `completedOrderIds` and are logged at error level: the
   customer is not out any money, but support has orders to void upstream.
   Automating that needs a vendor cancel endpoint we do not have.

4. **Capture can fail after every vendor order succeeded.** Rare, but the route
   returns `captured: false` and logs at error level rather than pretending the
   order failed — the orders exist and must be reconciled by hand.

## Go-live checklist

1. Get the Stripe account from Braeden. Set in `.env.local`:
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY` — both from the
   same account, and the secret key never gets a `NEXT_PUBLIC_` prefix.
2. Start on **test keys** and run a full bag end to end: single line, multi-line,
   a coupon, and a deliberately failing line to confirm the hold is released.
3. Confirm the real `discount_amount` format with WhiteLabelMD and remove the
   guesswork from `discountToCents()` if it turns out to be one or the other.
4. Decide the 100%-comp story (landmine 2) before enabling any full-comp code on
   the store.
5. CSP is already done — `src/proxy.ts` admits `js.stripe.com` in `script-src`,
   `api.stripe.com` in `connect-src`, and `js.stripe.com` + `hooks.stripe.com`
   (3-D Secure) in `frame-src`. Re-check it only if the PaymentElement fails to
   mount, since a CSP block is silent.
6. Build to a scratch dist dir, `pm2 restart`, then verify on the public domain —
   a stale client cache is the usual explanation for "it's broken on my phone"
   right after a deploy.
7. Switch to live keys only after 2–6 pass.
