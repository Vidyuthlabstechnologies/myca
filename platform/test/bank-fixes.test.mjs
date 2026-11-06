import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { existsSync, readdirSync } from 'node:fs';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';
import { ROUTES } from '../src/intent.mjs';
import { createInvoice, recordReceipt, createPurchase, recordPayment } from '../src/invoice.mjs';
import { postExpense } from '../src/expenses.mjs';
import { listAccounts } from '../src/ledger.mjs';
import { runDailyAutomation } from '../src/automation.mjs';
import { safePatternProblem, MAX_PATTERN, rulePatternProblem, ruleMatches, planMatch, applyMatch, findBankLine, bookMovements, matchWords, ruleFromMatch, chargesWords } from '../src/bank-recon.mjs';
import { runRulesWords, rulesWords } from '../src/bank-rules.mjs';

function statement(rows) {
  let balance = 0;
  const body = rows.map(([date, narration, out, inn]) => {
    balance = Math.round((balance + (inn || 0) - (out || 0)) * 100) / 100;
    return `${date},${narration},,${out ? out.toFixed(2) : ''},${inn ? inn.toFixed(2) : ''},${balance.toFixed(2)}`;
  });
  return ['Date,Narration,Chq/Ref Number,Withdrawal Amt,Deposit Amt,Balance', ...body].join('\n');
}

function balanceOf(state, code) {
  const row = listAccounts(state.ledger).find((account) => account.code === code);
  return row ? Math.round((row.debitsPosted - row.creditsPosted) * 100) / 100 : 0;
}

async function heldImport(state, content, extra = {}) {
  const out = await runTool(state, 'import_bank', { content, type: 'csv', post: 'hold', fileName: 'held.csv', ...extra });
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300));
  return out;
}

function invoiceFor(state, id, date, rate, gstRate = 0) {
  const made = createInvoice(state, { id, date, partyName: 'Sharma Traders', lines: [{ description: 'Supply', rate, gstRate }] });
  assert.equal(made.ok, true, JSON.stringify(made));
  return made;
}

async function pettyCashBook(amountInHand) {
  const state = createState();
  const added = await runTool(state, 'set_bank_account', { label: 'Petty cash', kind: 'cash' });
  assert.equal(added.account.id, '1003');
  if (amountInHand) {
    const filled = await runTool(state, 'record_transfer', { fromAccount: 'Bank', toAccount: 'Petty cash', amount: amountInHand, date: '2026-09-01' });
    assert.equal(filled.ok, true, JSON.stringify(filled));
  }
  await heldImport(state, statement([['09-09-2026', 'IMPS DR RAMESH RENT', 5000, 0]]), { account: 'Petty cash' });
  assert.equal(state.bankLines[0].account, '1003');
  return state;
}

