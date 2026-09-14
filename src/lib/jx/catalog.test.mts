// Tests for src/lib/jx/catalog.ts.
//
// Test approach: this file imports catalog.ts DIRECTLY (no mirrored/reimplemented
// parsing logic) and runs under `npx tsx --test`, not plain `node --test`.
//
// Why not follow the order-money.test.mjs precedent (reimplement the logic in
// plain JS inside the test)? That works there because reconcile() is ~15 lines
// of arithmetic. catalog.ts is ~15 regex-driven parsing functions whose entire
// job is distinguishing "(0.25 mg/week)" from "2.5mg/ml" from "2x2ml" — the
// exact kind of subtlety a hand-mirrored copy would silently drift from and
// then "pass" against its own bug. Importing the real module is the only way
// these tests catch a real regression.
//
// Why tsx instead of Node's built-in TS stripping? This box runs Node
// v20.20.0 (`node -v`); `--experimental-strip-types` isn't available until
// Node 22.6+, so `node --test` cannot load a .ts/.mts file directly here. tsx
// (v4.23.12) was already present in this environment's npx cache — confirmed
// via `npx tsx --version` and `find ~/.npm/_npx -iname '*tsx*'` before writing
// a single test — so `npx tsx --test` runs Node's real test runner with tsx
// only as an on-the-fly transpiler (esbuild under the hood), no test-framework
// swap. It also resolves the `@/*` path alias from tsconfig.json for free,
// which catalog.ts's `import type { JuvenexProduct } from '@/lib/juvenex/client'`
// needs.
//
// package.json change (reported per the brief): the "test" script now also
// runs `npx tsx --test 'src/**/*.test.mts'` after the existing `.mjs` run.
// tsx is NOT added to package.json as a dependency — it's fetched/cached by
// npx on demand, exactly as the brief allowed. If this box ever loses network
// access to the npm registry AND its npx cache, `npm test` will fail on the
// second half of that script until tsx is available again.
//
// Fixture: src/lib/jx/fixtures/products.json is the real Get_Products payload
// (60 rows) captured against the live API, copied verbatim into this owned
// fixtures directory.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { JuvenexProduct } from '@/lib/juvenex/client'
import {
  normalizeProduct,
  normalizeProducts,
  dedupeVariants,
  sortProducts,
  filterProducts,
  pickRecommended,
  formatUsd,
  type JxProduct,
  type SortKey,
} from './catalog'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, 'fixtures', 'products.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  product: JuvenexProduct[]
}
const rawProducts = fixture.product

function byId(id: string): JuvenexProduct {
  const row = rawProducts.find((p) => p.product_id === id)
  assert.ok(row, `fixture is missing product_id ${id}`)
  return row
}

// Minimal helper for building synthetic upstream rows in the sort/filter/
// pickRecommended tests below, where we want full control over price/name
// rather than hunting for the right row in the 60-item fixture.
function raw(overrides: Partial<JuvenexProduct> & { product_id: string }): JuvenexProduct {
  return {
    product_name: '',
    product_price: '0',
    product_img: [],
    ...overrides,
  }
}

