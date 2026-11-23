import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE } from '../src/countries/uae/engine.mjs';

const ARABIC = /[؀-ۿ]/;

test('an Arabic corporate tax estimate with Small Business Relief elected has no English warning left', () => {
  const result = ENGINE.run.ae_ct_estimate({}, { periodStart: '2025-01-01', periodEnd: '2025-12-31', revenue: 900000, accountingProfit: 120000, electSmallBusinessRelief: true, lang: 'ar' });
  assert.equal(result.ok, true);
  assert.equal(result.data.relief, 'small-business-relief');
  assert.ok(result.data.warnings.length > 0);
  for (const warning of result.data.warnings) assert.match(warning, ARABIC, warning);
});
