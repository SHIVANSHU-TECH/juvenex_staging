// Runnable test harness for src/lib/phi-sanitizer.ts.
// Usage: npx tsx scripts/test-phi-sanitizer.mjs
//        (or) node --experimental-strip-types scripts/test-phi-sanitizer.mjs
//
// No test framework is configured in this repo — these are plain asserts.

import assert from 'node:assert/strict'
import { deidentifyText, deidentifyProfile, deidentifyMessage, tokenizeUserId } from '../src/lib/phi-sanitizer.ts'

function ok(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (err) {
    console.error(`  FAIL ${name}:`, err.message)
    process.exitCode = 1
  }
}

console.log('phi-sanitizer')

ok('email is redacted', () => {
  const out = deidentifyText('Contact me at jane.doe@example.com today.')
  assert.ok(out.includes('[EMAIL_REDACTED]'))
  assert.ok(!out.includes('jane.doe@example.com'))
})

ok('phone (US parens) is redacted', () => {
  assert.ok(deidentifyText('Call (212) 555-1234 now').includes('[PHONE_REDACTED]'))
})

ok('phone (dashes) is redacted', () => {
  assert.ok(deidentifyText('Call 212-555-1234 now').includes('[PHONE_REDACTED]'))
})

ok('phone (international) is redacted', () => {
  assert.ok(deidentifyText('+1 415 555 0123').includes('[PHONE_REDACTED]'))
})

ok('SSN is redacted', () => {
  const out = deidentifyText('SSN 123-45-6789 here')
  assert.ok(out.includes('[SSN_REDACTED]'))
  assert.ok(!out.includes('123-45-6789'))
})

ok('ISO date is redacted', () => {
  assert.ok(deidentifyText('DOB 1985-03-14').includes('[DATE_REDACTED]'))
})

ok('US slash date is redacted', () => {
  assert.ok(deidentifyText('appt 03/14/1985').includes('[DATE_REDACTED]'))
})

ok('month name date is redacted', () => {
  assert.ok(deidentifyText('born January 5, 1985').includes('[DATE_REDACTED]'))
})

ok('URL is redacted', () => {
  assert.ok(deidentifyText('see https://mychart.example.com/p/abc').includes('[URL_REDACTED]'))
})

ok('IPv4 is redacted', () => {
  assert.ok(deidentifyText('from 192.168.1.12').includes('[IP_REDACTED]'))
})

ok('street address is redacted', () => {
  assert.ok(deidentifyText('lives at 123 Main Street apt 5').includes('[ADDRESS_REDACTED]'))
})

ok('zip code is redacted', () => {
  assert.ok(deidentifyText('zip 10001').includes('[ZIP_REDACTED]'))
})

ok('long digit sequence is redacted', () => {
  assert.ok(deidentifyText('MRN 1234567890123').includes('[ID_REDACTED]'))
})

ok('safe clinical content is preserved', () => {
  const out = deidentifyText(
    'I weigh 185 lbs, take tirzepatide 7.5mg weekly, and had grilled chicken for lunch.'
  )
  assert.ok(out.includes('185'))
  assert.ok(out.includes('tirzepatide'))
  assert.ok(out.includes('grilled chicken'))
  assert.equal(out.includes('[EMAIL_REDACTED]'), false)
  assert.equal(out.includes('[PHONE_REDACTED]'), false)
})

ok('tokenizeUserId stable and distinct', () => {
  process.env.JWT_SECRET = 'test-secret-value-test-secret-value'
  const a = tokenizeUserId('user-uuid-1')
  const b = tokenizeUserId('user-uuid-1')
  const c = tokenizeUserId('user-uuid-2')
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.ok(a.startsWith('anon_'))
  assert.equal(a.length, 5 + 8)
})

ok('deidentifyProfile strips identifiers and keeps clinical facts', () => {
  const out = deidentifyProfile({
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '212-555-1234',
    zip: '10001',
    ssn: '123-45-6789',
    mrn: 'MRN-987',
    clinic_name: 'Acme Clinic',
    provider_name: 'Dr. Smith',
    user_id: 'user-uuid-1',
    dob: '1985-03-14',
    current_weight: 185,
    medications: ['tirzepatide 7.5mg'],
    allergies: ['shellfish'],
    diet_type: 'mediterranean',
    primary_goal: 'weight_loss',
  })
  assert.equal('name' in out, false)
  assert.equal('email' in out, false)
  assert.equal('phone' in out, false)
  assert.equal('mrn' in out, false)
  assert.equal('clinic_name' in out, false)
  assert.ok(out.patient_token?.startsWith('anon_'))
  assert.equal(out.current_weight, 185)
  assert.deepEqual(out.medications, ['tirzepatide 7.5mg'])
  assert.equal(out.diet_type, 'mediterranean')
  // age is derived from dob (1985-03-14) and capped at 90 — just sanity check
  assert.ok(typeof out.age === 'number' && out.age > 30 && out.age < 90)
})

ok('deidentifyProfile caps age at 90 for Safe Harbor', () => {
  const out = deidentifyProfile({ age: 95 })
  assert.equal(out.age, 90)
})

ok('deidentifyMessage sanitizes content', () => {
  const out = deidentifyMessage({ role: 'user', content: 'email me at x@y.com' })
  assert.equal(out.role, 'user')
  assert.ok(out.content.includes('[EMAIL_REDACTED]'))
})

if (process.exitCode) {
  console.error('\nSOME TESTS FAILED')
} else {
  console.log('\nALL TESTS PASSED')
}