describe('normalizeProduct — name-shape parsing', () => {
  test('plain "N mg/week" standard dose', () => {
    // product_id 1: "Compounded Semaglutide (0.25 mg/week)"
    const p = normalizeProduct(byId('1'))
    assert.equal(p.molecule, 'Semaglutide')
    assert.equal(p.kind, 'standard')
    assert.equal(p.doseMg, 0.25)
    assert.deepEqual(p.doseSchedule, [])
    assert.equal(p.supplyMonths, 1)
    assert.equal(p.title, 'Semaglutide 0.25 mg')
    assert.equal(p.subtitle, '0.25 mg weekly · 1 month supply')
  })

  test('"- 6 month supply" suffix', () => {
    // product_id 24: "Compounded Tirzepatide (5 mg/week) - 6 month supply"
    const p = normalizeProduct(byId('24'))
    assert.equal(p.molecule, 'Tirzepatide')
    assert.equal(p.kind, 'standard')
    assert.equal(p.doseMg, 5)
    assert.deepEqual(p.doseSchedule, [])
    assert.equal(p.supplyMonths, 6)
    assert.equal(p.title, 'Tirzepatide 5 mg')
    assert.equal(p.subtitle, '5 mg weekly · 6 month supply')
  })

  test('"mg/weekly" dose wording + "- 3 months supply" (plural)', () => {
    // product_id 55: "Compounded Tirzepatide (5 mg/weekly) - 3 months supply"
    const p = normalizeProduct(byId('55'))
    assert.equal(p.molecule, 'Tirzepatide')
    assert.equal(p.kind, 'standard')
    assert.equal(p.doseMg, 5)
    assert.equal(p.supplyMonths, 3)
    assert.equal(p.title, 'Tirzepatide 5 mg')
    assert.equal(p.subtitle, '5 mg weekly · 3 month supply')
  })

  test('maintenance pack: vial concentration is never read as the dose', () => {
    // product_id 13: "3-mo, MAINT, Semaglutide injection 2.5mg/ml, 1mg, (2x2ml, 1.25ml vial)"
    const p = normalizeProduct(byId('13'))
    assert.equal(p.molecule, 'Semaglutide')
    assert.equal(p.kind, 'maintenance')
    assert.equal(p.doseMg, null)
    // Critical: 2.5mg/ml (concentration) and 2x2ml/1.25ml (volumes) must be
    // excluded; only the bare "1mg" dose survives.
    assert.deepEqual(p.doseSchedule, [1])
    assert.equal(p.supplyMonths, 3)
    assert.equal(p.title, 'Semaglutide Maintenance Pack')
    assert.equal(p.subtitle, '1 mg · 3 month supply')
  })

  test('titration ("Current GLP") programme: multi-dose ladder, concentration excluded', () => {
    // product_id 18: "3-mo, Current GLP, Semaglutide injection 2.5mg/ml, 0.5mg, 1mg, 1.5mg (5ml vial)"
    const p = normalizeProduct(byId('18'))
    assert.equal(p.molecule, 'Semaglutide')
    assert.equal(p.kind, 'titration')
    assert.equal(p.doseMg, null)
    assert.deepEqual(p.doseSchedule, [0.5, 1, 1.5])
    assert.equal(p.supplyMonths, 3)
    assert.equal(p.title, 'Semaglutide Titration Program')
    assert.equal(p.subtitle, '0.5 → 1 → 1.5 mg · 3 month supply')
  })

  test('product 17: bare "then Inject" escalation, no molecule named', () => {
    // "Inject 0.25mg (10 units) weekly for 4 weeks, then Inject 0.5mg (20
    // units) weekly for 4 weeks, then Inject 1.0mg (40 units) weekly for 4
    // weeks." — no "Semaglutide"/"Tirzepatide" token at all.
    const p = normalizeProduct(byId('17'))
    assert.equal(p.molecule, null)
    assert.equal(p.kind, 'titration') // "then ... Inject" escalation heuristic
    assert.equal(p.doseMg, null)
    assert.deepEqual(p.doseSchedule, [0.25, 0.5, 1])
    // 3 x "for 4 weeks" = 12 weeks = 3 months, not a raw "month supply" string.
    assert.equal(p.supplyMonths, 3)
    // Falls back to the generic "GLP-1" subject rather than dumping the
    // 150-character raw sentence into the title.
    assert.equal(p.title, 'GLP-1 Titration Program')
    assert.ok(p.title.length < 60, 'must not fall back to the raw 150-char sentence')
    assert.equal(p.subtitle, '0.25 → 0.5 → 1 mg · 3 month supply')
  })

  test('starter programme spanning a dose range', () => {
    // product_id 60: "Compounded Tirzepatide Starter Program (up to 15mg weekly dose)"
    const p = normalizeProduct(byId('60'))
    assert.equal(p.molecule, 'Tirzepatide')
    assert.equal(p.kind, 'starter')
    assert.equal(p.doseMg, null)
    assert.deepEqual(p.doseSchedule, [15])
    // No "month supply" text and no "for N weeks" text in this name, so this
    // is genuinely parsed as a 1-month supply by the current regexes — even
    // though the fixture prices it like the other 3-month programme products.
    // Asserting the code's actual behavior here, not the "business truth".
    assert.equal(p.supplyMonths, 1)
    assert.equal(p.title, 'Tirzepatide Starter Program')
    assert.equal(p.subtitle, 'up to 15 mg · 1 month supply')
  })
})

