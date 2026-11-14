import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { createInvoice, recordReceipt } from '../src/invoice.mjs';
import { planMatch, applyMatch, findBankLine } from '../src/bank-recon.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';
import { createServer } from 'node:http';
import { runDailyAutomation } from '../src/automation.mjs';
import { parseZohoBooksCsv } from '../src/import-zoho.mjs';
import { pushTally } from '../src/tally-push.mjs';

function balanceOf(state, code) {
  const row = listAccounts(state.ledger).find((account) => account.code === code);
  return row ? Math.round((row.debitsPosted - row.creditsPosted) * 100) / 100 : 0;
}

function statement(rows) {
  let balance = 0;
  const body = rows.map(([date, narration, out, inn]) => {
    balance = Math.round((balance + (inn || 0) - (out || 0)) * 100) / 100;
    return `${date},${narration},,${out ? out.toFixed(2) : ''},${inn ? inn.toFixed(2) : ''},${balance.toFixed(2)}`;
  });
  return ['Date,Narration,Chq/Ref Number,Withdrawal Amt,Deposit Amt,Balance', ...body].join('\n');
}

test('a bank receipt split over two invoices posts nothing when the second allocation fails', async () => {
  const state = createState();
  createInvoice(state, { id: 'INV-0001', date: '2026-09-01', partyName: 'Sharma Traders', lines: [{ description: 'Supply', rate: 10000, gstRate: 18 }] });
  createInvoice(state, { id: 'INV-0002', date: '2026-09-02', partyName: 'Sharma Traders', lines: [{ description: 'Supply', rate: 8200, gstRate: 0 }] });
  const imported = await runTool(state, 'import_bank', { content: statement([['08-09-2026', 'NEFT CR SHARMA TRADERS UTR555', 0, 20000]]), type: 'csv', post: 'hold', fileName: 'sept.csv' });
  assert.equal(imported.ok, true, JSON.stringify(imported).slice(0, 300));
  const line = findBankLine(state, 'BL-000001');
  const planned = planMatch(state, line, { kind: 'receipt', partyName: 'Sharma Traders' });
  assert.equal(planned.ok, true, JSON.stringify(planned));
  assert.deepEqual(planned.plan.allocations.map((part) => part.invoiceId), ['INV-0001', 'INV-0002']);
  state.invoices.find((inv) => inv.id === 'INV-0002').status = 'cancelled';
  const seq = state.transferSeq;
  const bank = balanceOf(state, '1002');
  const out = applyMatch(state, line, planned.plan);
  assert.equal(out.ok, false);
  assert.equal(out.error, 'INVOICE_CANCELLED');
  assert.equal(state.transferSeq, seq, 'no transfer is posted');
  assert.equal(balanceOf(state, '1002'), bank);
  assert.deepEqual(state.invoices.find((inv) => inv.id === 'INV-0001').receipts || [], [], 'the first invoice is not settled either');
  assert.equal(line.status, 'unmatched');
});

test('a bank receipt line never settles an invoice dated after it, and says so when that invoice is named', async () => {
  const state = createState();
  createInvoice(state, { id: 'INV-0001', date: '2026-09-01', partyName: 'Sharma Traders', lines: [{ description: 'Supply', rate: 10000, gstRate: 18 }] });
  createInvoice(state, { id: 'INV-0002', date: '2026-09-20', partyName: 'Sharma Traders', lines: [{ description: 'Supply', rate: 8200, gstRate: 0 }] });
  await runTool(state, 'import_bank', { content: statement([['08-09-2026', 'NEFT CR SHARMA TRADERS UTR555', 0, 20000]]), type: 'csv', post: 'hold', fileName: 'sept.csv' });
  const seq = state.transferSeq;
  const byParty = await runTool(state, 'match_bank_line', { lineId: 'BL-000001', kind: 'receipt', partyName: 'Sharma Traders' });
  assert.equal(byParty.ok, false);
  assert.equal(byParty.error, 'RECEIPT_UNALLOCATED');
  const named = await runTool(state, 'match_bank_line', { lineId: 'BL-000001', kind: 'receipt', invoiceId: 'INV-0002' });
  assert.equal(named.ok, false);
  assert.equal(named.error, 'BEFORE_INVOICE');
  assert.equal(state.transferSeq, seq);
});