test('rule patterns are limited to a safe subset, a stored unsafe rule is skipped with a warning, and matching 1,000 long narrations is quick', async () => {
  const refused = ['(a+)+$', '(\\w+\\s?)*$', '(a|aa)+', '(.*a){10}', '(?=NEFT)SHARMA', '(?<!UPI)DR', '(\\w)\\1', '(a(b))', 'a++', '\\d+?', 'A'.repeat(MAX_PATTERN + 1), 'a+b+c+d+e+f+g+h+i+', '.*a.*b.*c.*d', '(', '[A-Z'];
  for (const pattern of refused) assert.notEqual(safePatternProblem(pattern), '', pattern);
  const accepted = ['NEFT.*SHARMA', '^UPI/\\d+/SWIGGY', 'IMPS\\s+\\d{6,}', 'SMS\\s+ALERT', '(NEFT|IMPS) CR SHARMA', '^[A-Z]{3,5}-\\d+$', 'UPI/\\d{6,12}/[A-Z]+', 'INT\\.PD\\b', 'a?b?c?d?e?f?g?h?'];
  for (const pattern of accepted) assert.equal(safePatternProblem(pattern), '', pattern);
  assert.match(safePatternProblem('(a+)+$'), /group/);
  assert.match(safePatternProblem('A'.repeat(MAX_PATTERN + 1)), /120 characters/);

  const state = createState();
  const bad = await runTool(state, 'add_bank_rule', { pattern: '(a+)+$', kind: 'ignore' });
  assert.equal(bad.error, 'BAD_PATTERN');
  assert.match(bad.hint, /group/);
  assert.equal((await runTool(state, 'add_bank_rule', { pattern: 'A'.repeat(MAX_PATTERN + 1), kind: 'ignore' })).error, 'BAD_PATTERN');
  const preview = previewOf(state, 'add_bank_rule', { pattern: '(\\w+\\s?)*$', kind: 'ignore' });
  assert.match(preview.blockers[0], /not a regular expression I can run\. A repeat on a group/);
  assert.equal(state.bankRules.length, 0);
  const good = await runTool(state, 'add_bank_rule', { pattern: 'IMPS\\s+\\d{6,}', kind: 'ignore', note: 'own transfers' });
  assert.equal(good.ok, true, JSON.stringify(good));

  state.bankRules.push({ id: 'BR-0002', side: 'any', contains: '', pattern: '(a+)+$', minAmount: null, maxAmount: null, then: { kind: 'ignore', partyName: '', head: '', otherAccount: '', note: '' }, hits: 0, createdOn: '2026-09-01', by: '' });
  const line = { id: 'BL-000001', account: '1002', date: '2026-09-01', narration: `${'a'.repeat(199)}!`, in: 0, out: 10, status: 'unmatched', match: null };
  const started = performance.now();
  assert.equal(ruleMatches(state.bankRules[1], line), false, 'an unsafe stored pattern never runs');
  assert.ok(performance.now() - started < 50);
  const imported = await heldImport(state, statement([['09-09-2026', `${'a'.repeat(199)}!`, 10, 0], ['10-09-2026', 'IMPS 123456 OWN', 20, 0]]));
  assert.equal(imported.data.lines.byRules, 1, 'the safe rule still applies at import');
  assert.equal(state.bankLines[1].status, 'ignored');
  const run = await runTool(state, 'run_bank_rules', { dryRun: true });
  assert.equal(run.ok, true);
  assert.deepEqual([run.made, run.left], [[], 1]);
  assert.equal(run.warnings.length, 1);
  assert.match(run.warnings[0], /BR-0002 is skipped: A repeat on a group/);
  assert.match(runRulesWords(run), /BR-0002 is skipped/);
  assert.match(rulesWords((await runTool(state, 'list_bank_rules', {})).data), /BR-0002: .*\(not applied: A repeat on a group/);
  assert.equal(state.bankLines[0].status, 'unmatched');

  const rules = ['NEFT.*SHARMA', '^UPI/\\d+/SWIGGY', 'IMPS\\s+\\d{6,}'].map((pattern, at) => ({ id: `BR-010${at}`, side: 'any', contains: '', pattern, minAmount: null, maxAmount: null, then: { kind: 'ignore' } }));
  const narrations = Array.from({ length: 1000 }, (_, at) => `${['NEFT CR SHARMA TRADERS UTR', 'UPI/4001', 'IMPS 7', 'POS 12'][at % 4]}${String(at).padStart(6, '0')}/SWIGGY ORDER `.padEnd(200, 'X'));
  const timed = performance.now();
  let hits = 0;
  for (const narration of narrations) {
    for (const rule of rules) if (ruleMatches(rule, { ...line, narration })) hits += 1;
  }
  const elapsed = performance.now() - timed;
  assert.equal(hits, 750);
  assert.ok(elapsed < 100, `${elapsed} ms for 3,000 rule checks`);
});

test('a match on a cash account is refused before anything posts when the cash is short, by hand, by rule, by the daily run and by book_bank_charges', async () => {
  const state = await pettyCashBook(1000);
  const transfers = state.ledger.transfers.length;
  const refused = await runTool(state, 'match_bank_line', { lineId: 'BL-000001', kind: 'expense', head: '5100' });
  assert.equal(refused.error, 'INSUFFICIENT_CASH');
  assert.equal(refused.balance, 1000);
  assert.equal(refused.amount, 5000);
  assert.equal(state.ledger.transfers.length, transfers, 'nothing was posted');
  assert.equal(state.expenses.length, 0);
  assert.equal(state.bankLines[0].status, 'unmatched');
  const preview = previewOf(state, 'match_bank_line', { lineId: 'BL-000001', kind: 'expense', head: '5100' });
  assert.match(preview.blockers[0], /There is not that much cash in hand\. Petty cash has ₹1,000\.00 and this line is ₹5,000\.00\./);

  const rule = await runTool(state, 'add_bank_rule', { contains: 'RAMESH', kind: 'expense', head: '5100' });
  assert.equal(rule.ok, true, JSON.stringify(rule));
  assert.deepEqual(rule.applied.made, []);
  assert.deepEqual(rule.applied.failed.map((row) => [row.lineId, row.ruleId, row.error]), [['BL-000001', 'BR-0001', 'INSUFFICIENT_CASH']]);
  assert.equal(state.ledger.transfers.length, transfers);
  const run = runDailyAutomation(state, { asOf: '2026-09-20', force: true });
  assert.equal(run.data.run.bankRules.failed[0].error, 'INSUFFICIENT_CASH');
  assert.equal(state.ledger.transfers.length, transfers);
  assert.equal(state.expenses.length, 0);

  await heldImport(state, statement([['10-09-2026', 'BANK CHARGES SMS ALERT', 2500, 0]]), { account: 'Petty cash' });
  const charges = await runTool(state, 'book_bank_charges', { account: 'Petty cash' });
  assert.deepEqual(charges.booked, []);
  assert.ok(charges.skipped.some((row) => row.lineId === 'BL-000002' && row.reason === 'INSUFFICIENT_CASH'), JSON.stringify(charges.skipped));
  assert.equal(state.ledger.transfers.length, transfers);

  const topUp = await runTool(state, 'record_transfer', { fromAccount: 'Bank', toAccount: 'Petty cash', amount: 4000, date: '2026-09-02' });
  assert.equal(topUp.ok, true);
  const booked = await runTool(state, 'match_bank_line', { lineId: 'BL-000001', kind: 'expense', head: '5100' });
  assert.equal(booked.ok, true, JSON.stringify(booked));
  assert.equal(booked.warning, undefined);
  assert.equal(booked.line.status, 'booked');
  assert.deepEqual(booked.posted.map((item) => item.kind), ['expense', 'transfer']);
  assert.equal(balanceOf(state, '1003'), 0);
  assert.equal(balanceOf(state, '1002'), -5000);
  assert.equal(state.ledger.transfers.at(-1).code, 'CONTRA');
  assert.equal((await runTool(state, 'match_bank_line', { lineId: 'BL-000001', kind: 'expense', head: '5100' })).error, 'LINE_NOT_OPEN');
  assert.equal(state.expenses.length, 1);

  const missing = await pettyCashBook(10000);
  missing.ledger.accounts.delete(1003n);
  const gone = await runTool(missing, 'match_bank_line', { lineId: 'BL-000001', kind: 'expense', head: '5100' });
  assert.equal(gone.error, 'ACCOUNT_NOT_FOUND');
  assert.equal(missing.expenses.length, 0);
});

test('when the ledger refuses the move after the document posted, the line is booked with a warning instead of being left open', async () => {
  const state = await pettyCashBook(5000);
  const line = findBankLine(state, 'BL-000001');
  const planned = planMatch(state, line, { kind: 'expense', head: '5100' });
  assert.equal(planned.ok, true, JSON.stringify(planned));
  const drained = await runTool(state, 'record_transfer', { fromAccount: 'Petty cash', toAccount: 'Bank', amount: 3000, date: '2026-09-02' });
  assert.equal(drained.ok, true);
  const applied = applyMatch(state, line, planned.plan);
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(applied.warning, 'booked, but could not be moved to Petty cash (1003): the account would go below zero (exceeds_debits). The entry sits against Bank (1002) until you move it.');
  assert.equal(line.status, 'booked');
  assert.equal(line.match.kind, 'expense');
  assert.equal(line.match.id, 'EXP-0001');
  assert.deepEqual(line.match.transferIds, state.expenses[0].transferIds.map(String));
  assert.equal(line.match.note, 'relocationFailed: exceeds_debits');
  assert.deepEqual(applied.posted.map((item) => item.kind), ['expense']);
  assert.equal(matchWords(applied), 'BL-000001 (₹5,000.00 out) booked as an expense (EXP-0001), but could not be moved to Petty cash (1003): the account would go below zero (exceeds_debits). The entry sits against Bank (1002) until you move it.');
  assert.equal(state.expenses.length, 1);
  assert.equal(planMatch(state, line, { kind: 'expense', head: '5100' }).error, 'LINE_NOT_OPEN');
  const booksView = await runTool(state, 'bank_reconciliation', { account: 'Petty cash' });
  assert.equal(booksView.data.totals.lines.booked, 1);
  assert.equal(booksView.data.totals.lines.unmatched, 0);

  const charges = await pettyCashBook(0);
  await heldImport(charges, statement([['10-09-2026', 'BANK CHARGES SMS ALERT', 25, 0]]), { account: 'Petty cash' });
  await runTool(charges, 'record_transfer', { fromAccount: 'Bank', toAccount: 'Petty cash', amount: 25, date: '2026-09-02' });
  const chargeLine = findBankLine(charges, 'BL-000002');
  const chargePlan = planMatch(charges, chargeLine, { kind: 'charge' });
  assert.equal(chargePlan.ok, true, JSON.stringify(chargePlan));
  await runTool(charges, 'record_transfer', { fromAccount: 'Petty cash', toAccount: 'Bank', amount: 25, date: '2026-09-03' });
  const chargeApplied = applyMatch(charges, chargeLine, chargePlan.plan);
  assert.equal(chargeApplied.ok, true);
  assert.match(chargeApplied.warning, /^booked, but could not be moved to Petty cash \(1003\)/);
  assert.match(chargesWords({ booked: [{ lineId: 'BL-000002', kind: 'charge', id: 'EXP-0001', amount: 25, warning: chargeApplied.warning }], skipped: [], total: { charges: 25, interest: 0 } }), /BL-000002 booked, but could not be moved to Petty cash \(1003\)/);
});

test('two same-day receipts against one invoice are two movements, a GST expense stays one movement, and a relocated receipt nets out of the bank view', async () => {
  const state = createState();
  invoiceFor(state, 'INV-0001', '2026-09-01', 20000);
  assert.equal(recordReceipt(state, { invoiceId: 'INV-0001', amount: 12000, date: '2026-09-05', mode: 'bank' }).ok, true);
  assert.equal(recordReceipt(state, { invoiceId: 'INV-0001', amount: 8000, date: '2026-09-05', mode: 'bank' }).ok, true);
  const open = bookMovements(state, '1002', { linked: false });
  assert.deepEqual(open.map((movement) => [movement.docKind, movement.docId, movement.in, movement.transferIds.length]), [['receipt', 'INV-0001', 12000, 1], ['receipt', 'INV-0001', 8000, 1]]);
  assert.notEqual(open[0].transferId, open[1].transferId);

  await heldImport(state, statement([['10-09-2026', 'NEFT CR SHARMA TRADERS A', 0, 12000], ['10-09-2026', 'NEFT CR SHARMA TRADERS B', 0, 8000]]));
  assert.deepEqual(state.bankLines.map((line) => line.status), ['unmatched', 'unmatched'], 'five days apart, so nothing links at import');
  const view = await runTool(state, 'bank_reconciliation', {});
  const byId = Object.fromEntries(view.data.lines.map((line) => [line.id, line]));
  assert.deepEqual(byId['BL-000001'].suggestions.filter((item) => item.kind === 'books').map((item) => [item.docId, item.amount]), [['INV-0001', 12000]]);
  assert.deepEqual(byId['BL-000002'].suggestions.filter((item) => item.kind === 'books').map((item) => [item.docId, item.amount]), [['INV-0001', 8000]]);
  assert.deepEqual(view.data.books.map((row) => row.in).sort((a, b) => a - b), [8000, 12000]);
  const first = await runTool(state, 'match_bank_line', { lineId: 'BL-000001', kind: 'books' });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.line.match.kind, 'books');
  assert.equal(first.line.match.id, 'INV-0001');
  assert.equal(first.line.match.transferIds.length, 1);
  const second = await runTool(state, 'match_bank_line', { lineId: 'BL-000002', kind: 'books' });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.line.match.kind, 'books');
  assert.notDeepEqual(second.line.match.transferIds, first.line.match.transferIds);
  assert.equal((await runTool(state, 'bank_reconciliation', {})).data.books.length, 0);
  assert.equal(state.invoices[0].receipts.length, 2);
  assert.equal(balanceOf(state, '1002'), 20000);

  const gst = createState();
  const expense = postExpense(gst, { narration: 'Printer paper', amount: 11800, gstRate: 18, date: '2026-09-05', mode: 'bank', payee: 'Stationers', supplierGstin: '27AAACS1234A1Z5' });
  assert.equal(expense.ok, true, JSON.stringify(expense));
  assert.equal(expense.expense.transferIds.length, 3, 'the taxable part, CGST and SGST are separate ledger rows');
  const gstOpen = bookMovements(gst, '1002', { linked: false });
  assert.deepEqual(gstOpen.map((movement) => [movement.docId, movement.out]), [['EXP-0001', 11800]]);
  await heldImport(gst, statement([['06-09-2026', 'UPI DR STATIONERS', 11800, 0]]));
  assert.equal(gst.bankLines[0].status, 'matched');
  assert.equal(gst.bankLines[0].match.id, 'EXP-0001');

  const moved = createState();
  await runTool(moved, 'set_bank_account', { label: 'HDFC current', kind: 'bank' });
  invoiceFor(moved, 'INV-0001', '2026-09-01', 12000);
  invoiceFor(moved, 'INV-0002', '2026-09-01', 12000);
  await heldImport(moved, statement([['05-09-2026', 'NEFT CR SHARMA TRADERS', 0, 12000]]), { account: 'HDFC current' });
  const relocated = await runTool(moved, 'match_bank_line', { lineId: 'BL-000001', kind: 'receipt', invoiceId: 'INV-0001' });
  assert.equal(relocated.ok, true, JSON.stringify(relocated));
  assert.deepEqual(relocated.posted.map((item) => item.kind), ['receipt', 'transfer']);
  assert.deepEqual(bookMovements(moved, '1002', {}), [], 'the receipt and its move cancel out on the bank');
  assert.equal(balanceOf(moved, '1003'), 12000);
  assert.equal(balanceOf(moved, '1002'), 0);
});