describe('normalizeProduct — robustness (must never throw)', () => {
  test('missing product_name', () => {
    const p = normalizeProduct(raw({ product_id: '901' }))
    assert.equal(p.rawName, '')
    assert.equal(p.molecule, null)
    assert.equal(p.title, '')
  })

  test('empty product_name', () => {
    const p = normalizeProduct(raw({ product_id: '902', product_name: '' }))
    assert.equal(p.rawName, '')
    assert.equal(p.molecule, null)
  })

  test('non-numeric product_price falls back to 0', () => {
    for (const bad of ['not-a-price', 'N/A', '', undefined, null]) {
      const p = normalizeProduct(
        raw({ product_id: '903', product_name: 'Compounded Semaglutide (1 mg/week)', product_price: bad as never })
      )
      assert.equal(p.price, 0)
      assert.equal(p.pricePerMonth, 0)
    }
  })

  test('numeric (not string) product_price is accepted', () => {
    const p = normalizeProduct(
      raw({ product_id: '904', product_name: 'x', product_price: 190 as unknown as string })
    )
    assert.equal(p.price, 190)
  })

  test('null product_img yields no images', () => {
    const p = normalizeProduct(raw({ product_id: '905', product_img: null as unknown as never[] }))
    assert.deepEqual(p.images, [])
  })

  test('product_img containing objects in every documented shape, plus junk', () => {
    const p = normalizeProduct(
      raw({
        product_id: '906',
        product_img: [
          'https://example.com/a.jpg',
          { image: 'https://example.com/b.jpg' },
          { product_img: 'https://example.com/c.jpg' },
          { img: 'https://example.com/d.jpg' },
          { url: 'https://example.com/e.jpg' },
          { image_url: 'https://example.com/f.jpg' },
          {}, // no recognised key
          { unrelated: 'nope' },
          null,
          undefined,
          42,
          '', // blank string entry
          '   ', // whitespace-only string entry
        ] as unknown as never[],
      })
    )
    assert.deepEqual(p.images, [
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
      'https://example.com/c.jpg',
      'https://example.com/d.jpg',
      'https://example.com/e.jpg',
      'https://example.com/f.jpg',
    ])
  })

  test('every fixture row normalizes without throwing', () => {
    assert.doesNotThrow(() => normalizeProducts(rawProducts))
  })
})

describe('dedupeVariants', () => {
  const normalized = normalizeProducts(rawProducts)

  test('collapses the real 60-row fixture to 51', () => {
    const deduped = dedupeVariants(normalized)
    assert.equal(normalized.length, 60)
    assert.equal(deduped.length, 51)
  })

  test('keeps Excel-preferred checkout IDs over lower duplicate IDs', () => {
    // Tirzepatide 2.5 mg exists under ids 7/50 (1M), 22/23/52 (6M), 28/29/53
    // (12M). juvenex.xlsx + required mapping use checkout ?id=50/52/53.
    const deduped = dedupeVariants(normalized)
    const tirz25 = deduped.filter(
      (p) => p.molecule === 'Tirzepatide' && p.kind === 'standard' && p.doseMg === 2.5
    )
    const bySupply = Object.fromEntries(tirz25.map((p) => [p.supplyMonths, p.id]))
    assert.equal(bySupply[1], '50')
    assert.equal(bySupply[3], '51')
    assert.equal(bySupply[6], '52')
    assert.equal(bySupply[12], '53')
  })

  test('keeps the lowest numeric ID when no preferred checkout id applies', () => {
    // Semaglutide 0.25 mg/week 1-month exists as id 1 and 46; Sheet1 prefers
    // ?id=1, which is also the lowest ID.
    const deduped = dedupeVariants(normalized)
    const survivors = deduped.filter(
      (p) =>
        p.molecule === 'Semaglutide' &&
        p.kind === 'standard' &&
        p.doseMg === 0.25 &&
        p.supplyMonths === 1
    )
    assert.equal(survivors.length, 1)
    assert.equal(survivors[0].id, '1')
  })

  test('Semaglutide required duration→dose checkout IDs', () => {
    const deduped = dedupeVariants(normalized)
    const sema05 = deduped.filter(
      (p) => p.molecule === 'Semaglutide' && p.kind === 'standard' && p.doseMg === 0.5
    )
    const bySupply05 = Object.fromEntries(sema05.map((p) => [p.supplyMonths, p.id]))
    assert.equal(bySupply05[1], '2')
    assert.equal(bySupply05[6], '35')
    assert.equal(bySupply05[12], '41')

    const sema025_3m = deduped.find(
      (p) =>
        p.molecule === 'Semaglutide' &&
        p.kind === 'standard' &&
        p.doseMg === 0.25 &&
        p.supplyMonths === 3
    )
    assert.ok(sema025_3m)
    assert.equal(sema025_3m!.id, '47')
    assert.equal(sema025_3m!.sku, 'SG-MAINT-S3-A')
  })

  test('never merges programme products that differ only in their dose ladder', () => {
    // product_ids 18-21 are all "3-mo, Current GLP, Semaglutide ..." — same
    // molecule/kind/supply, but each has a distinct dose ladder. A dedupe
    // that ignored the ladder would wrongly collapse these to one.
    const deduped = dedupeVariants(normalized)
    for (const id of ['18', '19', '20', '21']) {
      assert.ok(
        deduped.some((p) => p.id === id),
        `expected programme product ${id} to survive dedupe`
      )
    }
  })

  test('dedupe is idempotent', () => {
    const once = dedupeVariants(normalized)
    const twice = dedupeVariants(once)
    assert.equal(twice.length, once.length)
  })
})