async function billWithTds() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', tan: 'MUMA12345B', pan: 'AAACA1234A', tdsDeductor: true };
  const bill = await runTool(state, 'create_purchase', { partyName: 'Rao & Co', partyGstin: '27AAAFR1234K1Z5', lines: [{ description: 'Audit fees', qty: 1, rate: 60000, gstRate: 18 }], date: '2026-10-05', tdsSection: '194J', payeePan: 'AAAFR1234K', tdsCategory: 'professional' });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  assert.equal(bill.invoice.tds.amount, 6000);
  return { state, bill: bill.invoice };
}

const vendorBalance = (state, bill) => {
  const row = listAccounts(state.ledger).find((account) => String(account.id) === String(bill.partyAccountId));
  return Math.round((row.creditsPosted - row.debitsPosted) * 100) / 100;
};

test('a partial supplier debit note reverses TDS in proportion, and the last note reverses what is left', async () => {
  const { state, bill } = await billWithTds();
  assert.equal(balanceOf(state, '2200'), -6000);
  const half = await runTool(state, 'create_purchase_note', { billId: bill.id, amount: 35400, date: '2026-10-08', reason: 'half the work was not done' });
  assert.equal(half.ok, true, JSON.stringify(half));
  assert.equal(half.purchaseNote.tdsReversed, 3000);
  assert.equal(balanceOf(state, '2200'), -3000);
  assert.equal(bill.tds.reversed, 3000);
  const entry = state.tdsEntries.find((item) => item.source === bill.id);
  assert.equal(entry.tds, 3000);
  assert.equal(entry.reversedTds, 3000);
  assert.equal(vendorBalance(state, bill), 32400);
  assert.equal(half.outstanding, 32400);
  const rest = await runTool(state, 'create_purchase_note', { billId: bill.id, amount: 35400, date: '2026-10-09', reason: 'the rest was cancelled' });
  assert.equal(rest.ok, true, JSON.stringify(rest));
  assert.equal(rest.purchaseNote.tdsReversed, 3000);
  assert.equal(balanceOf(state, '2200'), 0);
  assert.equal(entry.tds, 0);
  assert.equal(entry.reversedTds, 6000);
  assert.equal(vendorBalance(state, bill), 0);
  assert.equal(rest.outstanding, 0);
});

test('a supplier debit note leaves TDS already deposited alone and says what to do instead', async () => {
  const { state, bill } = await billWithTds();
  const deposit = await runTool(state, 'record_tds_deposit', { amount: 6000, date: '2026-10-10', challan: 'BSR1234567' });
  assert.equal(deposit.ok, true, JSON.stringify(deposit));
  assert.equal(balanceOf(state, '2200'), 0);
  const half = await runTool(state, 'create_purchase_note', { billId: bill.id, amount: 35400, date: '2026-10-12', reason: 'half the work was not done' });
  assert.equal(half.ok, true, JSON.stringify(half));
  assert.equal(half.purchaseNote.tdsReversed, undefined);
  assert.equal(balanceOf(state, '2200'), 0, 'TDS payable is not pushed into debit');
  assert.equal(vendorBalance(state, bill), 29400);
  assert.equal(half.outstanding, 29400);
  assert.match(half.hint, /already deposited/);
  assert.equal(state.tdsEntries.find((item) => item.source === bill.id).tds, 6000);
  const full = await runTool(state, 'create_purchase_note', { billId: bill.id, amount: 35400, date: '2026-10-12', reason: 'the rest was cancelled' });
  assert.equal(full.ok, true, JSON.stringify(full));
  assert.equal(full.purchaseNote.tdsReversed, undefined);
  assert.equal(balanceOf(state, '2200'), 0);
  assert.equal(full.refundDue, 6000);
  assert.match(full.hint, /already deposited/);
});

async function payrollBooks(components, extra = {}) {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', tdsDeductor: true, tan: 'MUMA12345B' };
  const out = await runTool(state, 'add_employee', { name: 'Kiran Das', joinedOn: '2026-04-01', components, pfMember: true, esiMember: true, sex: 'female', taxRegime: 'new', pan: 'ABCPD1234L', ...extra });
  assert.equal(out.ok, true, JSON.stringify(out));
  return state;
}

