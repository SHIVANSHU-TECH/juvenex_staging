/**
 * Smoke tests for the generated storefront catalog (no tsx required).
 * Run: node --test src/lib/jx/storefront-catalog.test.mjs
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const src = readFileSync(path.join(root, 'storefront-catalog.generated.ts'), 'utf8')

function extractArray(name) {
  const marker = `export const ${name}`
  const start = src.indexOf(marker)
  assert.ok(start >= 0, `missing ${name}`)
  const eq = src.indexOf('=', start)
  const from = src.indexOf('[', eq)
  let depth = 0
  let end = -1
  for (let i = from; i < src.length; i++) {
    const ch = src[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  assert.ok(end > 0, `unclosed ${name}`)
  return JSON.parse(src.slice(from, end))
}

describe('storefront-catalog.generated', () => {
  const categories = extractArray('STOREFRONT_CATEGORIES')
  const products = extractArray('STOREFRONT_PRODUCTS')

  test('exposes 6 categories and 11 products', () => {
    assert.equal(categories.length, 6)
    assert.equal(products.length, 11)
  })

  test('category keys match KoverX overlap set', () => {
    assert.deepEqual(
      categories.map((c) => c.key),
      ['weight-loss', 'hrt', 'longevity', 'sexual-wellness', 'hair-skin', 'other']
    )
  })

  test('Semaglutide maps preferred Excel product ids', () => {
    const sema = products.find((p) => p.slug === 'semaglutide')
    assert.ok(sema)
    assert.deepEqual(
      sema.plans.map((p) => [p.sku, p.productId, p.dosage]),
      [
        ['SEMA-0.5MG-30-D', '2', '0.5 mg/week'],
        ['SG-MAINT-S3-A', '47', '0.25 mg/week'],
        ['SEMA-0.5MG-30-D-6M', '35', '0.5 mg/week'],
        ['SEMA-0.5MG-30-D-12M', '41', '0.5 mg/week'],
      ]
    )
  })

  test('Tirzepatide maps preferred Excel product ids', () => {
    const tirz = products.find((p) => p.slug === 'tirzepatide')
    assert.ok(tirz)
    assert.deepEqual(
      tirz.plans.map((p) => p.productId),
      ['50', '51', '52', '53']
    )
  })

  test('every plan has sku + productId + checkoutUrl with matching id', () => {
    for (const product of products) {
      const plans = [
        ...(product.plans ?? []),
        ...(product.medications ?? []).flatMap((m) => m.plans ?? []),
      ]
      assert.ok(plans.length > 0, `${product.slug} has no plans`)
      for (const plan of plans) {
        assert.ok(plan.sku, `${product.slug} missing sku`)
        assert.ok(plan.productId, `${product.slug} missing productId`)
        assert.match(
          plan.checkoutUrl,
          new RegExp(`[?&]id=${plan.productId}(?:&|$)`),
          `${product.slug} ${plan.sku} checkoutUrl mismatch`
        )
      }
    }
  })

  test('ED has 22 formulations', () => {
    const ed = products.find((p) => p.slug === 'erectile-dysfunction')
    assert.equal(ed?.medications?.length, 22)
  })
})
