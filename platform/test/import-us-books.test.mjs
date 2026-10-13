import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { parseUsInvoicesCsv, usDate } from '../src/import-us-books.mjs';

const XERO = `InvoiceNumber,ContactName,InvoiceDate,DueDate,Description,Quantity,UnitAmount,LineAmount,TaxType,TaxAmount,Total
INV-X-1,Cafe Luna,10/02/2026,11/01/2026,Wedding cake,1,500.00,500.00,TX-AUSTIN,41.25,541.25
INV-X-1,Cafe Luna,10/02/2026,11/01/2026,Delivery,1,40.00,40.00,Tax Exempt,0.00,541.25
INV-X-2,Church Bazaar,10/03/2026,,Cookies,100,2.00,200.00,Tax Exempt,0.00,200.00
INV-X-3,LA Buyer,10/04/2026,,Cake,1,100.00,100.00,CA,7.25,107.25
INV-X-4,Hill Country Deli,10/05/2026,,Pies,10,20.00,200.00,TX,13.00,213.00
`;

const QUICKBOOKS = `Date,Num,Customer,Product/Service,Memo/Description,Qty,Sales Price,Amount,Tax Amount
10/06/2026,1007,Hill Country Deli,Pies,Assorted pies,10,20.00,200.00,12.50
10/06/2026,1007,Hill Country Deli,Delivery,,1,15.00,15.00,0.00
`;

async function bakery() {
  const state = createState();
  state.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', address: '12 Maple St' };
  await runTool(state, 'set_sales_tax_rate', { code: 'TX-AUSTIN', name: 'Austin, Texas', ratePercent: 8.25, from: '2026-01-01' });
  await runTool(state, 'set_sales_tax_rate', { code: 'TX', name: 'Texas', ratePercent: 6.25, from: '2026-01-01' });
  return state;
}

test('dates and headers from Xero and QuickBooks are read, with the US month-first form', () => {
  assert.equal(usDate('10/02/2026'), '2026-10-02');
  assert.equal(usDate('2026-10-02'), '2026-10-02');
  assert.equal(usDate('Oct 2, 2026'), '2026-10-02');
  assert.equal(usDate('2 Oct 2026'), '2026-10-02');
  const xero = parseUsInvoicesCsv(XERO);
  assert.equal(xero.meta.source, 'xero');
  assert.equal(xero.invoices.length, 4);
  assert.equal(xero.invoices[0].taxJurisdiction, 'TX-AUSTIN');
  assert.equal(xero.invoices[0].fileTax, 41.25);
  assert.deepEqual(xero.invoices[0].lines.map((l) => l.taxable), [true, false]);
  assert.equal(xero.invoices[1].lines[0].taxable, false);
  const qb = parseUsInvoicesCsv(QUICKBOOKS);
  assert.equal(qb.meta.source, 'quickbooks');
  assert.equal(qb.invoices[0].id, '1007');
  assert.equal(qb.invoices[0].date, '2026-10-06');
  assert.equal(qb.invoices[0].taxJurisdiction, '', 'QuickBooks files carry no jurisdiction code');
  assert.equal(parseUsInvoicesCsv('a,b\n1,2').meta.error, 'NO_HEADER');
});

test('imported invoices post with the recorded rate; ones whose tax differs, lack a jurisdiction or a rate are held back by name', async () => {
  const state = await bakery();
  const preview = previewOf(state, 'import_us_invoices', { csv: XERO });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /Xero: 4 invoices read, 2 ready to post/);
  const out = await runTool(state, 'import_us_invoices', { csv: XERO });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual(out.data.created.map((c) => [c.invoice.id, c.invoice.salesTax, c.invoice.total]), [['INV-X-1', 41.25, 581.25], ['INV-X-2', 0, 200]]);
  assert.deepEqual(out.data.skipped.map((s) => [s.id, s.reason]), [['INV-X-3', 'RATE_UNKNOWN'], ['INV-X-4', 'tax_differs']]);
  const differs = out.data.skipped.find((s) => s.id === 'INV-X-4');
  assert.equal(differs.fileTax, 13);
  assert.equal(differs.computedTax, 12.5);
  assert.equal(state.invoices.find((inv) => inv.id === 'INV-X-1').country, 'US');
  const again = await runTool(state, 'import_us_invoices', { csv: XERO });
  assert.equal(again.data.created.length, 0);
  assert.equal(again.data.skipped.filter((s) => s.reason === 'exists').length, 2);
  const qbNoJurisdiction = await runTool(state, 'import_us_invoices', { csv: QUICKBOOKS });
  assert.deepEqual(qbNoJurisdiction.data.skipped.map((s) => s.reason), ['jurisdiction_missing']);
  const qb = await runTool(state, 'import_us_invoices', { csv: QUICKBOOKS, taxJurisdiction: 'tx' });
  assert.equal(qb.data.created.length, 1, JSON.stringify(qb));
  assert.equal(qb.data.created[0].invoice.salesTax, 12.5);
  assert.equal(qb.data.created[0].invoice.lines[1].taxRate, 0);
  assert.equal((await runTool(createState(), 'import_us_invoices', { csv: XERO })).error, 'NOT_FOR_COUNTRY');
});

test('chat: attach the file, say "import xero", confirm, and hear what was held back', async () => {
  const state = await bakery();
  state.pendingFile = { name: 'xero-invoices.csv', content: XERO };
  const held = await chat(state, 'import xero');
  assert.equal(held.preview?.tool, 'import_us_invoices', held.reply);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /Imported 2 invoices from Xero totalling \$781\.25\. Held back: 1 with no rate recorded for their jurisdiction; 1 whose sales tax differs from the recorded rate\./);
  assert.equal(state.pendingFile, null);
  const nothing = await chat(state, 'import quickbooks');
  assert.match(nothing.reply, /Attach the QuickBooks or Xero invoice CSV first/);
});