test('ESI is rounded up to the next rupee and provident fund to the nearest rupee, and the books still balance', async () => {
  const state = await payrollBooks([{ name: 'Basic', amount: 12345 }, { name: 'HRA', amount: 7665 }]);
  const run = await runTool(state, 'payroll_run', { period: '2026-10' });
  assert.equal(run.ok, true, JSON.stringify(run));
  const row = run.data.rows[0];
  assert.equal(row.gross, 20010);
  assert.equal(row.esiEmployee, 151, '0.75% of 20,010 is 150.075, rounded up');
  assert.equal(row.esiEmployer, 651, '3.25% of 20,010 is 650.325, rounded up');
  assert.equal(row.pfEmployee, 1481, '12% of 12,345 is 1,481.40');
  assert.equal(row.eps, 1028, '8.33% of 12,345 is 1,028.34');
  assert.equal(row.pfEmployer, 453);
  assert.equal(row.edli, 62, '0.5% of 12,345 is 61.725');
  assert.equal(row.net, 20010 - 1481 - 151 - row.pt - row.tds);
  const approved = await runTool(state, 'approve_payroll', { period: '2026-10' });
  assert.equal(approved.ok, true, JSON.stringify(approved));
  const tb = trialBalance(state.ledger);
  assert.equal(tb.debit, tb.credit);
  assert.equal(balanceOf(state, '2320'), -(151 + 651));
});

test('a provident fund share of exactly half a rupee rounds up', async () => {
  const state = await payrollBooks([{ name: 'Basic', amount: 15000 }, { name: 'HRA', amount: 15000 }], { esiMember: false });
  const run = await runTool(state, 'payroll_run', { period: '2026-10' });
  const row = run.data.rows[0];
  assert.equal(row.eps, 1250);
  assert.equal(row.pfEmployer, 550);
  assert.equal(row.pfEmployee, 1800);
});

test('a receipt dated before its invoice is refused unless it is marked as an advance', async () => {
  const state = createState();
  createInvoice(state, { id: 'INV-0001', date: '2026-10-10', partyName: 'Kiran Stores', lines: [{ description: 'Supply', rate: 10000, gstRate: 18 }] });
  const early = recordReceipt(state, { invoiceId: 'INV-0001', amount: 5000, date: '2026-10-05', mode: 'bank' });
  assert.equal(early.ok, false);
  assert.equal(early.error, 'BEFORE_INVOICE');
  assert.equal(early.invoiceDate, '2026-10-10');
  assert.equal(balanceOf(state, '1002'), 0);
  assert.match(previewOf(state, 'record_receipt', { invoiceId: 'INV-0001', amount: 5000, date: '2026-10-05' }).blockers.join(' '), /before the invoice/);
  assert.equal(previewOf(state, 'record_receipt', { invoiceId: 'INV-0001', amount: 5000, date: '2026-10-05', advance: true }).blockers.length, 0);
  const advance = await runTool(state, 'record_receipt', { invoiceId: 'INV-0001', amount: 5000, date: '2026-10-05', mode: 'bank', advance: true });
  assert.equal(advance.ok, true, JSON.stringify(advance));
  assert.deepEqual(advance.invoice.receipts, [{ amount: 5000, date: '2026-10-05', mode: 'bank', advance: true }]);
  assert.equal(balanceOf(state, '1002'), 5000);
  const sameDay = recordReceipt(state, { invoiceId: 'INV-0001', amount: 1000, date: '2026-10-10', mode: 'bank' });
  assert.equal(sameDay.ok, true);
  const undated = recordReceipt(state, { invoiceId: 'INV-0001', amount: 1000, mode: 'bank' });
  assert.equal(undated.ok, true, 'no date means the invoice date');
});

test('a cash payment run never pays more than the cash in hand across its bills, and posts nothing when it would', async () => {
  const state = createState();
  createInvoice(state, { id: 'INV-0001', date: '2026-10-01', partyName: 'Kiran Stores', lines: [{ description: 'Supply', rate: 10000, gstRate: 0 }] });
  assert.equal(recordReceipt(state, { invoiceId: 'INV-0001', amount: 10000, date: '2026-10-02', mode: 'cash' }).ok, true);
  for (const id of ['1', '2']) {
    const bill = await runTool(state, 'create_purchase', { partyName: `Supplier ${id}`, lines: [{ description: 'Stock', qty: 1, rate: 7000, gstRate: 0 }], date: '2026-10-03' });
    assert.equal(bill.ok, true, JSON.stringify(bill));
  }
  const ids = state.purchases.map((bill) => bill.id);
  const seq = state.transferSeq;
  const out = await runTool(state, 'record_payment_run', { billIds: ids, date: '2026-10-05', mode: 'cash' });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'BILLS_NOT_PAYABLE');
  assert.deepEqual(out.problems.map((p) => [p.billId, p.error]), [[ids[1], 'INSUFFICIENT_CASH']]);
  assert.equal(state.transferSeq, seq);
  assert.equal(balanceOf(state, '1001'), 10000);
});

