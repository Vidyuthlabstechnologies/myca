import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runGolden } from '../../statutory-rules/src/index.mjs';
import { computeIncomeTax } from '../src/income-tax.mjs';

const GOLDEN = fileURLToPath(new URL('../../statutory-rules/golden/income-tax.json', import.meta.url));

test('H1: every golden income-tax case matches to the paisa (slabs, 87A with marginal relief, surcharge relief, cess, rounding)', async () => {
  const report = await runGolden(GOLDEN, (input) => computeIncomeTax(input));
  assert.equal(report.ok, true, JSON.stringify(report.failures.slice(0, 3), null, 1));
  assert.equal(report.total, 65);
});

test('H1: salaried Rs 12,75,000 pays nothing in FY 2025-26; Rs 13,00,000 pays Rs 26,000 after marginal relief', () => {
  const base = { fy: '2025-26', regime: 'new', ageBand: 'below-60', residentIndividual: true, otherIncomePaise: 0, claims: {} };
  assert.equal(computeIncomeTax({ ...base, salaryPaise: 127500000 }).taxPayablePaise, 0);
  assert.equal(computeIncomeTax({ ...base, salaryPaise: 130000000 }).taxPayablePaise, 2600000);
});

test('H1: a financial year outside the rule book fails closed instead of reusing another year', () => {
  const out = computeIncomeTax({ fy: '2027-28', regime: 'new', salaryPaise: 100000000, claims: {} });
  assert.equal(out.error, 'RULE_NOT_IN_FORCE');
  assert.equal(computeIncomeTax({ fy: 'soon', regime: 'new' }).error, 'FY_INVALID');
});
