import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLedger, createTransfers, paise, trialBalance, verifyChain } from '../src/ledger.mjs';
import { installChart } from '../src/chart.mjs';
import { createInvoice, recordReceipt, createPurchase } from '../src/invoice.mjs';
import { createState } from '../src/store.mjs';
import { chat } from '../src/router.mjs';
import { parseZohoBooksCsv } from '../src/import-zoho.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTool } from '../src/tools.mjs';

test('ledger rejects unbalanced implied postings and keeps a checksum chain', () => {
  const l = emptyLedger();
  installChart(l);
  const r = createTransfers(l, [{
    id: 1,
    debitAccountId: 1100,
    creditAccountId: 4000,
    amount: paise(1000),
    code: 'SALES',
  }]);
  assert.equal(r[0].ok, true);
  const tb = trialBalance(l);
  assert.equal(tb.balanced, true);
  assert.equal(tb.debit, 1000);
  assert.equal(verifyChain(l).ok, true);
});

test('invoice posts AR = sales + GST and receipt clears AR', () => {
  const state = createState();
  const inv = createInvoice(state, {
    date: '2026-08-01',
    partyName: 'Retail Mart',
    partyGstin: '27AAACH7409R1Z3',
    partyState: '27',
    lines: [{ description: 'Fabric', hsn: '5208', qty: 2, rate: 10000, gstRate: 5 }],
  });
  assert.equal(inv.ok, true);
  assert.equal(inv.invoice.taxable, 20000);
  assert.equal(inv.invoice.cgst, 500);
  assert.equal(inv.invoice.sgst, 500);
  assert.equal(inv.invoice.igst, 0);
  assert.equal(inv.invoice.total, 21000);
  const tb = trialBalance(state.ledger);
  assert.equal(tb.balanced, true);
  const paid = recordReceipt(state, { invoiceId: inv.invoice.id, mode: 'bank' });
  assert.equal(paid.ok, true);
  assert.equal(paid.invoice.status, 'paid');
});

test('inter-state invoice books IGST not CGST/SGST', () => {
  const state = createState();
  const inv = createInvoice(state, {
    date: '2026-08-01',
    partyName: 'Gujarat Weaves',
    partyGstin: '24AAACF7856R1Z0',
    partyState: '24',
    lines: [{ description: 'Yarn', hsn: '5402', qty: 1, rate: 100000, gstRate: 18 }],
  });
  assert.equal(inv.invoice.igst, 18000);
  assert.equal(inv.invoice.cgst, 0);
});

test('chat creates an invoice via the tool runtime', async () => {
  const state = createState();
  const out = await chat(state, 'Invoice Retail Mart GSTIN 27AAACH7409R1Z3, 10 rolls at 50000, GST 5%');
  assert.match(out.reply, /Posted INV-/);
  assert.equal(state.invoices.length, 1);
  assert.equal(state.invoices[0].total, 525000);
});

test('purchase bill posts ITC and AP and still ties', () => {
  const state = createState();
  const bill = createPurchase(state, {
    date: '2026-08-04',
    partyName: 'Fabrics Co',
    partyGstin: '27AABCT1332L1ZM',
    partyState: '27',
    lines: [{ description: 'Grey cloth', hsn: '5208', qty: 2, rate: 10000, gstRate: 5 }],
  });
  assert.equal(bill.ok, true);
  assert.equal(bill.invoice.cgst, 500);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('chat books a purchase even with trailing ITC commentary', async () => {
  const state = createState();
  const out = await chat(state, 'Purchase from Fabrics Co GSTIN 27AABCT1332L1ZM, 2 rolls at 10000, GST 5% — books ITC + AP');
  assert.match(out.reply, /BILL-/);
  assert.equal(state.purchases.length, 1);
  assert.equal(state.purchases[0].partyName, 'Fabrics Co');
  assert.equal(state.purchases[0].total, 21000);
});

test('zoho books csv groups line items', () => {
  const csv = `Invoice Number,Invoice Date,Customer Name,GST Identification Number (GSTIN),Item Name,HSN/SAC,Quantity,Item Price,Tax Percentage
INV-Z-1,05-08-2026,Retail Mart,27AAACH7409R1Z3,Fabric,5208,2,10000,5
INV-Z-1,05-08-2026,Retail Mart,27AAACH7409R1Z3,Thread,5204,1,500,5`;
  const p = parseZohoBooksCsv(csv);
  assert.equal(p.invoices.length, 1);
  assert.equal(p.invoices[0].lines.length, 2);
});

test('tally day book posts sales and payments into the ledger', async () => {
  const csv = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../sprints/sprint-1-tally-ingestion/test/fixtures/clean-daybook.csv'), 'utf8');
  const state = createState();
  const out = await runTool(state, 'import_tally', { csv });
  assert.equal(out.ok, true);
  assert.ok(out.data.ledger.posted > 0);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.ok((state.invoices || []).some((i) => String(i.id).startsWith('TALLY-')));
});

test('bank statement withdrawals and deposits post and still tie', async () => {
  const content = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../sprints/sprint-2-bank-ocr/test/fixtures/hdfc-clean.csv'), 'utf8');
  const state = createState();
  const out = await runTool(state, 'import_bank', { content, type: 'csv' });
  assert.equal(out.ok, true);
  assert.ok(out.data.ledger.posted > 0);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('tally xml converts to day book csv and gstr1 json groups b2b', async () => {
  const xml = `<?xml version="1.0"?><ENVELOPE><BODY><DATA><TALLYMESSAGE>
<VOUCHER VCHTYPE="Sales"><DATE>20260805</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
<VOUCHERNUMBER>88</VOUCHERNUMBER><PARTYLEDGERNAME>Retail Mart</PARTYLEDGERNAME>
<PARTYGSTIN>27AAACH7409R1Z3</PARTYGSTIN><NARRATION>Cloth</NARRATION>
<ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>-50000</AMOUNT></ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST><LEDGERNAME>Retail Mart</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>50000</AMOUNT></ALLLEDGERENTRIES.LIST>
</VOUCHER></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
  const { tallyXmlToDayBookCsv } = await import('../src/tally-xml.mjs');
  const converted = tallyXmlToDayBookCsv(xml);
  assert.equal(converted.ok, true);
  assert.equal(converted.count, 1);
  assert.match(converted.csv, /Sales/);
  const state = createState();
  const inv = createInvoice(state, {
    date: '2026-08-01',
    partyName: 'Retail Mart',
    partyGstin: '27AAACH7409R1Z3',
    partyState: '27',
    lines: [{ description: 'Fabric', hsn: '5208', qty: 2, rate: 10000, gstRate: 5 }],
  });
  const { invoicesToGstr1Json } = await import('../src/gstr1-json.mjs');
  const json = invoicesToGstr1Json(state.company, [inv.invoice]);
  assert.equal(json.gstin, state.company.gstin);
  assert.equal(json.b2b.length, 1);
  assert.equal(json.b2b[0].ctin, '27AAACH7409R1Z3');
  assert.equal(json.b2b[0].inv[0].val, 21000);
});