test('a payment run that names a bill twice pays it once', async () => {
  const state = createState();
  const bill = await runTool(state, 'create_purchase', { partyName: 'Supplier 1', lines: [{ description: 'Stock', qty: 1, rate: 7000, gstRate: 0 }], date: '2026-10-03' });
  const id = bill.invoice.id;
  const out = await runTool(state, 'record_payment_run', { billIds: [id, id.toLowerCase()], date: '2026-10-05', mode: 'bank' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.posted.length, 1);
  assert.equal(balanceOf(state, '1002'), -7000);
});

test('the payroll reminder for the month just ending is raised before the month turns', async () => {
  const state = createState();
  await runTool(state, 'add_employee', { name: 'Kiran Das', joinedOn: '2026-04-01', components: [{ name: 'Basic', amount: 20000 }] });
  const out = runDailyAutomation(state, { asOf: '2026-10-28' });
  const payroll = out.data.run.reminders.find((item) => /payroll/.test(item.text));
  assert.ok(payroll, JSON.stringify(out.data.run.reminders));
  assert.equal(payroll.text, 'Approve the payroll for 2026-10');
  assert.equal(payroll.due, '2026-11-07');
  const later = runDailyAutomation(state, { asOf: '2026-11-02' });
  assert.equal(later.data.run.reminders.filter((item) => /payroll/.test(item.text)).length, 0, 'not raised twice');
});

test('Zoho import keeps a missing HSN blank, reads a quantity with a thousands comma, and a description over two lines', () => {
  const csv = 'Invoice Number,Invoice Date,Customer Name,Item Name,HSN/SAC,Quantity,Item Price,Tax Percentage\nZ-1,05-08-2026,Retail Mart,"Cloth\ndyed",,"1,000",10,5\nZ-1,05-08-2026,Retail Mart,Thread,5204,2,500,5';
  const parsed = parseZohoBooksCsv(csv);
  assert.equal(parsed.invoices.length, 1);
  const [first, second] = parsed.invoices[0].lines;
  assert.equal(first.hsn, '');
  assert.equal(first.qty, 1000);
  assert.equal(first.description, 'Cloth\ndyed');
  assert.equal(second.hsn, '5204');
  assert.equal(second.qty, 2);
});

test('counter sales hold a whole day back when one of its rows cannot be read, so the fixed file still imports it', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const bad = 'Date,GST Rate,Taxable\n13-10-2026,5,3000\n13-10-2026,,500\n14-10-2026,5,1000';
  const first = await runTool(state, 'import_pos_sales', { csv: bad });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.deepEqual(first.data.created.map((item) => item.invoice.date), ['2026-10-14']);
  assert.ok(first.data.skipped.some((s) => s.id === '2026-10-13' && s.reason === 'day_has_held_rows'), JSON.stringify(first.data.skipped));
  const fixed = 'Date,GST Rate,Taxable\n13-10-2026,5,3000\n13-10-2026,12,500\n14-10-2026,5,1000';
  const second = await runTool(state, 'import_pos_sales', { csv: fixed });
  assert.deepEqual(second.data.created.map((item) => item.invoice.taxable), [3500]);
});

test('a Tally push that is partly rejected is still recorded, so the vouchers Tally took are not sent twice', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  createInvoice(state, { date: '2026-10-05', partyName: 'Arjun Stores', lines: [{ description: 'Cloth', qty: 1, rate: 1000, gstRate: 5 }] });
  const mock = process.env.MYCA_MOCK_MODE;
  process.env.MYCA_MOCK_MODE = '0';
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => res.end('<RESPONSE><CREATED>3</CREATED><ALTERED>0</ALTERED><ERRORS>1</ERRORS><LINEERROR>Ledger does not exist</LINEERROR></RESPONSE>'));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const sent = await pushTally(state, { period: '2026-10', url });
    assert.equal(sent.ok, false);
    assert.equal(sent.error, 'TALLY_REJECTED');
    assert.equal(sent.created, 3);
    assert.equal(state.tallyPushes['2026-10'].created, 3);
    assert.equal(state.tallyPushes['2026-10'].errors, 1);
    const again = await pushTally(state, { period: '2026-10', url });
    assert.equal(again.error, 'ALREADY_PUSHED');
  } finally {
    server.close();
    if (mock === undefined) delete process.env.MYCA_MOCK_MODE;
    else process.env.MYCA_MOCK_MODE = mock;
  }
});