test('a receipt or payment recorded by hand days earlier is linked by party name instead of being posted again, by hand and by rule', async () => {
  function booksWithEarlyReceipt() {
    const state = createState();
    invoiceFor(state, 'INV-0001', '2026-08-20', 10000, 18);
    invoiceFor(state, 'INV-0002', '2026-08-25', 10000, 18);
    assert.equal(recordReceipt(state, { invoiceId: 'INV-0001', amount: 11800, date: '2026-08-29', mode: 'bank' }).ok, true);
    return state;
  }
  const state = booksWithEarlyReceipt();
  await heldImport(state, statement([['08-09-2026', 'NEFT CR SHARMA TRADERS UTR123', 0, 11800]]));
  assert.equal(state.bankLines[0].status, 'unmatched', 'ten days apart is beyond the import link window');
  const out = await runTool(state, 'match_bank_line', { lineId: 'BL-000001', kind: 'receipt', partyName: 'Sharma Traders' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.line.status, 'matched');
  assert.equal(out.line.match.kind, 'books');
  assert.equal(out.line.match.id, 'INV-0001');
  assert.deepEqual(out.posted, []);
  assert.equal(state.invoices[0].receipts.length, 1);
  assert.equal((state.invoices[1].receipts || []).length, 0, 'INV-0002 stays open');
  assert.equal(balanceOf(state, '1002'), 11800);
  assert.match(matchWords(out), /matched to INV-0001 already in the books\. Nothing new was posted\./);

  const ruled = booksWithEarlyReceipt();
  await heldImport(ruled, statement([['08-09-2026', 'NEFT CR SHARMA TRADERS UTR123', 0, 11800]]));
  const rule = await runTool(ruled, 'add_bank_rule', { contains: 'SHARMA TRADERS', kind: 'receipt', partyName: 'Sharma Traders' });
  assert.equal(rule.ok, true, JSON.stringify(rule));
  assert.deepEqual(rule.applied.made, [{ lineId: 'BL-000001', ruleId: 'BR-0001', kind: 'books', ids: ['INV-0001'] }]);
  assert.equal(ruled.bankLines[0].status, 'matched');
  assert.equal(ruled.invoices[0].receipts.length, 1);
  assert.equal((ruled.invoices[1].receipts || []).length, 0);

  const late = booksWithEarlyReceipt();
  await heldImport(late, statement([['12-09-2026', 'NEFT CR SHARMA TRADERS UTR123', 0, 11800]]));
  const posted = await runTool(late, 'match_bank_line', { lineId: 'BL-000001', kind: 'receipt', partyName: 'Sharma Traders' });
  assert.equal(posted.ok, true, JSON.stringify(posted));
  assert.equal(posted.line.status, 'booked', 'fourteen days apart is a new receipt against the open invoice');
  assert.deepEqual(posted.posted.map((item) => [item.kind, item.id]), [['receipt', 'INV-0002']]);

  const bills = createState();
  const bill = createPurchase(bills, { id: 'BILL-0001', date: '2026-08-20', partyName: 'Fabric Co', lines: [{ description: 'Cloth', rate: 5000, gstRate: 0 }] });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  assert.equal(recordPayment(bills, { billId: 'BILL-0001', amount: 5000, date: '2026-08-30', mode: 'bank' }).ok, true);
  await heldImport(bills, statement([['08-09-2026', 'NEFT DR FABRIC CO', 5000, 0]]));
  const paid = await runTool(bills, 'match_bank_line', { lineId: 'BL-000001', kind: 'payment', partyName: 'Fabric Co' });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  assert.equal(paid.line.status, 'matched');
  assert.equal(paid.line.match.id, 'BILL-0001');
  assert.deepEqual(paid.posted, []);
  assert.equal(balanceOf(bills, '1002'), -5000);
});

test('GST reconciliation sentences reach gst_reconcile and bank sentences reach bank_reconciliation', () => {
  const state = createState();
  const routeFor = (text) => ROUTES.find((route) => route.re.test(text))?.tool;
  for (const text of ['reconcile my GSTR-2B statement', 'reconcile 2B with the purchase register and bank', 'reconcile GSTR-2B', 'reconcile the purchase register']) {
    assert.equal(routeFor(text), 'gst_reconcile', text);
    assert.equal(planLocalToolCall(state, text).name, 'gst_reconcile', text);
  }
  for (const text of ['reconcile bank', 'match my bank statement', 'reconcile the bank statement', 'bank statement reconciliation please']) {
    assert.equal(routeFor(text), 'bank_reconciliation', text);
    assert.equal(planLocalToolCall(state, text).name, 'bank_reconciliation', text);
  }
  assert.notEqual(routeFor('reconcile TDS against 26AS'), 'bank_reconciliation');
  assert.notEqual(planLocalToolCall(state, 'reconcile TDS against 26AS').name, 'bank_reconciliation');
});

test('the transfer planner leaves stock transfers, purposeful withdrawals and unreadable dates alone', () => {
  const state = createState();
  const stock = planLocalToolCall(state, 'transfer 50 SKU-A from 27AAACS1234A1Z5 to 29AAACS1234A1Z1');
  assert.equal(stock.name, 'record_stock_transfer', JSON.stringify(stock));
  assert.deepEqual(stock.args, { sku: 'SKU-A', qty: 50, fromGstin: '27AAACS1234A1Z5', toGstin: '29AAACS1234A1Z1' });
  for (const text of ['withdrew 5000 from bank for tea', 'withdrew 5000 from bank to pay the electrician', 'moved 50 cartons from godown to shop']) {
    const plan = planLocalToolCall(state, text);
    assert.notEqual(plan.name, 'record_transfer', text);
    assert.doesNotMatch(String(plan.reply || ''), /own account/, text);
  }
  const plain = planLocalToolCall(state, 'withdrew 5000 from bank');
  assert.deepEqual([plain.name, plain.args], ['record_transfer', { fromAccount: '1002', toAccount: '1001', amount: 5000 }]);
  const rupees = planLocalToolCall(state, 'transferred 50000 rupees from bank to cash');
  assert.deepEqual([rupees.name, rupees.args], ['record_transfer', { fromAccount: '1002', toAccount: '1001', amount: 50000 }]);
  for (const [text, said] of [['transferred 50000 from bank to cash on 31 February', '31 February'], ['moved 2000 from bank to cash on 32/13/2026', '32/13/2026']]) {
    const plan = planLocalToolCall(state, text);
    assert.equal(plan.kind, 'reply', text);
    assert.equal(plan.blocked, true, text);
    assert.match(plan.reply, new RegExp(`I could not read the date "${said}"`), text);
    assert.match(plan.reply, /nothing was recorded/, text);
  }
  const relative = planLocalToolCall(state, 'moved 2000 from bank to cash yesterday');
  assert.equal(relative.blocked, true, JSON.stringify(relative));
  assert.match(relative.reply, /Say the date in words/);
  assert.match(planLocalToolCall(createState(), 'moved 2 lakh from HDFC to ICICI').reply, /do not know an own account called "HDFC" or "ICICI"/);
});

test('"remember this" says exactly which rule is saved, or that none is, and the saved rule matches the shown text', async () => {
  const state = createState();
  invoiceFor(state, 'INV-0002', '2026-09-02', 10000, 18);
  invoiceFor(state, 'INV-0003', '2026-09-03', 8200);
  await heldImport(state, statement([['06-09-2026', 'BANK CHARGES SMS ALERT', 25, 0], ['08-09-2026', 'NEFT CR SHARMA TRADERS UTR555', 0, 20000], ['09-09-2026', 'IMPS DR RAMESH RENT', 5000, 0], ['09-09-2026', 'UPI DR 9876543210', 1200, 0], ['10-09-2026', 'POS DR CAFE', 300, 0]]));
  const sharma = { lineId: 'BL-000002', kind: 'receipt', partyName: 'sharma traders', remember: true };
  const saved = previewOf(state, 'match_bank_line', sharma);
  assert.deepEqual(saved.blockers, []);
  assert.ok(saved.effects.includes("A rule is saved: lines containing 'SHARMA TRADERS' are receipts from Sharma Traders"), JSON.stringify(saved.effects));
  const line = findBankLine(state, 'BL-000002');
  const plan = planMatch(state, line, sharma).plan;
  assert.equal(ruleFromMatch(line, plan, sharma).words, "A rule is saved: lines containing 'SHARMA TRADERS' are receipts from Sharma Traders");
  const out = await runTool(state, 'match_bank_line', sharma);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.rule.contains, 'SHARMA TRADERS');
  assert.deepEqual([out.rule.id, out.rule.side, out.rule.then.kind, out.rule.then.partyName], ['BR-0001', 'in', 'receipt', 'Sharma Traders']);
  assert.match(matchWords(out), /booked as a receipt against INV-0002, INV-0003\. Saved BR-0001: lines containing 'SHARMA TRADERS' are receipts from Sharma Traders\.$/);

  const vague = { lineId: 'BL-000004', kind: 'expense', head: '5100', remember: true };
  const none = previewOf(state, 'match_bank_line', vague);
  assert.ok(none.effects.includes('No rule is saved: there is nothing in this narration to recognise it by'), JSON.stringify(none.effects));
  const posted = await runTool(state, 'match_bank_line', vague);
  assert.equal(posted.ok, true, JSON.stringify(posted));
  assert.equal(posted.rule, undefined);
  assert.equal(state.bankRules.length, 1);
  assert.match(matchWords(posted), /booked as an expense \(EXP-0001\)\. No rule is saved: there is nothing in this narration to recognise it by\.$/);

  const ignore = { lineId: 'BL-000003', kind: 'ignore', note: 'checking', remember: true };
  const quiet = previewOf(state, 'match_bank_line', ignore);
  assert.ok(quiet.effects.includes('No rule is saved: an ignored line is not remembered as a rule'), JSON.stringify(quiet.effects));
  const ignored = await runTool(state, 'match_bank_line', ignore);
  assert.equal(ignored.ok, true);
  assert.equal(ignored.rule, undefined);
  assert.equal(state.bankRules.length, 1);
  assert.match(matchWords(ignored), /ignored: checking\. No rule is saved: an ignored line is not remembered as a rule\.$/);

  const charge = previewOf(state, 'match_bank_line', { lineId: 'BL-000001', kind: 'charge', remember: true });
  assert.ok(charge.effects.includes("A rule is saved: lines containing 'CHARGES' are bank charges"), JSON.stringify(charge.effects));
  const charged = await runTool(state, 'match_bank_line', { lineId: 'BL-000001', kind: 'charge', remember: true });
  assert.equal(charged.rule.contains, 'CHARGES');
  assert.deepEqual([charged.rule.then.kind, charged.rule.then.head, charged.rule.side], ['charge', '5180', 'out']);
  const forgetful = previewOf(state, 'match_bank_line', { lineId: 'BL-000005', kind: 'expense', head: '5100' });
  assert.deepEqual(forgetful.effects, ['The statement line is settled and is not suggested again.']);
});