describe('sortProducts', () => {
  const products: JxProduct[] = normalizeProducts([
    raw({ product_id: '10', product_name: 'Compounded Tirzepatide (2.5 mg/week)', product_price: '239.00' }),
    raw({ product_id: '11', product_name: 'Compounded Tirzepatide (5 mg/week)', product_price: '239.00' }), // same price as #10
    raw({ product_id: '12', product_name: 'Compounded Semaglutide (1 mg/week)', product_price: '190.00' }),
    raw({
      product_id: '13',
      product_name: 'Compounded Semaglutide (1 mg/week) - 6 month supply',
      product_price: '714.00', // 119/mo — cheaper per-month than the 1-mo product above (190/mo)
    }),
    raw({
      product_id: '14',
      product_name: '3-mo, Current GLP, Semaglutide injection 2.5mg/ml, 0.5mg, 1mg (5ml vial)',
      product_price: '399.00',
    }), // doseMg === null
  ])
  const allKeys: SortKey[] = ['featured', 'price-asc', 'price-desc', 'dose-asc', 'monthly-asc']
  test('every SortKey returns the same set of products (no drops/dupes)', () => {
    for (const key of allKeys) {
      const sorted = sortProducts(products, key)
      assert.equal(sorted.length, products.length)
      assert.deepEqual(
        [...sorted.map((p) => p.id)].sort(),
        [...products.map((p) => p.id)].sort(),
        `sort key ${key} changed the product set`
      )
    }
  })

  test('does not mutate the input array', () => {
    const before = products.map((p) => p.id)
    sortProducts(products, 'price-desc')
    assert.deepEqual(products.map((p) => p.id), before)
  })

  test('price-asc / price-desc', () => {
    const asc = sortProducts(products, 'price-asc').map((p) => p.price)
    const desc = sortProducts(products, 'price-desc').map((p) => p.price)
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b))
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a))
  })

  test('price-asc is stable for equal prices (#10 and #11 both 239)', () => {
    // #10 precedes #11 in the input; Array.prototype.sort is a stable sort
    // (guaranteed since ES2019 / V8), so equal-price entries must keep their
    // relative input order.
    const sorted = sortProducts(products, 'price-asc')
    const i10 = sorted.findIndex((p) => p.id === '10')
    const i11 = sorted.findIndex((p) => p.id === '11')
    assert.ok(i10 < i11, 'stable sort must preserve #10 before #11 at equal price')
  })

  test('monthly-asc ranks by pricePerMonth, not sticker price', () => {
    const sorted = sortProducts(products, 'monthly-asc')
    const i12 = sorted.findIndex((p) => p.id === '12') // $190 / 1mo = 190/mo
    const i13 = sorted.findIndex((p) => p.id === '13') // $714 / 6mo = 119/mo
    assert.ok(
      i13 < i12,
      '6-month pack ($119/mo) must rank ahead of the pricier-per-month 1-month product ($190/mo)'
    )
  })

  test('dose-asc: null doseMg sorts last', () => {
    const sorted = sortProducts(products, 'dose-asc')
    assert.equal(sorted[sorted.length - 1].id, '14') // the only null-dose product
    // and everything with a real dose is ascending
    const withDose = sorted.filter((p) => p.doseMg != null).map((p) => p.doseMg as number)
    assert.deepEqual(withDose, [...withDose].sort((a, b) => a - b))
  })

  test('featured: molecule (Tirzepatide first) > kind > dose > supply', () => {
    const sorted = sortProducts(products, 'featured')
    const molecules = sorted.map((p) => p.molecule)
    const firstSemaIdx = molecules.indexOf('Semaglutide')
    const lastTirzIdx = molecules.lastIndexOf('Tirzepatide')
    assert.ok(lastTirzIdx < firstSemaIdx, 'all Tirzepatide entries must precede all Semaglutide entries')
  })

  test('featured: null-dose programme product sorts after dosed standard products of its molecule', () => {
    const sorted = sortProducts(products, 'featured')
    const i12 = sorted.findIndex((p) => p.id === '12') // Semaglutide, standard, dose 1
    const i14 = sorted.findIndex((p) => p.id === '14') // Semaglutide, titration, dose null
    assert.ok(i12 < i14, 'standard dosed product must sort before the null-dose titration product')
  })
})

