import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runGolden } from '../../statutory-rules/src/index.mjs';
import { dueDateFor, quarterMonthIndex } from '../src/due-dates.mjs';

const GOLDEN = fileURLToPath(new URL('../../statutory-rules/golden/deadlines.json', import.meta.url));

test('H2: every golden due date resolves exactly, with no weekend or holiday rollover', async () => {
  const report = await runGolden(GOLDEN, (input) => dueDateFor(input));
  assert.equal(report.ok, true, JSON.stringify(report.failures, null, 1));
  assert.equal(report.total, 118);
});

test('H2: a due date that falls on a weekend stays on that day', () => {
  assert.equal(dueDateFor({ rule: 'due-date.income-tax.return.audit', periodEnd: '2026-03-31' }).dueDate, '2026-10-31');
  assert.equal(new Date('2026-10-31T00:00:00Z').getUTCDay(), 6);
  assert.equal(dueDateFor({ rule: 'due-date.gst.gstr-1.monthly', periodEnd: '2026-09-30' }).dueDate, '2026-10-11');
  assert.equal(new Date('2026-10-11T00:00:00Z').getUTCDay(), 0);
});

test('due dates fail closed on a malformed period end instead of guessing', () => {
  assert.equal(dueDateFor({ rule: 'due-date.gst.gstr-1.monthly', periodEnd: '2026-09-15' }).error, 'PERIOD_END_INVALID');
  assert.equal(dueDateFor({ rule: 'due-date.gst.gstr-1.quarterly', periodEnd: '2026-08-31' }).error, 'PERIOD_END_INVALID');
  assert.equal(dueDateFor({ rule: 'due-date.nope', periodEnd: '2026-08-31' }).error, 'RULE_UNKNOWN');
});

test('quarter month index follows the April-March financial year', () => {
  assert.deepEqual([4, 5, 6, 7, 1, 2, 3].map(quarterMonthIndex), [1, 2, 3, 1, 1, 2, 3]);
});
