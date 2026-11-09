import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from '../src/index.mjs';

test('presumptive business income: 8% and 6% with the two crore and three crore limits, under both Acts', () => {
  for (const [onDate, act] of [['2024-04-01', 'IT-1961'], ['2025-04-01', 'IT-1961'], ['2026-04-01', 'IT-2025']]) {
    const found = rule('income-tax.presumptive.business', onDate);
    assert.equal(found.ok, true, onDate);
    assert.equal(found.record.act, act);
    assert.equal(found.value.otherReceiptsRatePercent, 8);
    assert.equal(found.value.digitalReceiptsRatePercent, 6);
    assert.equal(found.value.turnoverCapPaise, 2000000000);
    assert.equal(found.value.lowCash.turnoverCapPaise, 3000000000);
    assert.equal(found.value.lowCash.cashReceiptsMaxPercent, 5);
  }
  assert.equal(rule('income-tax.presumptive.business', '2023-03-31').error, 'RULE_NOT_IN_FORCE');
});

test('presumptive professional income: 50% with the fifty lakh and seventy-five lakh limits', () => {
  const found = rule('income-tax.presumptive.profession', '2026-04-01');
  assert.equal(found.ok, true);
  assert.equal(found.record.section, '58(2) Table Sl. No. 3');
  assert.equal(found.value.ratePercent, 50);
  assert.equal(found.value.grossReceiptsCapPaise, 500000000);
  assert.equal(found.value.lowCash.grossReceiptsCapPaise, 750000000);
});
