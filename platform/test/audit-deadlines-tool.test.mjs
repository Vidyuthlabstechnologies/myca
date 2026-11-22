import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { registerClient } from '../src/ca-api.mjs';

function firm(name = 'Nalanda Textiles LLP') {
  const state = createState();
  state.company = { ...state.company, name, gstin: '27AAPFU0939F1ZV', state: '27', entityType: 'llp' };
  return state;
}

const find = (rows, id, type, period) => rows.find((d) => d.clientId === id && d.returnType === type && d.period === period);

test('H18: the deadlines tool uses the real firm profile and today, so a passed GSTR-3B shows overdue', async () => {
  const out = await runTool(firm(), 'deadlines', { asOfDate: '2026-09-22' });
  assert.equal(out.ok, true);
  assert.equal(out.data.asOfDate, '2026-09-22');
  const g3b = find(out.data.deadlines, 'SELF', 'GSTR-3B', '2026-08');
  assert.equal(g3b.dueDate, '2026-09-20');
  assert.equal(g3b.level, 'overdue');
  assert.equal(find(out.data.deadlines, 'SELF', 'GSTR-1', '2026-09').dueDate, '2026-10-11');
});

test('H18: registered clients get their own deadlines, with the state-wise QRMP GSTR-3B day', async () => {
  const state = firm();
  registerClient(state, { clientId: 'CL-7', name: 'Beta Traders', gstin: '29AAACF7856R1ZO', state: '29', gstFrequency: 'quarterly', turnover: 30000000 });
  registerClient(state, { clientId: 'CL-8', name: 'Delhi Mart', gstin: '07AAPCR2333B1ZM', state: '07', gstFrequency: 'quarterly', turnover: 1000000 });
  const out = await runTool(state, 'deadlines', { asOfDate: '2026-09-22' });
  assert.equal(find(out.data.deadlines, 'CL-7', 'GSTR-3B', 'Q2 2026-27').dueDate, '2026-10-22', 'Karnataka is in the 22nd group');
  assert.equal(find(out.data.deadlines, 'CL-8', 'GSTR-3B', 'Q2 2026-27').dueDate, '2026-10-24', 'Delhi is in the 24th group');
  assert.equal(find(out.data.deadlines, 'CL-7', 'PMT-06', '2026-08').dueDate, '2026-09-25');
});

test('H18: without asOfDate the tool uses the local date, not a hard-coded one', async () => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const out = await runTool(firm(), 'deadlines', {});
  assert.equal(out.data.asOfDate, today);
  assert.notEqual(out.data.asOfDate, '2026-09-07');
});

test('H18: a comma or formula character in a name cannot corrupt the generated client CSV', async () => {
  const out = await runTool(firm('=Sharma, Rao & Co'), 'deadlines', { asOfDate: '2026-09-22' });
  assert.equal(out.ok, true);
  assert.equal(out.data.errors.length, 0, JSON.stringify(out.data.errors));
  assert.ok(find(out.data.deadlines, 'SELF', 'GSTR-3B', '2026-08'));
});

test('the deadlines tool refuses a month that is not a month, instead of looping on it', async () => {
  for (const months of [['INV-0001'], ['2026-13'], ['2026-04', 'next month'], [], ['0001-01'], ['2026-04', '9999-12']]) {
    const out = await runTool(firm(), 'deadlines', { asOfDate: '2026-09-22', months });
    assert.equal(out.ok, false, JSON.stringify(months));
    assert.match(out.error, /month/i);
  }
  const many = Array.from({ length: 61 }, (_, i) => `20${String(22 + Math.floor(i / 12)).padStart(2, '0')}-${String((i % 12) + 1).padStart(2, '0')}`);
  assert.equal((await runTool(firm(), 'deadlines', { asOfDate: '2026-09-22', months: many })).ok, false);
  const asked = await runTool(firm(), 'deadlines', { asOfDate: '2026-09-22', months: ['2026-10', '2026-10', '2026-11'] });
  assert.equal(asked.ok, true);
  assert.ok(asked.data.deadlines.length > 0);
  assert.ok(asked.data.deadlines.every((row) => ['2026-10', '2026-11'].includes(row.dueDate.slice(0, 7))));
});

test('the deadline list itself drops a month that is not a month', async () => {
  const { listDeadlines } = await import('../../sprints/sprint-4-deadlines/src/deadlines.mjs');
  const clients = [{ clientId: 'SELF', name: 'Nalanda', entity: 'llp', turnover: 5000000, gst: 'TRUE' }];
  assert.deepEqual(listDeadlines({ clients, months: ['INV-0001', 'NaN-NaN', ''] }), []);
  const mixed = listDeadlines({ clients, months: ['INV-0001', '2026-10'] });
  assert.ok(mixed.length > 0);
  assert.ok(mixed.every((row) => row.dueDate.startsWith('2026-10')));
});
