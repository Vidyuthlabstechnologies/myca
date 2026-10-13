import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice, createPurchase, recordReceipt, recordPayment } from '../src/invoice.mjs';
import { tallyVouchers } from '../src/tally-export.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha & Sons', gstin: '27AABCU9603R1ZN', state: '27' };
  const sale = createInvoice(state, { id: 'INV-0001', date: '2026-08-05', partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', lines: [{ description: 'Cloth <fine>', hsn: '5208', qty: 10, rate: 1000, gstRate: 5 }] });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  assert.equal(recordReceipt(state, { invoiceId: 'INV-0001', amount: 4000, date: '2026-08-10', mode: 'cash' }).ok, true);
  const bill = createPurchase(state, { date: '2026-08-06', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', supplierInvoiceNo: 'FC/118', lines: [{ description: 'Grey cloth', hsn: '5208', qty: 10, rate: 400, gstRate: 5 }] });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  assert.equal(recordPayment(state, { billId: bill.invoice.id, amount: 1000, date: '2026-08-12' }).ok, true);
  return state;
}

function sumOf(xml, voucherNumber) {
  const block = xml.split('<VOUCHERNUMBER>').find((part) => part.startsWith(`${voucherNumber}<`));
  const amounts = [...block.split('</VOUCHER>')[0].matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => Number(m[1]));
  return Math.round(amounts.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

test('every voucher balances in Tally\'s sign convention, ledgers come first, and text is escaped', async () => {
  const state = books();
  await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 1050, date: '2026-08-20', reason: 'Returned' });
  await runTool(state, 'post_expense', { narration: 'Shop rent', amount: 11800, gstRate: 18, supplierGstin: '27AABCT1332L1ZE', date: '2026-08-03' });
  const out = await runTool(state, 'export_tally', { period: '2026-08' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.equal(d.fileName, 'tally_27AABCU9603R1ZN_2026-08.xml');
  assert.equal(d.count, 6);
  assert.ok(d.ledgers >= 13);
  const xml = d.xml;
  assert.ok(xml.indexOf('<REPORTNAME>All Masters</REPORTNAME>') < xml.indexOf('<REPORTNAME>Vouchers</REPORTNAME>'), 'masters before vouchers');
  assert.match(xml, /<SVCURRENTCOMPANY>Asha &amp; Sons<\/SVCURRENTCOMPANY>/);
  assert.match(xml, /<NARRATION>Cloth &lt;fine&gt;<\/NARRATION>/);
  assert.match(xml, /<LEDGER NAME="Retail Mart" ACTION="Create">[\s\S]*?<PARENT>Sundry Debtors<\/PARENT>[\s\S]*?<PARTYGSTIN>27AAACH7409R1Z1<\/PARTYGSTIN>/);
  assert.match(xml, /<LEDGER NAME="Fabric Co" ACTION="Create">[\s\S]*?<PARENT>Sundry Creditors<\/PARENT>/);
  assert.match(xml, /<LEDGER NAME="Rent" ACTION="Create">[\s\S]*?<PARENT>Indirect Expenses<\/PARENT>/);
  for (const number of ['INV-0001', 'INV-0001-R1', 'BILL-0001', 'BILL-0001-P1', 'CN-0001', 'EXP-0001']) {
    assert.equal(sumOf(xml, number), 0, `${number} balances`);
  }
  assert.match(xml, /<VOUCHER VCHTYPE="Sales" ACTION="Create">\s*<DATE>20260805<\/DATE>/);
  assert.match(xml, /<LEDGERNAME>Retail Mart<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>-10500\.00<\/AMOUNT>/);
  assert.match(xml, /<LEDGERNAME>Output CGST<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>250\.00<\/AMOUNT>/);
  assert.match(xml, /<VOUCHER VCHTYPE="Receipt"[\s\S]*?<LEDGERNAME>Cash<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes/);
  assert.match(xml, /<VOUCHER VCHTYPE="Purchase"[\s\S]*?<REFERENCE>FC\/118<\/REFERENCE>[\s\S]*?<LEDGERNAME>Input CGST<\/LEDGERNAME>/);
  assert.match(xml, /<VOUCHER VCHTYPE="Credit Note"[\s\S]*?<REFERENCE>INV-0001<\/REFERENCE>/);
  assert.ok(!xml.includes('INV-0001-R1') || sumOf(xml, 'INV-0001-R1') === 0);
  const empty = await runTool(state, 'export_tally', { period: '2026-07' });
  assert.equal(empty.data.count, 0);
  assert.equal((await runTool(state, 'export_tally', { period: 'Aug' })).error, 'INVALID_PERIOD');
  assert.equal(isRemoteQuery('export_tally'), true);
  assert.equal(validateAssistantToolCall('export_tally', { period: '2026-08' }).ok, true);
  assert.equal(validateAssistantToolCall('export_tally', { period: '2026-8' }).ok, false);
});

test('TDS on a bill splits the supplier credit and TDS payable; a blocked-credit bill books the tax into purchases', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', tdsDeductor: true, tan: 'MUMA12345B' };
  const fees = createPurchase(state, { date: '2026-10-05', partyName: 'Rao & Co', lines: [{ description: 'Fees', qty: 1, rate: 60000, gstRate: 18 }], tdsSection: '194J', tdsCategory: 'professional', payeePan: 'AAAFR1234K' });
  assert.equal(fees.ok, true, JSON.stringify(fees));
  const blocked = createPurchase(state, { date: '2026-10-06', partyName: 'Car Hire', partyGstin: '27AABCT1332L1ZE', itcEligible: false, lines: [{ description: 'Cab', qty: 1, rate: 1000, gstRate: 5 }] });
  assert.equal(blocked.ok, true);
  const { vouchers } = tallyVouchers(state, '2026-10');
  const rao = vouchers.find((v) => v.includes('<VOUCHERNUMBER>BILL-0001</VOUCHERNUMBER>'));
  assert.match(rao, /<LEDGERNAME>TDS Payable<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>6000\.00<\/AMOUNT>/);
  assert.match(rao, /<LEDGERNAME>Rao &amp; Co<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>64800\.00<\/AMOUNT>/);
  const cab = vouchers.find((v) => v.includes('<VOUCHERNUMBER>BILL-0002</VOUCHERNUMBER>'));
  assert.match(cab, /<LEDGERNAME>Purchases<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>-1050\.00<\/AMOUNT>/);
  assert.ok(!cab.includes('Input CGST'));
});

test('chat: "export for tally" answers with the file summary', async () => {
  const state = books();
  const out = await chat(state, 'export my books for tally');
  assert.match(out.reply, /^Tally file for [A-Z][a-z]+ \d{4} is ready: \d+ vouchers? and \d+ ledgers, saved as tally_27AABCU9603R1ZN_\d{4}-\d{2}\.xml from Taxes\./, out.reply);
});
