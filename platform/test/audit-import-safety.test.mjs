import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { postTallyRows, postBankRows } from '../src/post-import.mjs';
import { parseZohoBooksCsv } from '../src/import-zoho.mjs';
import { tallyXmlToDayBookCsv } from '../src/tally-xml.mjs';
import { trialBalance } from '../src/ledger.mjs';

const sale = (over = {}) => ({ voucherType: 'Sales', voucherNo: '1', date: '2026-08-01', ledger: 'Apna Retail', gstin: '27AAACH7409R1Z1', computedAmount: 1180, ...over });
const fixture = (name) => readFileSync(fileURLToPath(new URL(`../../sprints/sprint-2-bank-ocr/test/fixtures/${name}`, import.meta.url)), 'utf8');

test('H11: a GST-inclusive Tally amount is not taxed again', () => {
  const state = createState();
  const out = postTallyRows(state, [sale({ gstRate: 18 })]);
  assert.equal(out.posted, 1);
  const inv = state.invoices[0];
  assert.equal(inv.taxable, 1000);
  assert.equal(inv.total, 1180, 'the voucher amount is the total, not the taxable value');
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('H11: an explicit 0% stays exempt instead of becoming 18%', () => {
  const state = createState();
  postTallyRows(state, [sale({ voucherNo: 'Z1', gstRate: 0, computedAmount: 1000 })]);
  const inv = state.invoices[0];
  assert.equal(inv.taxable, 1000);
  assert.deepEqual([inv.cgst, inv.sgst, inv.igst], [0, 0, 0]);
  assert.equal(inv.total, 1000);
});

test('H11: with no rate and no tax columns the voucher is held back, never assumed 18%', () => {
  const state = createState();
  const out = postTallyRows(state, [sale({ voucherNo: 'U1' })]);
  assert.equal(out.posted, 0);
  assert.deepEqual(out.skipped, [{ voucherNo: 'U1', reason: 'gst_rate_unknown' }]);
  assert.equal((state.invoices || []).length, 0);
});

test('H11: the rate is derived from the tax columns and checked against the rates in force', () => {
  const state = createState();
  const derived = postTallyRows(state, [sale({ voucherNo: 'D1', computedAmount: 118000, cgst: 9000, sgst: 9000, igst: 0 })]);
  assert.equal(derived.posted, 1);
  assert.equal(state.invoices[0].taxable, 100000);
  assert.equal(state.invoices[0].lines[0].gstRate, 18);

  const gone = postTallyRows(state, [sale({ voucherNo: 'O1', gstRate: 28, computedAmount: 1280 })]);
  assert.deepEqual(gone.skipped, [{ voucherNo: 'O1', reason: 'rate_not_in_force:28' }], '28% was omitted from 1-Feb-2026');
  const before = postTallyRows(state, [sale({ voucherNo: 'O2', gstRate: 28, computedAmount: 1280, date: '2026-01-31' })]);
  assert.equal(before.posted, 1);

  const inconsistent = postTallyRows(state, [sale({ voucherNo: 'M1', gstRate: 5, computedAmount: 118000, cgst: 9000, sgst: 9000 })]);
  assert.deepEqual(inconsistent.skipped, [{ voucherNo: 'M1', reason: 'tax_does_not_match_rate' }]);
});

test('H12: re-importing the same Tally file posts nothing, including receipts and payments', () => {
  const state = createState();
  const rows = [
    sale({ gstRate: 18 }),
    { voucherType: 'Receipt', voucherNo: 'R1', date: '2026-08-02', ledger: 'Apna Retail', credit: 500, computedAmount: 500 },
    { voucherType: 'Payment', voucherNo: 'P1', date: '2026-08-03', ledger: 'Power Co', debit: 400, computedAmount: 400 },
  ];
  const first = postTallyRows(state, rows);
  assert.equal(first.posted, 3);
  const debitAfterFirst = trialBalance(state.ledger).debit;

  const second = postTallyRows(state, rows);
  assert.equal(second.posted, 0);
  assert.equal(second.skipped.filter((s) => s.reason === 'exists').length, 3);
  assert.equal(trialBalance(state.ledger).debit, debitAfterFirst, 'the trial balance must not double');
});

test('H12: the same voucher number in the next financial year is a different voucher', () => {
  const state = createState();
  postTallyRows(state, [sale({ gstRate: 18 })]);
  const next = postTallyRows(state, [sale({ gstRate: 18, date: '2027-05-01' })]);
  assert.equal(next.posted, 1);
  assert.deepEqual(state.invoices.map((i) => i.id), ['TALLY-2026-27-1', 'TALLY-2027-28-1']);
});

test('H12: re-importing a bank statement posts nothing, but a genuine repeat row still posts twice', async () => {
  const state = createState();
  const content = fixture('hdfc-clean.csv');
  const first = await runTool(state, 'import_bank', { content, type: 'csv' });
  assert.ok(first.data.ledger.posted > 0);
  const before = trialBalance(state.ledger).debit;
  const second = await runTool(state, 'import_bank', { content, type: 'csv' });
  assert.equal(second.data.ledger.posted, 0);
  assert.equal(second.data.ledger.skipped.every((s) => s.reason === 'exists'), true);
  assert.equal(trialBalance(state.ledger).debit, before);

  const twice = createState();
  const row = { date: '2026-08-01', type: 'debit', debit: 100, narration: 'UPI tea', balance: '', sourceRow: 1 };
  assert.equal(postBankRows(twice, [row, { ...row, sourceRow: 2 }]).posted, 2, 'two identical rows in one file are two payments');
  assert.equal(postBankRows(twice, [row, { ...row, sourceRow: 2 }]).posted, 0, 'the same file again is none');
});

test('H12: a re-imported Zoho invoice is skipped, and a blank tax rate is never assumed', async () => {
  const state = createState();
  const header = 'Invoice Number,Invoice Date,Customer Name,GSTIN,Item Name,HSN/SAC,Quantity,Item Price,Tax Percentage';
  const csv = `${header}\nINV-Z-1,05-08-2026,Retail Mart,27AAACH7409R1Z1,Cloth,5208,1,1000,5\n`;
  const first = await runTool(state, 'import_zoho', { csv });
  assert.equal(first.data.created.length, 1);
  const second = await runTool(state, 'import_zoho', { csv });
  assert.equal(second.data.created.length, 0);
  assert.deepEqual(second.data.skipped, [{ id: 'INV-Z-1', reason: 'exists' }]);

  const noRate = await runTool(state, 'import_zoho', { csv: `${header}\nINV-Z-2,05-08-2026,Retail Mart,27AAACH7409R1Z1,Cloth,5208,1,1000,\n` });
  assert.deepEqual(noRate.data.skipped, [{ id: 'INV-Z-2', reason: 'gst_rate_missing' }]);
  const badDate = await runTool(state, 'import_zoho', { csv: `${header}\nINV-Z-3,31-02-2026,Retail Mart,27AAACH7409R1Z1,Cloth,5208,1,1000,5\n` });
  assert.deepEqual(badDate.data.skipped, [{ id: 'INV-Z-3', reason: 'INVALID_DATE' }]);
});

test('H12: Zoho place of supply is read when the export gives a state code', () => {
  const csv = [
    'Invoice Number,Invoice Date,Customer Name,GSTIN,Place of Supply,Item Name,HSN/SAC,Quantity,Item Price,Tax Percentage',
    'INV-P-1,05-08-2026,Retail Mart,,29,Cloth,5208,1,1000,5',
  ].join('\n');
  assert.equal(parseZohoBooksCsv(csv).invoices[0].partyState, '29');
});

test('Tally XML: escaped characters are decoded, not carried through as entities', () => {
  const xml = '<ENVELOPE><VOUCHER><DATE>20260801</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>7</VOUCHERNUMBER>'
    + '<PARTYLEDGERNAME>Sharma &amp; Sons, Pvt</PARTYLEDGERNAME><NARRATION>Cloth &lt;grade A&gt; &quot;lot 3&quot; &#8377;5</NARRATION>'
    + '<AMOUNT>1180</AMOUNT></VOUCHER></ENVELOPE>';
  const out = tallyXmlToDayBookCsv(xml);
  assert.equal(out.ok, true);
  const row = out.csv.split('\n')[1];
  assert.match(row, /"Sharma & Sons, Pvt"/);
  assert.match(row, /Cloth <grade A> ""lot 3"" ₹5/);
  assert.equal(row.includes('&amp;'), false);
});
