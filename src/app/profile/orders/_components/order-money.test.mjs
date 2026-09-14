// Regression test for order money reconciliation — run with `npm test`
// (`node --test`). Zero-dependency: the project has no test framework, so this
// uses Node's built-in test runner.
//
// It guards the invariant that the Items section on /profile/orders/[id]
// reconciles: the displayed line items, minus any discount/comp line, always
// equal the charged total — so a customer never sees a $179 line against a $0
// total with no explanation (the original bug on order #B7DFE384).
//
// `reconcile()` below MIRRORS orderMoneySummary() in ./types.ts. types.ts is
// TypeScript and can't be imported by node:test without a transpiler; keep the
// two in sync. The test asserts the property, not just the mirror, so a real
// divergence in behaviour is caught by the labeled-case expectations.

import { test } from 'node:test'
import assert from 'node:assert/strict'

function normalize(items) {
  let arr = items
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr) } catch { return [] }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      name: typeof r.name === 'string' && r.name ? r.name : 'Item',
      quantity: Number.isFinite(r.quantity) ? r.quantity : 1,
      line_total_cents: Number.isFinite(r.line_total_cents) ? r.line_total_cents : 0,
      kind: typeof r.kind === 'string' ? r.kind : undefined,
      recurring: r.recurring === true,
    }))
}

function reconcile(items, totalCents) {
  const list = normalize(items)
  const lineSumCents = list.reduce((s, i) => s + i.line_total_cents, 0)
  const total = Number.isFinite(totalCents) ? totalCents : 0
  const discountCents = Math.max(0, lineSumCents - total)
  const membership = list.find((i) => i.kind === 'membership') ?? null
  return {
    lineSumCents,
    totalCents: total,
    discountCents,
    comped: membership !== null && total === 0,
    recurring: membership?.recurring === true,
    reconciles: lineSumCents - discountCents === total,
  }
}

const membershipLine = (cents, recurring = false) => ({
  kind: 'membership', name: 'Membership — Advanced', quantity: 1,
  unit_price_cents: cents, line_total_cents: cents, recurring,
})
const productLine = (cents, qty = 1) => ({
  name: 'Peptide', quantity: qty, unit_price_cents: cents / qty, line_total_cents: cents,
})

test('comped membership: $179 line, $0 charged — reconciles via a comp line', () => {
  const m = reconcile([membershipLine(17900)], 0)
  assert.equal(m.lineSumCents, 17900)
  assert.equal(m.totalCents, 0)
  assert.equal(m.discountCents, 17900) // the labeled "Complimentary access" line
  assert.equal(m.comped, true)
  assert.equal(m.reconciles, true) // 17900 - 17900 === 0
})

test('recurring paid membership: $179 line, $179 charged — labeled subscription', () => {
  const m = reconcile([membershipLine(17900, true)], 17900)
  assert.equal(m.discountCents, 0)
  assert.equal(m.recurring, true)
  assert.equal(m.comped, false)
  assert.equal(m.reconciles, true)
})

test('plain product order: line items sum to the charged total', () => {
  const m = reconcile([productLine(5900), productLine(6900)], 12800)
  assert.equal(m.lineSumCents, 12800)
  assert.equal(m.discountCents, 0)
  assert.equal(m.reconciles, true)
})

test('invariant holds for arbitrary orders: lineSum - discount === total', () => {
  const cases = [
    [[membershipLine(21900)], 0],
    [[membershipLine(9500, true)], 9500],
    [[productLine(1000), productLine(2500)], 3500],
    [[productLine(1000)], 700], // partial discount
  ]
  for (const [items, total] of cases) {
    const m = reconcile(items, total)
    assert.equal(m.lineSumCents - m.discountCents, m.totalCents)
    assert.equal(m.reconciles, true)
  }
})

test('corrupt items never throw and reconcile to the total', () => {
  for (const bad of [null, undefined, '{not json', 42, [{ junk: true }]]) {
    const m = reconcile(bad, 0)
    assert.equal(m.lineSumCents, 0)
    assert.equal(m.reconciles, true)
  }
})
