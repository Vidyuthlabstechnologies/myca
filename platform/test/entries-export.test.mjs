import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createInvoice, createPurchase, recordReceipt } from '../src/invoice.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';

function books() {
  const state = createState();
  createInvoice(state, { id: 'INV-0001', date: '2026-08-28', partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });
  createInvoice(state, { id: 'INV-0002', date: '2026-09-05', partyName: '=HYPERLINK("x")', lines: [{ description: 'Silk, red', hsn: '5007', qty: 2, rate: 500, gstRate: 5 }] });
  recordReceipt(state, { invoiceId: 'INV-0001', amount: 1050, date: '2026-09-02', mode: 'cash' });
  createPurchase(state, { date: '2026-09-06', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey cloth', hsn: '5208', qty: 1, rate: 400, gstRate: 5 }] });
  return state;
}

test('the month export lists every entry by date with heads and tax, and only that month', async () => {
  const state = books();
  await runTool(state, 'post_expense', { narration: 'Shop rent', amount: 5000, date: '2026-09-01' });
  await runTool(state, 'create_credit_note', { invoiceId: 'INV-0002', amount: 105, date: '2026-09-08', reason: 'Short supply' });
  const out = await runTool(state, 'export_entries', { period: '2026-09' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const { csv, count, fileName } = out.data;
  assert.equal(fileName, 'entries_27AABCU9603R1ZN_2026-09.csv');
  assert.equal(count, 5);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'date,type,number,party,party_gstin,head,description,taxable,cgst,sgst,igst,total,paid_by,refers_to');
  assert.deepEqual(lines.slice(1).map((line) => line.split(',')[1]), ['Expense', 'Receipt', 'Sale', 'Purchase', 'Credit note']);
  assert.match(lines[1], /^2026-09-01,Expense,EXP-0001,,,Rent,Shop rent,5000,0,0,0,5000,bank,$/);
  assert.match(lines[2], /^2026-09-02,Receipt,,Retail Mart,27AAACH7409R1Z1,,,,,,,1050,cash,INV-0001$/);
  assert.match(lines[5], /,Credit note,CN-0001,.*,Sales,Short supply,-100,-2.5,-2.5,0,-105,,INV-0002$/);
  assert.equal(csv.includes('INV-0001,Retail Mart'), false, 'an August invoice stays out of September');
});

test('cells are escaped: commas quoted and formula-like text neutralised', async () => {
  const { csv } = (await runTool(books(), 'export_entries', { period: '2026-09' })).data;
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"Silk, red"/);
});

test('a bad period is refused, an empty month has only the header, and the tool is a remote read', async () => {
  const state = createState();
  assert.equal((await runTool(state, 'export_entries', { period: 'Sept' })).error, 'INVALID_PERIOD');
  const empty = (await runTool(state, 'export_entries', { period: '2026-01' })).data;
  assert.equal(empty.count, 0);
  assert.equal(empty.csv.split('\n').length, 1);
  assert.equal(isRemoteQuery('export_entries'), true);
});
