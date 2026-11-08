import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-reports-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { setModelTransport } from '../src/model-adapter.mjs';
import { createMemoryDocumentStore } from '../src/store-ports.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { rangeOf, runReportSpec } from '../src/reports.mjs';
import { matchDocument } from '../src/receipt-match.mjs';
import { readDocumentWords } from '../src/document-reader.mjs';
import { localToday } from '../src/dates.mjs';

const TODAY = localToday();
function shift(days) {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}
const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu_1', name, input }] });
afterEach(() => setModelTransport(null));

test('report periods are Indian financial years and calendar quarters', () => {
  assert.deepEqual(rangeOf('this-month', '2026-10-19'), { label: '2026-10', from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(rangeOf('last-month', '2026-01-10'), { label: '2025-12', from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(rangeOf('this-quarter', '2026-11-02'), { label: '2026-10 to 2026-12', from: '2026-10-01', to: '2026-12-31' });
  assert.deepEqual(rangeOf('this-year', '2026-02-14'), { label: 'FY 2025-26', from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(rangeOf('last-year', '2026-10-19'), { label: 'FY 2025-26', from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(rangeOf('2026-02', '2026-10-19'), { label: '2026-02', from: '2026-02-01', to: '2026-02-28' });
});

test('a report is saved by name from a sentence, previewed, run again later, listed and deleted', async () => {
  const state = books();
  const sale = (party, date, rate) => runTool(state, 'create_invoice', { partyName: party, lines: [{ description: 'Cloth', qty: 1, rate, gstRate: 5 }], date });
  await sale('Arjun Stores', TODAY, 40000);
  await sale('Bela Traders', TODAY, 10000);
  await sale('Arjun Stores', shift(-45), 25000);
  await sale('Bela Traders', shift(-75), 5000);

  const saved = await chat(state, 'save report Top customers: sales by customer this month vs last month');
  assert.equal(saved.awaitingConfirmation, undefined, 'a report definition is not a posting');
  assert.match(saved.reply, /Saved "Top customers"\. Say "run report Top customers" any time\./, saved.reply);
  assert.match(saved.reply, /Sales by customer .*: ₹50,000\.00/, saved.reply);
  assert.match(saved.reply, /· Arjun Stores: ₹40,000\.00/);
  assert.equal(Object.keys(state.reports).length, 1);

  const thisMonth = TODAY.slice(0, 7);
  const monthStart = new Date(`${thisMonth}-01T00:00:00Z`);
  monthStart.setUTCMonth(monthStart.getUTCMonth() - 1);
  const lastMonth = monthStart.toISOString().slice(0, 7);
  const lastMonthSale = shift(-45).slice(0, 7) === lastMonth ? 25000 : 0;
  const spec = runReportSpec(state, state.reports['top customers']);
  assert.equal(spec.total, 50000);
  assert.equal(spec.compare.rows.find((r) => r.label === 'Arjun Stores').before, lastMonthSale);

  await sale('Chitra & Co', TODAY, 1000);
  const run = await chat(state, 'run report Top customers');
  assert.match(run.reply, /^Top customers: Sales by customer .*: ₹51,000\.00/, run.reply);
  assert.match(run.reply, /· Chitra & Co: ₹1,000\.00 \(was ₹0\.00\)/);

  const list = await chat(state, 'my reports');
  assert.match(list.reply, /· Top customers: sales by customer, this-month, compared with the period before/, list.reply);

  const missing = await chat(state, 'run report Nothing here');
  assert.match(missing.reply, /no saved report called Nothing here; you have Top customers/, missing.reply);
  const vague = await chat(state, 'save report Mystery: everything');
  assert.match(vague.reply, /Say what the report is of/, vague.reply);
  assert.equal(vague.awaitingConfirmation, undefined);

  const owed = await runTool(state, 'save_report', { name: 'Who owes', metric: 'owed', groupBy: 'customer', compare: true });
  assert.equal(owed.ok, true, JSON.stringify(owed));
  assert.equal(owed.result.compare, null, 'a balance has no earlier period');
  assert.equal(owed.result.total, 85050);
  assert.equal(owed.result.range.label, `as of ${TODAY}`);
  const bad = await runTool(state, 'save_report', { name: 'Bad', metric: 'profit' });
  assert.equal(bad.error, 'BAD_METRIC');

  const gone = await chat(state, 'delete report Who owes');
  assert.match(gone.reply, /Deleted the saved report "Who owes"/, gone.reply);
  assert.equal(Object.keys(state.reports).length, 1);
  assert.equal(isRemoteQuery('run_report'), true);
  assert.equal(isRemoteQuery('list_reports'), true);
  assert.equal(isRemoteQuery('save_report'), false);
});

test('a photographed receipt that matches an expense already posted is offered as an attachment instead of a second posting', async () => {
  const state = books();
  const documents = createMemoryDocumentStore();
  state._documents = documents;
  await runTool(state, 'post_expense', { description: 'Diesel', payee: 'HP Petrol Pump', amount: 2500, date: shift(-2), mode: 'bank' });
  await runTool(state, 'post_expense', { description: 'Diesel', payee: 'HP Petrol Pump', amount: 2500, date: shift(-40), mode: 'bank' });
  await runTool(state, 'post_expense', { description: 'Tea', payee: 'Canteen', amount: 2500.8, date: shift(-1), mode: 'bank' });
  const expense = state.expenses[0];

  assert.deepEqual(matchDocument(state, { total: 2500.3, date: TODAY, partyName: 'hp petrol pump' }).map((m) => m.id), [expense.id, 'EXP-0003'], 'within fifty paise and three days, the same party first');
  assert.deepEqual(matchDocument(state, { total: 2500, date: shift(-10) }), []);

  const image = `data:image/jpeg;base64,${Buffer.from('a receipt photo').toString('base64')}`;
  const { sha256 } = documents.put(image);
  state.pendingFile = { kind: 'receipt', name: 'receipt.jpg', sha256 };
  setModelTransport(async () => ({ ok: true, response: toolUse('supplier_bill', { supplierName: 'HP Petrol Pump', invoiceNo: '7781', date: shift(-2), lines: [{ description: 'Diesel', qty: 1, rate: 2500 }], total: 2500, confidence: 0.9 }) }));
  const read = await runTool(state, 'read_document', { documentSha256: sha256 });
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.equal(read.data.matches[0].id, expense.id);
  const words = readDocumentWords(read.data);
  assert.match(words, new RegExp(`This looks like expense ${expense.id} already in the books: ₹2,500\\.00 to HP Petrol Pump on ${shift(-2)}, the same day\\. Say "attach it to ${expense.id}"`), words);

  const held = await chat(state, `attach it to ${expense.id}`);
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, new RegExp(`Keep the document with expense ${expense.id} \\(HP Petrol Pump, ₹2,500\\.00 on `), held.reply);
  assert.match(held.reply, /Nothing is posted/);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, new RegExp(`The document is kept with expense ${expense.id}\\. Nothing was posted\\.`), done.reply);
  assert.equal(state.expenses[0].documentSha256, sha256);
  assert.equal(state.expenses.length, 3, 'no second expense');
  assert.deepEqual(matchDocument(state, { total: 2500, date: shift(-2) }).map((m) => m.id), [], 'an entry with its document no longer matches');

  const again = await runTool(state, 'attach_document', { documentSha256: sha256, id: 'EXP-9999' });
  assert.equal(again.error, 'ENTRY_NOT_FOUND');
  const unknownDoc = await runTool(state, 'attach_document', { documentSha256: 'a'.repeat(64), id: expense.id });
  assert.equal(unknownDoc.error, 'DOCUMENT_NOT_FOUND');
  state.pendingFile = null;
  const nothing = await chat(state, `attach it to ${expense.id}`);
  assert.match(nothing.reply, /Read or attach the document first/, nothing.reply);
});
