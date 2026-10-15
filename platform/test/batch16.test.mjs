import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { fyCodeOf } from '../src/invoice.mjs';
import { openSession } from '../src/session.mjs';
import { createMemoryBooksStore, createMemoryDocumentStore } from '../src/store-ports.mjs';

const SALE = (date) => ({ partyName: 'Kiran Stores', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 10000, gstRate: 18 }], date });

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

test('invoices can be numbered per financial year: INV-<fy><0001>, one series each year, old numbers kept, and back again', async () => {
  const state = books();
  const first = await runTool(state, 'create_invoice', SALE('2026-09-01'));
  assert.equal(first.invoice.id, 'INV-0001');
  assert.equal(fyCodeOf('2026-09-01'), '2627');
  assert.equal(fyCodeOf('2027-03-31'), '2627');
  assert.equal(fyCodeOf('2027-04-01'), '2728');
  const said = await chat(state, 'number invoices per financial year');
  assert.match(said.reply, /numbered per financial year/);
  assert.equal(state.company.invoiceNumbering, 'yearly');
  const a = await runTool(state, 'create_invoice', SALE('2026-10-02'));
  const b = await runTool(state, 'create_invoice', SALE('2026-10-03'));
  const next = await runTool(state, 'create_invoice', SALE('2027-04-05'));
  assert.deepEqual([a.invoice.id, b.invoice.id, next.invoice.id], ['INV-26270001', 'INV-26270002', 'INV-27280001']);
  assert.deepEqual(state.invoiceSeqByFy, { 2627: 2, 2728: 1 });
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.deepEqual(copy.invoiceSeqByFy, { 2627: 2, 2728: 1 });
  const printed = await runTool(state, 'print_invoice', { id: 'INV-26270001' });
  assert.equal(printed.ok, true, JSON.stringify(printed).slice(0, 200));
  const back = await chat(state, 'use a continuous invoice series');
  assert.match(back.reply, /one series/);
  const again = await runTool(state, 'create_invoice', SALE('2027-04-06'));
  assert.equal(again.invoice.id, 'INV-0002', 'the continuous series resumes where it left off');
  const bad = await runTool(state, 'set_invoice_numbering', { mode: 'monthly' });
  assert.equal(bad.error, 'BAD_NUMBERING');
});

test('a hosted export (books + documents) restores on the Windows app session', async () => {
  const source = books();
  await runTool(source, 'create_invoice', SALE('2026-09-01'));
  const exportLike = { version: 1, exportedAt: '2026-10-15T10:00:00.000Z', books: JSON.parse(JSON.stringify(serialize(source))), documents: {} };
  const books2 = createMemoryBooksStore({ text: JSON.stringify(serialize(books())), version: 0 });
  const session = openSession({ books: books2, documents: createMemoryDocumentStore([]), path: '' }, { seed: false });
  const payload = exportLike.books && !exportLike.state ? { ...exportLike, state: exportLike.books } : exportLike;
  const restored = await session.restore({ ...payload, confirm: true });
  assert.equal(restored.ok, true, JSON.stringify(restored));
  assert.equal(restored.restored.invoices, 1);
  assert.equal(session.state.invoices[0].partyName, 'Kiran Stores');
});
