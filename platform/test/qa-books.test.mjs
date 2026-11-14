import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase, recordReceipt } from '../src/invoice.mjs';
import { createCreditNote, outstandingOf } from '../src/credit-notes.mjs';
import { createPurchaseNote } from '../src/debit-notes.mjs';
import { listAccounts, trialBalance, verifyChain } from '../src/ledger.mjs';
import { tallyVouchers } from '../src/tally-export.mjs';
import { closeYear } from '../src/year-close.mjs';
import { profitAndLoss, balanceSheet } from '../src/statements.mjs';
import { reportDate } from '../src/dates.mjs';
import { parse26asCredits } from '../src/marketplace-credits.mjs';
import { parseOrdersCsv } from '../src/marketplace-orders.mjs';
import { parseSettlementCsv } from '../src/settlements.mjs';

const CUSTOMER = '27AAACH7409R1Z1';
const SUPPLIER = '27AABCT1332L1ZE';

function books() {
  const state = createState();
  state.company = { ...state.company, address: '' };
  return state;
}

function balanceOf(state, id) {
  return listAccounts(state.ledger).find((account) => account.id === String(id))?.posted ?? 0;
}

function voucherNet(xml) {
  return [...xml.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].reduce((sum, m) => sum + Math.round(Number(m[1]) * 100), 0);
}

test('a receipt with a third decimal is booked in whole paise, the same in the invoice and the ledger', () => {
  const state = books();
  const invoice = createInvoice(state, { date: '2026-09-03', partyName: 'A', partyGstin: CUSTOMER, lines: [{ description: 'x', hsn: '5208', qty: 1, rate: 100, gstRate: 18 }] }).invoice;
  const first = recordReceipt(state, { invoiceId: invoice.id, amount: 50.005 });
  assert.equal(first.ok, true);
  assert.equal(first.invoice.receipts[0].amount, 50.01);
  const rest = recordReceipt(state, { invoiceId: invoice.id });
  assert.equal(rest.ok, true);
  assert.equal(rest.invoice.receipts[1].amount, 67.99);
  assert.equal(outstandingOf(state, invoice), 0);
  assert.equal(balanceOf(state, invoice.partyAccountId), 0);
  const { vouchers } = tallyVouchers(state, '2026-09');
  assert.ok(vouchers.some((v) => v.includes('<AMOUNT>-50.01</AMOUNT>')));
});

test('a receipt one paisa above what is due is refused', () => {
  const state = books();
  const invoice = createInvoice(state, { date: '2026-09-03', partyName: 'A', partyGstin: CUSTOMER, lines: [{ description: 'x', hsn: '5208', qty: 1, rate: 100, gstRate: 18 }] }).invoice;
  const over = recordReceipt(state, { invoiceId: invoice.id, amount: 118.01 });
  assert.equal(over.ok, false);
  assert.equal(over.error, 'OVERPAYMENT');
  assert.equal(balanceOf(state, invoice.partyAccountId), 118);
});

test('invoice and bill totals are kept in whole paise, not float sums of the lines', () => {
  const state = books();
  const lines = [{ description: 'x', hsn: '5208', qty: 3, rate: 33.33, gstRate: 18 }, { description: 'y', hsn: '5208', qty: 7, rate: 0.07, gstRate: 5 }];
  const invoice = createInvoice(state, { date: '2026-09-03', partyName: 'A', partyGstin: CUSTOMER, lines }).invoice;
  assert.equal(invoice.taxable, 100.48);
  const bill = createPurchase(state, { date: '2026-09-03', partyName: 'V', partyGstin: SUPPLIER, lines }).invoice;
  assert.equal(bill.taxable, 100.48);
});

test('a reverse charge bill exports to Tally as a balanced voucher, with and without input credit', () => {
  const state = books();
  const guard = { partyState: '27', partyAddress: 'Shop 3, Pune', reverseCharge: true, lines: [{ description: 'Guards', hsn: '998525', qty: 1, rate: 10000, gstRate: 18 }], date: '2026-08-12' };
  assert.equal(createPurchase(state, { ...guard, partyName: 'Ravi Security' }).ok, true);
  assert.equal(createPurchase(state, { ...guard, partyName: 'Ravi Guards', itcEligible: false }).ok, true);
  const { vouchers } = tallyVouchers(state, '2026-08');
  assert.equal(vouchers.length, 2);
  for (const voucher of vouchers) {
    assert.equal(voucherNet(voucher), 0);
    assert.match(voucher, /<LEDGERNAME>Output CGST<\/LEDGERNAME>/);
  }
});

test('a full supplier note against a reverse charge bill clears the supplier without putting them in debit', () => {
  const state = books();
  const bill = createPurchase(state, { partyName: 'Ravi Security', partyState: '27', partyAddress: 'Pune', reverseCharge: true, lines: [{ description: 'Guards', hsn: '998525', qty: 1, rate: 10000, gstRate: 18 }], date: '2026-08-12' }).invoice;
  const note = createPurchaseNote(state, { billId: bill.id, amount: 10000, reason: 'returned', date: '2026-08-20' });
  assert.equal(note.ok, true);
  assert.equal(balanceOf(state, bill.partyAccountId), 0);
});