test('a statement of 20,000 rows imports in linear time and the line counter catches up when it is behind', async () => {
  const rows = [];
  let balance = 1000000;
  for (let at = 0; at < 20000; at += 1) {
    const day = String(1 + (at % 28)).padStart(2, '0');
    const month = String(1 + (Math.floor(at / 28) % 12)).padStart(2, '0');
    const out = 10 + (at % 97);
    balance = Math.round((balance - out) * 100) / 100;
    rows.push(`${day}-${month}-2026,UPI DR ${String(at).padStart(6, '0')} SHOP ${at % 13},,${out.toFixed(2)},,${balance.toFixed(2)}`);
  }
  const content = ['Date,Narration,Chq/Ref Number,Withdrawal Amt,Deposit Amt,Balance', ...rows].join('\n');
  const state = createState();
  const started = performance.now();
  const out = await heldImport(state, content, { fileName: 'big.csv' });
  const elapsed = performance.now() - started;
  assert.equal(out.data.lines.added, 20000);
  assert.equal(state.bankLines.length, 20000);
  assert.equal(state.bankLineSeq, 20000);
  assert.equal(state.bankLines.at(-1).id, 'BL-020000');
  assert.ok(elapsed < 3000, `${Math.round(elapsed)} ms for 20,000 rows`);

  const behind = createState();
  await heldImport(behind, statement([['05-09-2026', 'NEFT CR ONE', 0, 100], ['06-09-2026', 'NEFT CR TWO', 0, 200]]));
  behind.bankLineSeq = 0;
  await heldImport(behind, statement([['07-09-2026', 'NEFT CR THREE', 0, 300]]), { fileName: 'next.csv' });
  assert.deepEqual(behind.bankLines.map((line) => line.id), ['BL-000001', 'BL-000002', 'BL-000003']);
  assert.equal(behind.bankLineSeq, 3);
});

test('the safe pattern check is part of bank-recon.mjs: an unsafe stored pattern and one the engine cannot compile are both named, and the bank engine is three modules', () => {
  assert.match(rulePatternProblem({ pattern: '(a+)+$' }), /group/);
  assert.equal(rulePatternProblem({ pattern: '[z-a]' }), 'It is not a regular expression I can run.');
  assert.equal(rulePatternProblem({ pattern: 'NEFT.*SHARMA' }), '');
  assert.equal(rulePatternProblem({ pattern: '' }), '');
  assert.equal(rulePatternProblem({}), '');
  const line = { id: 'BL-000001', account: '1002', date: '2026-09-01', narration: 'z', in: 0, out: 10, status: 'unmatched', match: null };
  assert.equal(ruleMatches({ pattern: '[z-a]' }, line), false, 'a pattern that does not compile never matches');
  assert.equal(ruleMatches({ pattern: '[a-z]' }, line), true);
  const src = new URL('../src/', import.meta.url);
  assert.equal(existsSync(new URL('bank-pattern.mjs', src)), false);
  assert.deepEqual(readdirSync(src).filter((name) => name.startsWith('bank-')).sort(), ['bank-intent.mjs', 'bank-recon.mjs', 'bank-rules.mjs']);
});
