import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';
import { purchaseRegisterCsv } from '../src/post-import.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

const BILL = (date, no) => ({ partyName: 'Fabric Co', partyGstin: '27AAACF1234A1Z5', lines: [{ description: 'Cloth', hsn: '5208', qty: 10, rate: 1000, gstRate: 5 }], date, supplierInvoiceNo: no });

test('an MSME supplier gives new bills a pay-by date from the MSMED rule: 15 days without agreement, the agreed days up to 45 with one', async () => {
  const state = books();
  const before = await runTool(state, 'create_purchase', BILL('2026-09-01', 'F-1'));
  assert.equal(before.invoice.dueDate, undefined, 'a bill before the supplier is marked carries no pay-by date');
  const marked = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true, udyam: 'udyam-mh-12-1234567', category: 'small' });
  assert.equal(marked.ok, true, JSON.stringify(marked));
  assert.equal(marked.udyam, 'UDYAM-MH-12-1234567');
  const fifteen = await runTool(state, 'create_purchase', BILL('2026-09-10', 'F-2'));
  assert.equal(fifteen.invoice.dueDate, '2026-09-25');
  assert.equal(fifteen.invoice.msme, true);
  const agreed = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', days: 30 });
  assert.equal(agreed.msme, true, 'marking terms keeps the MSME flag');
  const thirty = await runTool(state, 'create_purchase', BILL('2026-09-12', 'F-3'));
  assert.equal(thirty.invoice.dueDate, '2026-10-12');
  const tooLong = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', days: 60 });
  assert.equal(tooLong.error, 'TERMS_EXCEED_MSMED');
  assert.equal(tooLong.max, 45);
  const badUdyam = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', udyam: 'UDYAM-12' });
  assert.equal(badUdyam.error, 'BAD_UDYAM');
  const plain = await runTool(state, 'set_supplier_terms', { partyName: 'Steel Co', days: 60 });
  assert.equal(plain.ok, true);
  assert.equal(plain.msme, false, 'a non-MSME supplier may have any terms');
});

test('supplier dues list unpaid bills by pay-by date with the MSME position, feed the week ahead, and answer in chat', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true });
  await runTool(state, 'create_purchase', BILL('2026-09-01', 'F-1'));
  await runTool(state, 'create_purchase', BILL('2026-10-01', 'F-2'));
  await runTool(state, 'record_payment', { billId: 'BILL-0002', amount: 500, date: '2026-10-02' });
  const dues = await runTool(state, 'supplier_dues', { asOf: '2026-10-05' });
  assert.equal(dues.ok, true, JSON.stringify(dues));
  assert.deepEqual(dues.data.bills.map((b) => [b.billId, b.payBy, b.overdue, b.outstanding]), [['BILL-0001', '2026-09-16', true, 10500], ['BILL-0002', '2026-10-16', false, 10000]]);
  assert.equal(dues.data.msme.count, 2);
  assert.equal(dues.data.msme.overdue, 1);
  assert.equal(dues.data.msme.overdueOutstanding, 10500);
  assert.match(dues.data.msme.rule, /43B\(h\)/);
  assert.equal(dues.data.msme.unreviewed, true);
  assert.equal(isRemoteQuery('supplier_dues'), true);

  const week = await runTool(state, 'week_ahead', { asOf: '2026-10-12' });
  const payables = week.data.items.filter((item) => item.kind === 'payable');
  assert.deepEqual(payables.map((p) => [p.billId, p.overdue, p.msme]), [['BILL-0001', true, true], ['BILL-0002', false, true]]);

  const said = await chat(state, 'msme dues');
  assert.match(said.reply, /2 bills with a pay-by date/);
  assert.match(said.reply, /MSME suppliers are owed/);
  assert.match(said.reply, /not deductible until paid/);
  const plan = planLocalToolCall(state, 'Fabric Co is MSME, UDYAM-MH-12-1234567, net 30');
  assert.deepEqual(plan, { kind: 'tool', name: 'set_supplier_terms', args: { partyName: 'Fabric Co', msme: true, udyam: 'UDYAM-MH-12-1234567', days: 30 } });
  const udyamOnly = planLocalToolCall(state, "Steel Co's udyam number is UDYAM-GJ-01-0000001");
  assert.equal(udyamOnly.name, 'set_supplier_terms');
  assert.equal(udyamOnly.args.udyam, 'UDYAM-GJ-01-0000001');
  const paid = await runTool(state, 'record_payment', { billId: 'BILL-0001', date: '2026-10-05' });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  const after = await runTool(state, 'supplier_dues', { asOf: '2026-10-05' });
  assert.deepEqual(after.data.bills.map((b) => b.billId), ['BILL-0002']);
});

test('the purchase register MyCA builds carries recorded payments, so Rule 37 no longer reports them as unknown', async () => {
  const state = books();
  await runTool(state, 'create_purchase', BILL('2026-01-10', 'F-1'));
  await runTool(state, 'create_purchase', BILL('2026-01-12', 'F-2'));
  await runTool(state, 'record_payment', { billId: 'BILL-0002', date: '2026-02-01' });
  const csv = purchaseRegisterCsv(state.purchases);
  const [header, first, second] = csv.split('\n');
  assert.match(header, /,AMOUNT PAID,PAYMENT DATE$/);
  assert.match(first, /,0,$/);
  assert.match(second, /,10500,01-02-2026$/);
});

test('a bank statement import records its closing balance as the bank balance on the statement date', async () => {
  const state = books();
  const csv = 'Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance\n01/09/2026,Opening,,,"1,00,000.00"\n02/09/2026,NEFT from Kiran,,"5,000.00","1,05,000.00"\n03/09/2026,UPI to Raj,"1,000.00",,"1,04,000.00"\n';
  const out = await runTool(state, 'import_bank', { content: csv, type: 'csv', asOfDate: '2026-09-30' });
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300));
  assert.deepEqual(out.data.bankBalance, { on: '2026-09-03', balance: 104000, source: 'bank statement' });
  assert.equal(state.cashReadings.at(-1).bank, 104000);
  assert.equal(state.cashReadings.at(-1).on, '2026-09-03');
  const forecast = await runTool(state, 'cash_forecast', {});
  assert.equal(forecast.ok, true);
});
