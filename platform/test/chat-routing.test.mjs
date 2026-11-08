import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { runTool } from '../src/tools.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';
import { chat } from '../src/router.mjs';

function plain() {
  const state = createState();
  state.company = { ...state.company, gstin: '27AABCU9603R1ZN' };
  return state;
}

function excelBooks() {
  const state = plain();
  assert.equal(createInvoice(state, { date: '2026-10-05', partyName: 'Excel Traders', lines: [{ description: 'Goods', qty: 1, rate: 1000, gstRate: 18 }] }).ok, true);
  assert.equal(createPurchase(state, { date: '2026-10-06', partyName: 'Excel Enterprises', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey cloth', qty: 1, rate: 5000, gstRate: 0 }] }).ok, true);
  return state;
}

async function accounts() {
  const state = plain();
  for (const [label, kind] of [['HDFC current', 'bank'], ['ICICI savings', 'bank'], ['Petty cash', 'cash']]) {
    const added = await runTool(state, 'set_bank_account', { label, kind });
    assert.equal(added.ok, true, JSON.stringify(added));
  }
  assert.deepEqual(state.bankAccounts.map((account) => [account.label, account.id]), [['HDFC current', '1003'], ['ICICI savings', '1004'], ['Petty cash', '1005']]);
  assert.equal(createPurchase(state, { date: '2026-10-06', partyName: 'Sharma Traders', lines: [{ description: 'Cloth', qty: 1, rate: 5000, gstRate: 0 }] }).ok, true);
  assert.equal(createInvoice(state, { date: '2026-10-05', partyName: 'Excel Traders', lines: [{ description: 'Goods', qty: 1, rate: 1000, gstRate: 18 }] }).ok, true);
  return state;
}

function exported(state, sentence, args) {
  const plan = planLocalToolCall(state, sentence);
  assert.equal(plan.kind, 'tool', `${sentence}: ${JSON.stringify(plan)}`);
  assert.equal(plan.name, 'export_xlsx', `${sentence}: ${JSON.stringify(plan)}`);
  assert.deepEqual(plan.args, args, sentence);
}

function keepPostings() {
  const excel = excelBooks();
  const sale = planLocalToolCall(excel, 'sold 10000 to Excel Traders at 18% gst');
  assert.equal(sale.name, 'create_invoice', JSON.stringify(sale));
  assert.equal(sale.args.partyName, 'Excel Traders');
  const newParty = planLocalToolCall(plain(), 'sold 10000 to Excel Infotech GST 18%');
  assert.equal(newParty.name, 'create_invoice', JSON.stringify(newParty));
  assert.equal(newParty.args.partyName, 'Excel Infotech');
  const paid = planLocalToolCall(excel, 'paid 5000 to Excel Enterprises');
  assert.equal(paid.name, 'record_payment', JSON.stringify(paid));
  assert.deepEqual([paid.args.billId, paid.args.amount, paid.args.mode], ['BILL-0001', 5000, 'bank']);
  const bought = planLocalToolCall(excel, 'bought excel sheets for 500');
  assert.equal(bought.kind, 'reply', JSON.stringify(bought));
  assert.match(bought.reply, /GST rate/);
  const software = planLocalToolCall(excel, 'expense 300 for spreadsheet software');
  assert.equal(software.name, 'post_expense', JSON.stringify(software));
  assert.deepEqual([software.args.amount, software.args.narration], [300, 'spreadsheet software']);
  const received = planLocalToolCall(excel, 'received 5000 from Excel Traders');
  assert.equal(received.name, 'record_receipt', JSON.stringify(received));
  assert.deepEqual([received.args.invoiceId, received.args.amount], ['INV-0001', 5000]);
  for (const sentence of ["don't make an excel file", 'upload the excel statement']) {
    assert.notEqual(planLocalToolCall(excel, sentence).name, 'export_xlsx', sentence);
  }
  const imported = planLocalToolCall(excel, 'import bank statement from excel');
  assert.equal(imported.kind, 'reply', JSON.stringify(imported));
  assert.match(imported.reply, /^Attach a bank CSV or TXT/);
}

test('R1: an Excel export of expenses with a threshold amount is an export, never an expense paid to "excel"', async () => {
  const state = excelBooks();
  exported(state, 'export expenses above 5000 to excel', { report: 'expenses' });
  exported(state, 'export expenses above 5000 to excel for this month', { report: 'expenses', period: 'this-month' });
  exported(state, 'excel of expenses above 5000', { report: 'expenses' });
  exported(state, 'spreadsheet of expenses over 1000 this month', { report: 'expenses', period: 'this-month' });
  exported(state, 'save expenses above 500 as a spreadsheet', { report: 'expenses' });
  exported(state, 'export expenses to excel', { report: 'expenses' });
  const out = await chat(state, 'export expenses above 5000 to excel');
  assert.equal(out.preview, undefined, out.reply);
  assert.match(out.reply, /^Saved myca-expenses-\d{4}-\d{2}(?:-\d{2})?\.xlsx with \d+ rows\. Open it in Excel or send it to your CA\.$/, out.reply);
  keepPostings();
});

test('R2: an Excel export of purchases or invoices with a threshold amount is an export, never the GST-rate refusal', () => {
  const state = excelBooks();
  exported(state, 'export purchases above 10000 to excel', { report: 'purchases' });
  exported(state, 'excel of every invoice above 50000', { report: 'sales' });
  exported(state, 'export the invoice list above 50000 to excel', { report: 'sales' });
  exported(state, 'excel of the 1180 invoice', { report: 'sales' });
  exported(state, 'export sales above 10000 to excel', { report: 'sales' });
  exported(state, 'excel of bills above 10000', { report: 'purchases' });
  keepPostings();
});

test('R3: "reconcile <own account>" is a bank reconciliation of that account, not a GSTR-2B one', async () => {
  const state = await accounts();
  const plans = {
    'reconcile HDFC current': { account: '1003' },
    'reconcile my HDFC account': { account: '1003' },
    'reconcile petty cash': { account: '1005' },
    'reconcile cash': { account: '1001' },
    'reconcile the cash book': { account: '1001' },
    'reconcile ICICI savings statement': { account: '1004' },
    'reconcile the HDFC current bank account': { account: '1003' },
  };
  for (const [sentence, args] of Object.entries(plans)) {
    const plan = planLocalToolCall(state, sentence);
    assert.equal(plan.name, 'bank_reconciliation', `${sentence}: ${JSON.stringify(plan)}`);
    assert.deepEqual(plan.args, args, sentence);
  }
  for (const sentence of ['reconcile GSTR-2B', 'reconcile my GSTR-2B statement', 'reconcile the purchase register', 'reconcile ITC with GSTR-2B']) {
    const plan = planLocalToolCall(state, sentence);
    assert.equal(plan.name, 'gst_reconcile', `${sentence}: ${JSON.stringify(plan)}`);
  }
  const out = await chat(state, 'reconcile HDFC current');
  assert.match(out.reply, /^HDFC current \(1003\)/, out.reply);
  assert.doesNotMatch(out.reply, /gstr-?2b/i, out.reply);
});

test('R4: a GST or TDS reconciliation asked for in Excel never exports the bank reconciliation sheet', async () => {
  const state = plain();
  exported(state, 'export the GSTR-2B reconciliation to excel', { report: 'credit_at_risk' });
  exported(state, 'excel of the GST reconciliation', { report: 'gst_period_summary' });
  exported(state, 'export the TDS reconciliation to excel', { report: 'tds_summary' });
  exported(state, 'bank reconciliation in excel', { report: 'bank_reconciliation' });
  exported(state, 'spreadsheet of the 2B mismatches', { report: 'credit_at_risk' });
  exported(state, 'export the reconciliation to excel', { report: 'bank_reconciliation' });
  const out = await chat(state, 'export the TDS reconciliation to excel');
  assert.doesNotMatch(out.reply, /bank-reconciliation/, out.reply);
});

test('R5: a withdrawal with a purpose is an expense paid from the bank; a bare withdrawal stays a transfer', async () => {
  const state = await accounts();
  const tea = planLocalToolCall(state, 'withdrew 5000 from bank for tea');
  assert.equal(tea.name, 'post_expense', JSON.stringify(tea));
  assert.deepEqual([tea.args.narration, tea.args.amount, tea.args.mode, tea.args.gstRate, tea.args.payee], ['tea', 5000, 'bank', 0, undefined]);
  const office = planLocalToolCall(state, 'withdrew 5000 from bank for office tea');
  assert.deepEqual([office.name, office.args.narration, office.args.amount, office.args.mode], ['post_expense', 'office tea', 5000, 'bank']);
  const article = planLocalToolCall(state, 'withdrew 5000 from the bank for tea');
  assert.deepEqual([article.name, article.args.narration, article.args.amount, article.args.mode], ['post_expense', 'tea', 5000, 'bank']);
  const took = planLocalToolCall(state, 'took out 5000 from bank for tea');
  assert.deepEqual([took.name, took.args.narration, took.args.amount, took.args.mode], ['post_expense', 'tea', 5000, 'bank']);
  for (const sentence of ['withdrew 5000 from bank to pay the electrician', 'withdrew 5000 from HDFC current for tea']) {
    const plan = planLocalToolCall(state, sentence);
    assert.equal(plan.name, 'post_expense', `${sentence}: ${JSON.stringify(plan)}`);
    assert.deepEqual([plan.args.amount, plan.args.mode, plan.fallback], [5000, 'bank', undefined], sentence);
  }
  const bare = planLocalToolCall(state, 'withdrew 5000 from bank');
  assert.deepEqual([bare.name, bare.args], ['record_transfer', { fromAccount: '1002', toAccount: '1001', amount: 5000 }]);
  const named = planLocalToolCall(state, 'withdrew 5000 from HDFC current');
  assert.deepEqual([named.name, named.args], ['record_transfer', { fromAccount: '1003', toAccount: '1001', amount: 5000 }]);
  assert.notEqual(planLocalToolCall(state, 'withdrew 5000 from hdfc').name, 'post_expense', 'a withdrawal without a purpose is not an expense');
  const out = await chat(state, 'withdrew 5000 from bank for tea');
  assert.equal(out.preview?.tool, 'post_expense', out.reply);
  assert.match(out.reply, /tea ₹5,000\.00 paid from bank/, out.reply);
});

test('R6: a bank transfer to a known supplier is a payment against the bill; to a customer it gets a plain reply', async () => {
  const state = await accounts();
  const bill = state.purchases.find((item) => item.partyName === 'Sharma Traders');
  for (const sentence of ['transfer 5000 from bank to Sharma Traders', 'transferred 5000 to Sharma Traders from bank', 'paid 5000 to Sharma Traders by bank transfer']) {
    const plan = planLocalToolCall(state, sentence);
    assert.equal(plan.name, 'record_payment', `${sentence}: ${JSON.stringify(plan)}`);
    assert.deepEqual([plan.args.billId, plan.args.mode, plan.args.amount], [bill.id, 'bank', 5000], sentence);
  }
  const supplier = planLocalToolCall(excelBooks(), 'transfer 5000 from bank to Excel Enterprises');
  assert.equal(supplier.name, 'record_payment', JSON.stringify(supplier));
  assert.deepEqual([supplier.args.billId, supplier.args.mode, supplier.args.amount], ['BILL-0001', 'bank', 5000]);

  const customers = plain();
  assert.equal(createInvoice(customers, { date: '2026-10-05', partyName: 'Excel Enterprises', lines: [{ description: 'Goods', qty: 1, rate: 5000, gstRate: 18 }] }).ok, true);
  for (const [book, sentence] of [[customers, 'transfer 5000 from bank to Excel Enterprises'], [state, 'transfer 5000 from bank to Excel Traders']]) {
    const plan = planLocalToolCall(book, sentence);
    assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
    assert.match(plan.reply, /is a customer, not one of your own accounts/, sentence);
    assert.match(plan.reply, /recorded nothing/, sentence);
    assert.match(plan.reply, /"credit note INV-0001 5000 /, sentence);
    assert.match(plan.reply, /"bill from Excel \w+ 5000 GST 18%"/, sentence);
    assert.match(plan.reply, /"paid 5000 to Excel \w+"/, sentence);
  }
  const petty = planLocalToolCall(state, 'transfer 5000 from bank to petty cash');
  assert.deepEqual([petty.name, petty.args], ['record_transfer', { fromAccount: '1002', toAccount: '1005', amount: 5000 }]);
  const unknown = planLocalToolCall(state, 'transferred 5000 to Ramesh from bank');
  assert.match(unknown.reply, /^I do not know an own account called "Ramesh"/);
  const out = await chat(state, 'transfer 5000 from bank to Sharma Traders');
  assert.equal(out.preview?.tool, 'record_payment', out.reply);
  assert.doesNotMatch(out.reply, /did not match that/, out.reply);
});

test('R7: "paid" between two own accounts is a transfer; with a party on one side the payment and expense planners run', async () => {
  const state = await accounts();
  const petty = planLocalToolCall(state, 'paid 5000 from bank to petty cash');
  assert.deepEqual([petty.name, petty.args], ['record_transfer', { fromAccount: '1002', toAccount: '1005', amount: 5000 }]);
  const dated = planLocalToolCall(state, 'paid 5000 from bank to petty cash on 3 November');
  assert.equal(dated.name, 'record_transfer', JSON.stringify(dated));
  assert.deepEqual([dated.args.fromAccount, dated.args.toAccount, dated.args.amount], ['1002', '1005', 5000]);
  assert.match(dated.args.date, /^\d{4}-11-03$/);
  const between = planLocalToolCall(state, 'pay 5000 from HDFC current to ICICI savings');
  assert.deepEqual([between.name, between.args], ['record_transfer', { fromAccount: '1003', toAccount: '1004', amount: 5000 }]);
  const supplier = planLocalToolCall(state, 'paid 5000 to Sharma Traders from bank');
  assert.equal(supplier.name, 'record_payment', JSON.stringify(supplier));
  assert.deepEqual([supplier.args.billId, supplier.args.mode, supplier.args.amount], [state.purchases[0].id, 'bank', 5000]);
  const ramesh = planLocalToolCall(state, 'paid 5000 to Ramesh from bank');
  assert.equal(ramesh.name, 'post_expense', JSON.stringify(ramesh));
  assert.deepEqual([ramesh.args.payee, ramesh.args.amount, ramesh.args.mode], ['Ramesh', 5000, 'bank']);
  const rent = planLocalToolCall(state, 'paid 12000 rent');
  assert.deepEqual([rent.name, rent.args.narration, rent.args.amount], ['post_expense', 'rent', 12000]);
  const out = await chat(state, 'paid 5000 from bank to petty cash');
  assert.equal(out.preview?.tool, 'record_transfer', out.reply);
  assert.doesNotMatch(out.reply, /Other expenses/, out.reply);
});

test('R8: an Excel request for the bank reconciliation that names an account number is an export, not the on-screen view or the import prompt', async () => {
  const state = await accounts();
  for (const sentence of [
    'bank reconciliation for 1003 in excel',
    'export the bank reconciliation for account 1003 to excel',
    'save the bank reconciliation for 1003 as a spreadsheet',
    'excel of unmatched bank lines for 1003',
    'export the bank statement for 1003 to excel',
    'bank reconciliation in excel',
    'bank reconciliation for HDFC current in excel',
    'export the bank statement to excel',
  ]) exported(state, sentence, { report: 'bank_reconciliation' });
  const out = await chat(state, 'bank reconciliation for 1003 in excel');
  assert.match(out.reply, /^Saved myca-bank-reconciliation-\d{4}-\d{2}-\d{2}\.xlsx with \d+ rows\. Open it in Excel or send it to your CA\.$/, out.reply);
  const statement = await chat(state, 'export the bank statement for 1003 to excel');
  assert.doesNotMatch(statement.reply, /^Attach a bank CSV/, statement.reply);
  keepPostings();
});