test('the profit and loss of a closed year still shows its income and expenses', () => {
  const state = books();
  createInvoice(state, { date: '2025-09-03', partyName: 'A', partyGstin: CUSTOMER, lines: [{ description: 'x', hsn: '5208', qty: 1, rate: 1000, gstRate: 18 }] });
  createPurchase(state, { date: '2025-09-04', partyName: 'V', partyGstin: SUPPLIER, lines: [{ description: 'y', hsn: '5208', qty: 1, rate: 400, gstRate: 18 }] });
  const span = { from: '2025-04-01', to: '2026-03-31' };
  const before = profitAndLoss(state, span).data;
  assert.equal(closeYear(state, { year: '2025-26' }).ok, true);
  const after = profitAndLoss(state, span).data;
  assert.equal(after.totalIncome, before.totalIncome);
  assert.equal(after.totalExpenses, before.totalExpenses);
  assert.equal(after.netProfit, 600);
  assert.equal(balanceSheet(state, { asOf: '2026-03-31' }).data.balanced, true);
});

test('a loss-making year can be closed, the loss going to capital', () => {
  const state = books();
  createInvoice(state, { date: '2025-09-03', partyName: 'A', partyGstin: CUSTOMER, lines: [{ description: 'x', hsn: '5208', qty: 1, rate: 100, gstRate: 18 }] });
  createPurchase(state, { date: '2025-09-04', partyName: 'V', partyGstin: SUPPLIER, lines: [{ description: 'y', hsn: '5208', qty: 1, rate: 400, gstRate: 18 }] });
  const closed = closeYear(state, { year: '2025-26' });
  assert.equal(closed.ok, true, closed.error);
  assert.equal(closed.closing.profit, -300);
  assert.equal(balanceOf(state, 3000), 300);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal(verifyChain(state.ledger).ok, true);
});

test('a credit note on 1 April against a March invoice posts after the year is closed', () => {
  const state = books();
  const invoice = createInvoice(state, { date: '2026-03-31', partyName: 'A', partyGstin: CUSTOMER, lines: [{ description: 'x', hsn: '5208', qty: 1, rate: 1000, gstRate: 18 }] }).invoice;
  assert.equal(closeYear(state, { year: '2025-26' }).ok, true);
  const note = createCreditNote(state, { invoiceId: invoice.id, amount: 118, reason: 'damaged', date: '2026-04-01' });
  assert.equal(note.ok, true, note.error);
  assert.equal(balanceOf(state, invoice.partyAccountId), 1062);
  assert.equal(profitAndLoss(state, { from: '2026-04-01', to: '2026-04-30' }).data.totalIncome, -100);
});

test('report dates with a time, or a month name as 26AS prints it, are read as the calendar day', () => {
  assert.equal(reportDate('30-Sep-2026'), '2026-09-30');
  assert.equal(reportDate('30 Sep 2026'), '2026-09-30');
  assert.equal(reportDate('2026-09-03 10:11:12 UTC'), '2026-09-03');
  assert.equal(reportDate('03.09.2026 10:11:12 UTC'), '2026-09-03');
  assert.equal(reportDate('2026-09-03T10:11:12+05:30'), '2026-09-03');
  assert.equal(reportDate('03/09/2026'), '2026-09-03');
  assert.equal(reportDate('31-Feb-2026'), null);
  assert.equal(reportDate('30-Foo-2026'), null);
  assert.equal(reportDate('hello 10:00'), null);
  const credits = parse26asCredits('Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking\n194O,AMAZON SELLER SERVICES PVT LTD,BLRA12345A,20000,150,30-Sep-2026');
  assert.equal(credits.ok, true, JSON.stringify(credits.held));
  assert.equal(credits.lines[0].date, '2026-09-30');
  const orders = parseOrdersCsv('Order Id,Shipment Date,Transaction Type,Ship To State,Sku,Quantity,Tax Exclusive Gross,Total Tax Amount,Tax Rate,Invoice Amount\n403-1111111-1111111,2026-09-03 14:22:10 IST,Shipment,MAHARASHTRA,SKU-A,1,1200.00,60.00,5,1260.00', { channel: 'amazon' });
  assert.equal(orders.ok, true, JSON.stringify(orders.held));
  assert.equal(orders.sales[0].date, '2026-09-03');
  const settlement = parseSettlementCsv('settlement-id,transaction-type,order-id,amount-type,amount-description,amount,posted-date-time\n777,Order,403-1111111-1111111,ItemPrice,Principal,1200.00,03.09.2026 10:11:12 UTC', { channel: 'amazon' });
  assert.equal(settlement.ok, true);
  assert.equal(settlement.lines[0].date, '2026-09-03');
});
