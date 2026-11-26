import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { itcLimitNote, itcTimeLimit, reviewOf } from '../src/gst-review.mjs';
import { rule } from '../../sprints/statutory-rules/src/index.mjs';

const state = () => {
  const books = createState();
  books.company = { ...books.company, name: 'Suresh Traders', gstin: '24AABCU9603R1ZX', state: '24' };
  return books;
};

test('the rule is dated and cites section 16(4)', () => {
  const found = rule('gst.itc.time-limit', '2026-11-27');
  assert.equal(found.ok, true);
  assert.deepEqual([found.value.month, found.value.day, found.value.orAnnualReturnIfEarlier], [11, 30, true]);
  assert.equal(rule('gst.itc.time-limit', '2022-09-30').ok, false);
});

test('credit on bills of FY 2025-26 closes on 30 November 2026, whatever month of that year it is', () => {
  for (const period of ['2025-04', '2025-12', '2026-03']) {
    const limit = itcTimeLimit(state(), period, '24AABCU9603R1ZX', '2026-11-27');
    assert.equal(limit.last, '2026-11-30', period);
    assert.equal(limit.daysLeft, 3, period);
    assert.equal(limit.passed, false, period);
  }
  assert.equal(itcTimeLimit(state(), '2026-04', '24AABCU9603R1ZX', '2026-11-27').last, '2027-11-30');
});

test('the date has passed the day after, and a filed annual return closes it earlier', () => {
  assert.equal(itcTimeLimit(state(), '2026-03', '24AABCU9603R1ZX', '2026-12-01').passed, true);
  assert.equal(itcTimeLimit(state(), '2026-03', '24AABCU9603R1ZX', '2026-11-30').passed, false);
  const books = state();
  books.filings = [{ returnType: 'GSTR-9', period: '2025-26', gstin: '24AABCU9603R1ZX', filedOn: '2026-10-15', status: 'filed' }];
  const limit = itcTimeLimit(books, '2025-08', '24AABCU9603R1ZX', '2026-11-01');
  assert.ok(limit.last <= '2026-11-30');
});

test('the warning says what to do, only when there is credit, and only when it matters', () => {
  const soon = { last: '2026-11-30', daysLeft: 3, passed: false, why: '30 November 2026, after the year of the supply' };
  assert.match(itcLimitNote(soon, 5000), /claim this credit by 30 November 2026/);
  assert.match(itcLimitNote(soon, 5000), /in 3 days/);
  assert.equal(itcLimitNote(soon, 0), '');
  assert.match(itcLimitNote({ ...soon, daysLeft: 0 }, 1), /today/);
  assert.match(itcLimitNote({ ...soon, daysLeft: 1 }, 1), /tomorrow/);
  const gone = { ...soon, daysLeft: -4, passed: true };
  assert.match(itcLimitNote(gone, 5000), /has passed/);
  assert.match(itcLimitNote(gone, 5000), /Check with your CA/);
  assert.equal(itcLimitNote({ ...soon, daysLeft: 200 }, 5000), '');
});

test('the review of a month carries the limit and warns on the credit step once it is late', async () => {
  const books = state();
  const review = reviewOf(books, '2025-08', '24AABCU9603R1ZX');
  assert.equal(review.ok, true);
  assert.equal(review.data.itcLimit.last, '2026-11-30');
  const credit = review.data.steps.find((step) => step.id === 'credit');
  assert.doesNotMatch(credit.note, /Time limit/, 'no credit, so no warning');
});

test('a month with real credit and a cut-off long gone is marked time-barred with a plain warning', async () => {
  const books = state();
  const bought = await runTool(books, 'create_purchase', { id: 'OLD-1', date: '2024-08-10', partyName: 'Patel Mills', partyGstin: '24AAACP1234F1Z5', lines: [{ description: 'Cloth', qty: 10, rate: 1000, gstRate: 5 }] });
  assert.equal(bought.ok, true, JSON.stringify(bought));
  const review = reviewOf(books, '2024-08', '24AABCU9603R1ZX');
  const credit = review.data.steps.find((step) => step.id === 'credit');
  assert.equal(review.data.itcLimit.passed, true);
  assert.equal(credit.timeBarred, true);
  assert.match(credit.note, /30 November 2025/);
  assert.match(credit.note, /may be disallowed/);
  assert.match(credit.note, /GSTR-2B/, 'the existing 2B note is kept');
});
