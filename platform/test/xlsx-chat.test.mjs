import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';
import { ROUTES } from '../src/intent.mjs';
import { chat } from '../src/router.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, gstin: '27AABCU9603R1ZN' };
  const sale = createInvoice(state, { date: '2026-10-05', partyName: 'Excel Traders', lines: [{ description: 'Goods', qty: 1, rate: 1000, gstRate: 18 }] });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  const bill = createPurchase(state, { date: '2026-10-06', partyName: 'Excel Enterprises', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey cloth', qty: 1, rate: 5000, gstRate: 0 }] });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  assert.deepEqual(state.parties.map((party) => party.name), ['Excel Traders'], 'customers live in state.parties');
  assert.deepEqual(state.purchases.map((item) => item.partyName), ['Excel Enterprises'], 'suppliers live on their bills');
  return state;
}

test('a sale, a payment or an expense that happens to say "excel" is posted, not exported', () => {
  const state = books();
  const sale = planLocalToolCall(state, 'sold 10000 to Excel Traders GST 18%');
  assert.equal(sale.name, 'create_invoice', JSON.stringify(sale));
  assert.equal(sale.args.partyName, 'Excel Traders');
  assert.equal(sale.args.lines[0].rate, 10000);
  const noRate = planLocalToolCall(state, 'sold 10000 to Excel Traders');
  assert.equal(noRate.kind, 'reply', JSON.stringify(noRate));
  assert.match(noRate.reply, /GST rate/, 'the sale path answers, not the export');
  const payment = planLocalToolCall(state, 'paid 5000 to Excel Enterprises');
  assert.equal(payment.name, 'record_payment', JSON.stringify(payment));
  assert.equal(payment.args.billId, 'BILL-0001');
  assert.equal(payment.args.amount, 5000);
  const stationery = planLocalToolCall(state, 'bought excel sheets for 500');
  assert.notEqual(stationery.name, 'export_xlsx', JSON.stringify(stationery));
  assert.match(stationery.reply || '', /GST rate/, 'a purchase without a rate gets the purchase answer');
  const spent = planLocalToolCall(state, 'spent 500 on excel sheets');
  assert.equal(spent.name, 'post_expense', JSON.stringify(spent));
  assert.equal(spent.args.amount, 500);
  const received = planLocalToolCall(state, 'received 1180 from Excel Traders');
  assert.notEqual(received.name, 'export_xlsx', JSON.stringify(received));
  const partial = planLocalToolCall(state, 'sold 10000 to Excel GST 18%');
  assert.equal(partial.name, 'create_invoice', JSON.stringify(partial));
});

test('parties the book does not know yet still win: the posting planners run before the Excel planner', () => {
  const state = createState();
  state.company = { ...state.company, gstin: '27AABCU9603R1ZN' };
  const sale = planLocalToolCall(state, 'sold 10000 to Excel Infotech GST 18%');
  assert.equal(sale.name, 'create_invoice', JSON.stringify(sale));
  assert.equal(sale.args.partyName, 'Excel Infotech');
  const noRate = planLocalToolCall(state, 'sold 10000 to Excel Infotech');
  assert.equal(noRate.kind, 'reply', JSON.stringify(noRate));
  assert.match(noRate.reply, /GST rate/);
  const expense = planLocalToolCall(state, 'paid 5000 to Excel Stationers for repairs');
  assert.equal(expense.name, 'post_expense', JSON.stringify(expense));
  assert.equal(expense.args.amount, 5000);
  const purchase = planLocalToolCall(state, 'bought 10 excel sheets from Excel Stationers at 50 GST 12%');
  assert.equal(purchase.name, 'create_purchase', JSON.stringify(purchase));
  assert.equal(purchase.args.partyName, 'Excel Stationers');
});

test('export sentences keep working with an export verb, "to/as/in excel" or "excel of", while a lone "excel" gets the normal fallback', () => {
  const state = books();
  const plans = {
    'export the trial balance to excel': { report: 'trial_balance' },
    'save my entries as a spreadsheet': { report: 'entries' },
    'excel of sales this month': { report: 'sales', period: 'this-month' },
    'trial balance as a spreadsheet': { report: 'trial_balance' },
    'bank reconciliation in excel': { report: 'bank_reconciliation' },
    'spreadsheet of what customers owe': { report: 'customer_dues' },
    'excel of supplier dues': { report: 'supplier_dues' },
    'put the day book in an excel file': { report: 'day_book' },
    'I need an xlsx of purchases for last month': { report: 'purchases', period: 'last-month' },
    'export sales above 10000 to excel': { report: 'sales' },
  };
  for (const [sentence, args] of Object.entries(plans)) {
    const plan = planLocalToolCall(state, sentence);
    assert.equal(plan.kind, 'tool', sentence);
    assert.equal(plan.name, 'export_xlsx', `${sentence}: ${JSON.stringify(plan)}`);
    assert.deepEqual(plan.args, args, sentence);
  }
  for (const sentence of ["don't make an excel file", 'excel please', 'excel', 'spreadsheet', 'the excel traders order is late', 'excel enterprises called about the bill', 'upload the excel statement']) {
    const plan = planLocalToolCall(state, sentence);
    assert.notEqual(plan.name, 'export_xlsx', `${sentence}: ${JSON.stringify(plan)}`);
  }
  const lone = planLocalToolCall(state, 'excel please');
  assert.equal(lone.name, 'company_profile');
  assert.equal(lone.fallback, true, 'a lone "excel" is the normal fallback, not an export');
  assert.ok(!ROUTES.some((route) => route.tool === 'export_xlsx'), 'the generic route for export_xlsx is gone; the planner owns these sentences');
  assert.ok(ROUTES.some((route) => route.tool === 'export_trial_balance'), 'the CSV route stays');
});

test('a party name said in part still counts: "Excel Traders" for the customer "Excel Traders Pvt Ltd", and only the excel word before one of its words', () => {
  const state = createState();
  state.company = { ...state.company, gstin: '27AABCU9603R1ZN' };
  assert.equal(createInvoice(state, { date: '2026-10-05', partyName: 'Excel Traders Pvt Ltd', lines: [{ description: 'Goods', qty: 1, rate: 1000, gstRate: 18 }] }).ok, true);
  const sale = planLocalToolCall(state, 'sold 10000 to Excel Traders GST 18%');
  assert.equal(sale.name, 'create_invoice', JSON.stringify(sale));
  for (const sentence of ['give Excel Traders a credit note', 'send Excel Traders the statement', 'make Excel Traders Pvt a reminder']) {
    const plan = planLocalToolCall(state, sentence);
    assert.notEqual(plan.name, 'export_xlsx', `${sentence}: ${JSON.stringify(plan)}`);
  }
  for (const [sentence, args] of Object.entries({ 'export the trial balance to excel': { report: 'trial_balance' }, 'excel of sales this month': { report: 'sales', period: 'this-month' }, 'send the credit notes to excel': { report: 'credit_notes' } })) {
    const plan = planLocalToolCall(state, sentence);
    assert.equal(plan.name, 'export_xlsx', `${sentence}: ${JSON.stringify(plan)}`);
    assert.deepEqual(plan.args, args, sentence);
  }
});

test('through the router the sale to Excel Traders previews an invoice and the export still saves a file', async () => {
  const state = books();
  const sale = await chat(state, 'sold 10000 to Excel Traders GST 18%');
  assert.equal(sale.preview?.tool, 'create_invoice', sale.reply);
  assert.doesNotMatch(sale.reply, /Saved myca-/);
  const paid = await chat(state, 'paid 5000 to Excel Enterprises');
  assert.equal(paid.preview?.tool, 'record_payment', paid.reply);
  const exported = await chat(state, 'export the trial balance to excel');
  assert.match(exported.reply, /^Saved myca-trial-balance-\d{4}-\d{2}-\d{2}\.xlsx with \d+ rows\. Open it in Excel or send it to your CA\.$/, exported.reply);
  const lone = await chat(state, 'excel please');
  assert.doesNotMatch(lone.reply, /Saved myca-/, lone.reply);
});