describe('filterProducts', () => {
  const products = normalizeProducts(rawProducts)

  test('multi-term query requires every term to match (AND, not OR)', () => {
    const results = filterProducts(products, { query: 'tirzepatide starter' })
    assert.ok(results.length > 0)
    for (const p of results) {
      assert.equal(p.molecule, 'Tirzepatide')
      assert.equal(p.kind, 'starter')
    }
    // Sanity: dropping either term must not produce the same narrow set.
    const tirzOnly = filterProducts(products, { query: 'tirzepatide' })
    assert.ok(tirzOnly.length > results.length)
  })

  test('query matches across rawName/title/subtitle/sku/category', () => {
    // SKU-only match: "TZ-STARTER-3M-A" doesn't appear in the display title.
    const bySku = filterProducts(products, { query: 'tz-starter-3m-a' })
    assert.ok(bySku.some((p) => p.sku === 'TZ-STARTER-3M-A'))
  })

  test('filters compose: query + molecule + supplyMonths + maxPrice narrow to an exact intersection', () => {
    const results = filterProducts(products, {
      query: '7.5',
      molecule: 'Tirzepatide',
      supplyMonths: 6,
      maxPrice: 1074,
    })
    assert.equal(results.length, 1)
    assert.equal(results[0].rawName, 'Compounded Tirzepatide (7.5 mg/week) - 6 month supply')
  })

  test('maxPrice excludes products strictly above the cap, keeps products at the cap', () => {
    const results = filterProducts(products, { maxPrice: 190 })
    assert.ok(results.length > 0)
    for (const p of results) assert.ok(p.price <= 190)
    assert.ok(results.some((p) => p.price === 190))
  })

  test('molecule filter alone excludes the other molecule entirely', () => {
    const results = filterProducts(products, { molecule: 'Semaglutide' })
    assert.ok(results.every((p) => p.molecule === 'Semaglutide'))
  })

  test('empty/whitespace query matches everything (no accidental empty-term filtering)', () => {
    assert.equal(filterProducts(products, { query: '' }).length, products.length)
    assert.equal(filterProducts(products, { query: '   ' }).length, products.length)
    assert.equal(filterProducts(products, {}).length, products.length)
  })
})

describe('pickRecommended', () => {
  const products = dedupeVariants(normalizeProducts(rawProducts))
  const picks = pickRecommended(products, 6)

  test('returns the requested limit (bounded by available dose lanes)', () => {
    assert.ok(picks.length > 0 && picks.length <= 6)
  })

  test('alternates molecules starting with Tirzepatide', () => {
    const molecules = picks.map((p) => p.molecule)
    // Tirzepatide is lane-ordered first (MOLECULE_ORDER), so with both lanes
    // populated the interleave must start Tirz, Sema, Tirz, Sema, ...
    assert.equal(molecules[0], 'Tirzepatide')
    assert.equal(molecules[1], 'Semaglutide')
  })

  test('never repeats a molecule+dose combination', () => {
    const keys = picks.map((p) => `${p.molecule}|${p.doseMg}`)
    assert.equal(new Set(keys).size, keys.length)
  })

  test('prefers the shortest supply available for each molecule+dose', () => {
    for (const pick of picks) {
      const cheapestSupply = Math.min(
        ...products
          .filter((p) => p.kind === 'standard' && p.molecule === pick.molecule && p.doseMg === pick.doseMg)
          .map((p) => p.supplyMonths)
      )
      assert.equal(pick.supplyMonths, cheapestSupply)
    }
  })

  test('only draws from standard (single-dose) products when any exist', () => {
    for (const pick of picks) {
      assert.equal(pick.kind, 'standard')
      assert.notEqual(pick.doseMg, null)
    }
  })

  test('falls back to the full pool when there are no standard products', () => {
    const onlyProgrammes = products.filter((p) => p.kind !== 'standard')
    assert.ok(onlyProgrammes.length > 0, 'fixture must contain non-standard products for this test to be meaningful')
    const fallbackPicks = pickRecommended(onlyProgrammes, 6)
    assert.ok(fallbackPicks.length > 0)
  })

  test('limit=0 returns an empty array without throwing', () => {
    assert.deepEqual(pickRecommended(products, 0), [])
  })
})

describe('formatUsd', () => {
  test('integer amounts render with no decimals', () => {
    assert.equal(formatUsd(190), '$190')
    assert.equal(formatUsd(0), '$0')
    assert.equal(formatUsd(1788), '$1,788')
  })

  test('fractional amounts render with exactly 2 decimals', () => {
    assert.equal(formatUsd(190.5), '$190.50')
    assert.equal(formatUsd(199.99), '$199.99')
  })
})
