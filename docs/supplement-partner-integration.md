# Supplement Supplier Integration — Brief for Partner

**Audience:** the supplement supplier's engineering / ops team
**Goal:** Users browse the supplier's catalog inside the Juvenex store, place orders, the
supplier fulfills + ships + tracks them, knows the orders came from us, and we settle up so
Juvenex keeps its margin.

---

## Part 1 — Commercial model (how the money works)

**Recommended: Juvenex collects retail, remits wholesale (dropship model).**

1. Customer pays **Juvenex** full retail at checkout (via our existing processor, Kurv).
2. Juvenex forwards the order to the supplier with attribution data.
3. Supplier ships and invoices Juvenex the agreed **wholesale** cost.
4. Juvenex pays that invoice (net-30 / agreed cycle). Juvenex keeps the margin.

Why this model: we already own checkout; margin is captured at sale (not dependent on the
partner's reporting); refunds/chargebacks sit with us (we hold the customer + the money) and
we claw back wholesale on returns. **Note:** our processor (Kurv) is collection-only — it has
**no payouts/splits/connected accounts** — so any "processor auto-splits to the supplier"
model is not possible. Settlement is out-of-band (ACH/invoice).

**Partner must provide for settlement:**
- Wholesale price list per SKU (sku, wholesale_unit_cost, MSRP/MAP, currency, effective_date, discontinued), with ≥14 days' notice on price increases.
- Per-order fulfillment record + a net-30 settlement statement (our_order_id, partner_order_id, sku, qty, wholesale cost, ship status/date) — each line tagged with our order id, never commingled with other channels.
- A dispute window (e.g. 30 days) and an audit export on request.

---

## Part 2 — Technical: what the partner must build

All JSON over HTTPS only. Money = integer minor units + ISO-4217 currency (e.g. `1999` + `USD`
= $19.99). Timestamps ISO-8601 UTC.

### 2.1 Catalog feed — `GET /v1/products`
Paginated (or a hosted JSON feed). Per product: `sku` (stable/unique), `name`, `description`,
`category`, `price`, `compare_at_price`, `currency`, `active`, `inventory.stock_status`
(`in_stock|out_of_stock|backorder|discontinued`), `weight`, `images[]` (≥1, public CDN URLs),
optional `variants[]` (each with its own `sku`), and `updated_at`. Support
`?updated_since=<ts>` for incremental sync (we poll ~every 15 min). Discontinue via
`active:false` — never hard-delete a SKU.

### 2.2 Order submission — `POST /v1/orders`
Synchronous accept/reject. Request: `our_order_id`, `merchant_id` ("juvenex"), `line_items[]`
(`sku`, `quantity`, `unit_price`), `shipping` (recipient + address + method), `contact`
(email/phone). Headers: `Authorization: Bearer <API_KEY>` + `Idempotency-Key`.
- 201 accepted → returns `partner_order_id`, `estimated_ship_date`.
- 422 rejected → error envelope with codes (`sku_not_found`, `out_of_stock`, `price_mismatch`, `invalid_address`, …).
- Same idempotency key + same body → return the original response (no duplicate order).

### 2.3 Status webhooks (partner → our callback URL)
Signed with **HMAC-SHA256** over the raw body (header `X-Partner-Signature: t=<ts>,v1=<hmac>`),
unique `event_id` for dedupe. Events (each carries `our_order_id` + `partner_order_id`):
- `order.accepted` (if not returned synchronously)
- `order.shipped` → `carrier`, `tracking_number`, `tracking_url` (support split shipments)
- `order.delivered`
- `order.cancelled` → reason
- `order.refunded` → amount + items (their disposition; the customer refund is executed on our side)

We return 2xx on receipt; retry with backoff over ~24h on failure.

### 2.4 Auth & security
Two API keys (sandbox + production) as bearer tokens; key rotation supported. HMAC signing
secret for webhooks (separate per environment). TLS 1.2+. Static egress IPs for their webhooks
so we can allowlist.

### 2.5 Sandbox
A fully isolated sandbox with its own keys + signing secret, seeded test SKUs (in-stock,
out-of-stock, multi-variant), and "magic" SKUs/addresses that deterministically trigger
shipped / cancelled / out-of-stock so we can test end-to-end. (No test cards needed — payment
is on our side.)

### 2.6 Attribution
A constant `merchant_id` ("juvenex") on every order + mirrored on every webhook, plus the
API key mapping, so every order is provably ours for their reporting.

---

## Part 3 — What Juvenex builds on its side
- A store toggle/tab: **GLP-1 & peptides** (PrescribeRx) vs **Supplements** (this partner).
- Fetch + cache the partner catalog; render supplement products from their feed.
- Route supplement orders to `POST /v1/orders` (async, idempotent on our order id) — mirroring
  our existing PrescribeRx fulfillment-forwarding pattern.
- A partner webhook receiver (HMAC-verified, idempotent) to update order shipping/tracking —
  same pattern as our PrescribeRx webhook handler.
- A wholesale-cost ledger + settlement-reconciliation table for accounting.

---

## MVP (ship first) vs nice-to-have
**MVP:** `GET /v1/products` (with `updated_since`), `POST /v1/orders` (sync accept/reject +
idempotency), webhooks for `order.shipped` (carrier+tracking) and `order.cancelled`, API-key
auth + HMAC webhooks, a sandbox with test SKUs, `merchant_id` attribution, wholesale price list
+ settlement report.
**Nice-to-have:** real-time `product.updated`/`product.deleted` push, `order.delivered` /
`order.refunded`, split shipments, inbound cancel endpoint, exact inventory counts, rate-limit
headers + dead-letter replay.
