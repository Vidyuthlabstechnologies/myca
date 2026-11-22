import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040 } from '../src/us-1040.mjs';

const child = (dateOfBirth, more = {}) => ({ firstName: 'Kai', lastName: 'Lee', dateOfBirth, canBeClaimedAsDependent: true, ...more });
const dividends = (amount) => ({ kind: '1099-DIV', payer: 'Fund', fields: { ordinaryDividends: amount, qualifiedDividends: 0 } });
const wages = (amount) => ({ kind: 'W-2', payer: 'Shop', fields: { wages: amount, federalWithheld: 0, socialSecurityWages: amount, socialSecurityTax: amount * 0.062, medicareWages: amount, medicareTax: amount * 0.0145 } });
const run = (taxpayer, forms, year = '2025') => computeForm1040({ filingStatus: 'single', taxpayer, forms }, year);
const found = (out, code) => out.data.checks.find((item) => item.code === code);

test('Form 8615 instructions: a child under 18 with unearned income over $2,700 owes the kiddie tax, so the return is flagged as incomplete', () => {
  const out = run(child('2012-01-01'), [dividends(10000)]);
  const item = found(out, 'FORM_8615_REQUIRED');
  assert.ok(item, 'kiddie tax must be flagged');
  assert.equal(item.level, 'error');
  assert.ok(out.data.unsupported.some((row) => row.form === '8615' && row.required));
});

test('Form 8615: unearned income of $2,700 or less, earned income only, or a child of 24 is not flagged', () => {
  assert.equal(found(run(child('2012-01-01'), [dividends(2700)]), 'FORM_8615_REQUIRED'), undefined);
  assert.equal(found(run(child('2012-01-01'), [wages(20000)]), 'FORM_8615_REQUIRED'), undefined);
  assert.equal(found(run(child('2000-01-01'), [dividends(10000)]), 'FORM_8615_REQUIRED'), undefined);
});

test('Form 8615: a child born on January 1, 2008 is 18 at the end of 2025, so it applies only if earned income is not more than half of support', () => {
  const out = run(child('2008-01-01'), [dividends(10000)]);
  assert.equal(found(out, 'FORM_8615_REQUIRED'), undefined);
  assert.equal(found(out, 'FORM_8615_MAY_APPLY').level, 'warning');
  const under = run(child('2008-01-02'), [dividends(10000)]);
  assert.equal(found(under, 'FORM_8615_REQUIRED').level, 'error');
});

test('Form 8615 for 2026 uses the same $2,700 threshold (twice the $1,350 dependent standard deduction)', () => {
  assert.ok(found(run(child('2013-05-05'), [dividends(2701)], '2026'), 'FORM_8615_REQUIRED'));
  assert.equal(found(run(child('2013-05-05'), [dividends(2700)], '2026'), 'FORM_8615_REQUIRED'), undefined);
});
