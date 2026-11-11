import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { CONFIRM_TOOLS, previewOf } from '../src/chat-confirm.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { ENGINE_WRITE_TOOLS } from '../src/countries/manifests.mjs';
import { validateAssistantToolCall, planLocalToolCall } from '../src/assistant-contract.mjs';
import { toolServesCountry } from '../src/country.mjs';
import { createInvoice, recordReceipt } from '../src/invoice.mjs';
import { postExpense } from '../src/expenses.mjs';
import { listAccounts } from '../src/ledger.mjs';
import { lockPeriod } from '../src/period-lock.mjs';
import { refreshExceptions, listExceptions } from '../src/exceptions.mjs';
import { runDailyAutomation } from '../src/automation.mjs';
import { isImport } from '../src/import-documents.mjs';
import { localToday } from '../src/dates.mjs';

const BANK_TOOLS = ['bank_reconciliation', 'match_bank_line', 'unmatch_bank_line', 'book_bank_charges', 'add_bank_rule', 'remove_bank_rule', 'list_bank_rules', 'run_bank_rules', 'set_bank_account', 'list_bank_accounts', 'record_transfer'];
const BANK_WRITES = BANK_TOOLS.filter((name) => !['bank_reconciliation', 'list_bank_rules', 'list_bank_accounts'].includes(name));

function statement(rows) {
  let balance = 0;
  const body = rows.map(([date, narration, out, inn]) => {
    balance = Math.round((balance + (inn || 0) - (out || 0)) * 100) / 100;
    return `${date},${narration},,${out ? out.toFixed(2) : ''},${inn ? inn.toFixed(2) : ''},${balance.toFixed(2)}`;
  });
  return ['Date,Narration,Chq/Ref Number,Withdrawal Amt,Deposit Amt,Balance', ...body].join('\n');
}

const SEPTEMBER = statement([
  ['05-09-2026', 'NEFT CR SHARMA TRADERS UTR123', 0, 11800],
  ['06-09-2026', 'BANK CHARGES SMS ALERT', 25, 0],
  ['07-09-2026', 'INTEREST CREDITED SAVINGS', 0, 150],
  ['08-09-2026', 'NEFT CR SHARMA TRADERS UTR555', 0, 20000],
  ['09-09-2026', 'IMPS DR RAMESH RENT', 5000, 0],
]);

function balanceOf(state, code) {
  const row = listAccounts(state.ledger).find((account) => account.code === code);
  return row ? Math.round((row.debitsPosted - row.creditsPosted) * 100) / 100 : 0;
}

function booksWithSharma() {
  const state = createState();
  createInvoice(state, { id: 'INV-0001', date: '2026-09-01', partyName: 'Sharma Traders', lines: [{ description: 'Supply', rate: 10000, gstRate: 18 }] });
  createInvoice(state, { id: 'INV-0002', date: '2026-09-02', partyName: 'Sharma Traders', lines: [{ description: 'Supply', rate: 10000, gstRate: 18 }] });
  createInvoice(state, { id: 'INV-0003', date: '2026-09-03', partyName: 'Sharma Traders', lines: [{ description: 'Supply', rate: 8200, gstRate: 0 }] });
  const receipt = recordReceipt(state, { invoiceId: 'INV-0001', amount: 11800, date: '2026-09-05', mode: 'bank' });
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  return state;
}

async function heldImport(state, content = SEPTEMBER, extra = {}) {
  const out = await runTool(state, 'import_bank', { content, type: 'csv', post: 'hold', fileName: 'sept.csv', ...extra });
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300));
  return out;
}

test('a held import keeps every row as a line, links the receipt already in the books and never posts it twice', async () => {
  const state = booksWithSharma();
  assert.equal(balanceOf(state, '1002'), 11800);
  const preview = previewOf(state, 'import_bank', { content: SEPTEMBER, type: 'csv', post: 'hold' });
  assert.match(preview.summary, /1 line is already in the books and will be linked, 0 are covered by your rules, 4 will wait for you to match/);
  assert.match(previewOf(state, 'import_bank', { content: SEPTEMBER, type: 'csv' }).summary, /4 will be posted to guessed heads/);

  const first = await heldImport(state);
  assert.deepEqual({ ...first.data.lines, ruleFailures: undefined }, { added: 5, existing: 0, matched: 1, byRules: 0, posted: 0, unmatched: 4, transfersGuessed: 0, account: '1002', mode: 'hold', ruleFailures: undefined });
  assert.equal(first.data.ledger.posted, 0);
  assert.equal(state.bankLines.length, 5);
  const linked = state.bankLines[0];
  assert.equal(linked.id, 'BL-000001');
  assert.equal(linked.status, 'matched');
  assert.equal(linked.match.kind, 'books');
  assert.equal(linked.match.id, 'INV-0001');
  assert.equal(linked.match.transferIds.length, 1);
  assert.equal(linked.fingerprint.startsWith('BANK-'), true);
  assert.equal(linked.tieBreak, false);
  assert.equal(state.bankLines[1].category, 'finance_cost');
  assert.equal(state.bankLines[2].category, 'interest_income');
  assert.equal(balanceOf(state, '1002'), 11800, 'the linked receipt is not posted again');
  assert.equal(state.invoices.find((inv) => inv.id === 'INV-0001').receipts.length, 1);

  const again = await runTool(state, 'import_bank', { content: SEPTEMBER, type: 'csv' });
  assert.equal(again.ok, true);
  assert.equal(again.data.lines.added, 0);
  assert.equal(again.data.lines.existing, 5);
  assert.equal(again.data.ledger.posted, 0);
  assert.equal(again.data.ledger.skipped.every((row) => row.reason === 'exists'), true);
  assert.equal(state.bankLines.length, 5);
  assert.equal(balanceOf(state, '1002'), 11800);

  const copy = deserialize(serialize(state));
  assert.equal(copy.bankLines.length, 5);
  assert.equal(copy.bankLineSeq, 5);
  assert.deepEqual(copy.bankRules, []);
});

test('a row that breaks the running balance is flagged on its line, and an auto import posts charges to 5180 and interest to 4100', async () => {
  const broken = statement([
    ['05-09-2026', 'NEFT CR SHARMA TRADERS UTR123', 0, 11800],
    ['06-09-2026', 'BANK CHARGES SMS ALERT', 25, 0],
    ['07-09-2026', 'INTEREST CREDITED SAVINGS', 0, 150],
  ]).replace('11925.00', '11900.00');
  const state = createState();
  const out = await runTool(state, 'import_bank', { content: broken, type: 'csv' });
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300));
  assert.deepEqual(state.bankLines.map((line) => line.tieBreak), [false, false, true]);
  assert.equal(out.data.lines.posted, 3);
  assert.deepEqual(state.bankLines.map((line) => [line.status, line.match.kind]), [['booked', 'auto'], ['booked', 'auto'], ['booked', 'auto']]);
  const accounts = listAccounts(state.ledger);
  assert.equal(accounts.find((account) => account.code === '5180').debitsPosted, 25);
  assert.equal(accounts.find((account) => account.code === '4100').creditsPosted, 150);
  assert.equal(accounts.find((account) => account.code === '4100').name, 'Interest income');
});

test('bank_reconciliation shows the balances, the open lines with suggestions and what is in the books but not on the statement', async () => {
  const state = booksWithSharma();
  await heldImport(state);
  const expense = postExpense(state, { narration: 'Shop rent September', amount: 5000, gstRate: 0, date: '2026-09-09', mode: 'bank', payee: 'Ramesh' });
  assert.equal(expense.ok, true, JSON.stringify(expense));

  const out = await runTool(state, 'bank_reconciliation', {});
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300));
  const { data } = out;
  assert.deepEqual(data.account, { id: '1002', label: 'Bank', kind: 'bank' });
  assert.deepEqual(data.totals, { statementBalance: 26925, statementOn: '2026-09-09', booksBalance: 6800, difference: 20125, lines: { unmatched: 4, matched: 1, booked: 0, ignored: 0 }, unmatchedIn: 20150, unmatchedOut: 5025 });
  assert.equal(data.reconciledThrough, '2026-09-05');
  assert.equal(data.from, '2026-06-11');
  assert.equal(data.to, '2026-09-09');
  assert.deepEqual(data.lines.map((line) => line.id), ['BL-000005', 'BL-000004', 'BL-000003', 'BL-000002', 'BL-000001']);
  assert.deepEqual(data.books.map((row) => [row.docKind, row.docId, row.out]), [['expense', 'EXP-0001', 5000]]);

  const byId = Object.fromEntries(data.lines.map((line) => [line.id, line]));
  assert.deepEqual(byId['BL-000001'].suggestions, []);
  assert.equal(byId['BL-000005'].suggestions[0].kind, 'books');
  assert.equal(byId['BL-000005'].suggestions[0].docId, 'EXP-0001');
  assert.equal(byId['BL-000005'].suggestions[0].docKind, 'expense');
  assert.equal(byId['BL-000005'].suggestions[0].party, 'Ramesh');
  const receipt = byId['BL-000004'].suggestions.find((item) => item.kind === 'receipt');
  assert.deepEqual({ ...receipt, why: undefined }, { kind: 'receipt', partyName: 'Sharma Traders', invoiceIds: ['INV-0002', 'INV-0003'], amount: 20000, why: undefined });
  assert.deepEqual(byId['BL-000002'].suggestions.map((item) => [item.kind, item.head]), [['charge', '5180']]);
  assert.deepEqual(byId['BL-000003'].suggestions.map((item) => item.kind), ['interest']);
  assert.deepEqual(data.accounts.map((account) => [account.id, account.label, account.balance]), [['1001', 'Cash', 0], ['1002', 'Bank', 6800]]);

  const open = await runTool(state, 'bank_reconciliation', { status: 'unmatched', limit: 2 });
  assert.deepEqual(open.data.lines.map((line) => line.id), ['BL-000005', 'BL-000004']);
  assert.equal((await runTool(state, 'bank_reconciliation', { status: 'odd' })).error, 'BAD_STATUS');
  assert.equal((await runTool(state, 'bank_reconciliation', { account: 'ICICI' })).error, 'ACCOUNT_NOT_FOUND');

  const linked = await runTool(state, 'match_bank_line', { lineId: 'BL-000005', kind: 'books' });
  assert.equal(linked.ok, true, JSON.stringify(linked));
  assert.equal(linked.line.status, 'matched');
  assert.equal(linked.line.match.id, 'EXP-0001');
  assert.deepEqual(linked.posted, []);
  assert.equal(balanceOf(state, '1002'), 6800);
  assert.equal((await runTool(state, 'bank_reconciliation', {})).data.books.length, 0);
});

test('a receipt match settles the oldest open invoices first and refuses when the line is more than what is open', async () => {
  const state = booksWithSharma();
  await heldImport(state);
  const out = await runTool(state, 'match_bank_line', { lineId: 'BL-000004', kind: 'receipt', partyName: 'Sharma Traders' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual(out.posted.map((item) => [item.kind, item.id]), [['receipt', 'INV-0002'], ['receipt', 'INV-0003']]);
  assert.equal(out.line.status, 'booked');
  assert.equal(out.line.match.kind, 'receipt');
  assert.equal(out.line.match.id, 'INV-0002, INV-0003');
  assert.equal(out.line.match.transferIds.length, 2);
  const second = state.invoices.find((inv) => inv.id === 'INV-0002');
  assert.deepEqual(second.receipts, [{ amount: 11800, date: '2026-09-08', mode: 'bank' }]);
  assert.equal(second.status, 'paid');
  assert.equal(state.invoices.find((inv) => inv.id === 'INV-0003').status, 'paid');
  assert.equal(balanceOf(state, '1002'), 31800);
  assert.equal((await runTool(state, 'match_bank_line', { lineId: 'BL-000004', kind: 'ignore' })).error, 'LINE_NOT_OPEN');

  const short = createState();
  createInvoice(short, { id: 'INV-0001', date: '2026-09-01', partyName: 'Sharma Traders', lines: [{ description: 'Supply', rate: 10000, gstRate: 18 }] });
  await heldImport(short, statement([['08-09-2026', 'NEFT CR SHARMA TRADERS UTR555', 0, 15000]]));
  const refused = await runTool(short, 'match_bank_line', { lineId: 'BL-000001', kind: 'receipt', partyName: 'Sharma Traders' });
  assert.equal(refused.error, 'RECEIPT_UNALLOCATED');
  assert.equal(refused.remainder, 3200);
  assert.deepEqual(refused.invoiceIds, ['INV-0001']);
  assert.equal(short.bankLines[0].status, 'unmatched');
  assert.equal(short.invoices[0].status, 'posted');
  assert.equal(balanceOf(short, '1002'), 0);
  assert.equal((await runTool(short, 'match_bank_line', { lineId: 'BL-000001', kind: 'receipt', partyName: 'Nobody Here' })).error, 'PARTY_NOT_FOUND');
  assert.equal((await runTool(short, 'match_bank_line', { lineId: 'BL-000001', kind: 'payment', partyName: 'Sharma Traders' })).error, 'SIDE_MISMATCH');
  assert.equal((await runTool(short, 'match_bank_line', { lineId: 'BL-000001', kind: 'receipt' })).error, 'PARTY_REQUIRED');
  assert.equal((await runTool(short, 'match_bank_line', { lineId: 'BL-000001', kind: 'magic' })).error, 'BAD_KIND');
  assert.equal((await runTool(short, 'match_bank_line', { lineId: 'BL-000999', kind: 'ignore' })).error, 'LINE_NOT_FOUND');

  const byInvoice = await runTool(booksWithSharma(), 'bank_reconciliation', {});
  assert.equal(byInvoice.ok, true);
});

test('matching by invoice id links the receipt already in the books instead of posting a second one', async () => {
  const state = booksWithSharma();
  await runTool(state, 'unmatch_bank_line', { lineId: 'BL-000001' });
  await heldImport(state);
  const opened = await runTool(state, 'unmatch_bank_line', { lineId: 'BL-000001' });
  assert.equal(opened.ok, true);
  const out = await runTool(state, 'match_bank_line', { lineId: 'BL-000001', kind: 'receipt', invoiceId: 'INV-0001' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.line.status, 'matched');
  assert.equal(out.line.match.kind, 'books');
  assert.deepEqual(out.posted, []);
  assert.equal(state.invoices[0].receipts.length, 1);
  assert.equal(balanceOf(state, '1002'), 11800);
});

test('charges and interest land on 5180 and 4100, by hand or with book_bank_charges', async () => {
  const state = booksWithSharma();
  await heldImport(state);
  const charge = await runTool(state, 'match_bank_line', { lineId: 'BL-000002', kind: 'charge' });
  assert.equal(charge.ok, true, JSON.stringify(charge));
  assert.deepEqual(charge.posted.map((item) => item.kind), ['charge']);
  assert.equal(state.expenses[0].head, '5180');
  assert.equal(state.expenses[0].amount, 25);
  assert.equal(state.expenses[0].date, '2026-09-06');
  const interest = await runTool(state, 'match_bank_line', { lineId: 'BL-000003', kind: 'interest' });
  assert.equal(interest.ok, true, JSON.stringify(interest));
  assert.equal(interest.line.match.kind, 'interest');
  const accounts = listAccounts(state.ledger);
  assert.equal(accounts.find((account) => account.code === '5180').debitsPosted, 25);
  assert.equal(accounts.find((account) => account.code === '4100').creditsPosted, 150);
  assert.equal(state.ledger.transfers.at(-1).code, 'INTEREST');
  assert.equal(balanceOf(state, '1002'), 11800 - 25 + 150);

  const bulk = booksWithSharma();
  await heldImport(bulk);
  const booked = await runTool(bulk, 'book_bank_charges', {});
  assert.equal(booked.ok, true, JSON.stringify(booked));
  assert.deepEqual(booked.booked.map((item) => [item.lineId, item.kind, item.amount]), [['BL-000002', 'charge', 25], ['BL-000003', 'interest', 150]]);
  assert.deepEqual(booked.total, { charges: 25, interest: 150 });
  assert.deepEqual(booked.skipped.map((item) => item.reason), ['NOT_A_CHARGE', 'NOT_A_CHARGE']);
  assert.equal(bulk.bankLines.filter((line) => line.status === 'booked').length, 2);
  assert.deepEqual((await runTool(bulk, 'book_bank_charges', {})).booked, []);
  const rent = await runTool(bulk, 'match_bank_line', { lineId: 'BL-000005', kind: 'expense', partyName: 'Ramesh' });
  assert.equal(rent.ok, true, JSON.stringify(rent));
  assert.equal(bulk.expenses.at(-1).tag.source, 'keyword', 'a narration with a clear word is tagged by it');
  assert.equal(bulk.expenses.at(-1).payee, 'Ramesh');

  const vague = createState();
  await heldImport(vague, statement([['09-09-2026', 'UPI DR 9876543210', 1200, 0]]));
  assert.equal((await runTool(vague, 'match_bank_line', { lineId: 'BL-000001', kind: 'expense' })).error, 'HEAD_REQUIRED');
  assert.equal(vague.expenses.length, 0, 'nothing is guessed');
  const chosen = await runTool(vague, 'match_bank_line', { lineId: 'BL-000001', kind: 'expense', head: '5100' });
  assert.equal(chosen.ok, true, JSON.stringify(chosen));
  assert.equal(vague.expenses[0].head, '5100');
  assert.equal((await runTool(vague, 'match_bank_line', { lineId: 'BL-000001', kind: 'expense', head: '9999' })).error, 'LINE_NOT_OPEN');
});

test('record_transfer posts one contra and the statement lines on both sides link to it', async () => {
  const state = createState();
  const added = await runTool(state, 'set_bank_account', { label: 'HDFC current', kind: 'bank', maskedNumber: '50100012341234', ifsc: 'HDFC0001234' });
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.equal(added.account.id, '1003');
  assert.equal(added.account.maskedNumber, 'XXXX1234');
  const accounts = await runTool(state, 'list_bank_accounts', {});
  assert.deepEqual(accounts.data.accounts.map((account) => [account.id, account.label, account.kind, account.builtIn]), [['1001', 'Cash', 'cash', true], ['1002', 'Bank', 'bank', true], ['1003', 'HDFC current', 'bank', false]]);
  assert.equal((await runTool(state, 'set_bank_account', { label: 'hdfc current', kind: 'bank' })).error, 'LABEL_TAKEN');
  assert.equal((await runTool(state, 'set_bank_account', { id: '1002', label: 'Main bank' })).error, 'BUILT_IN_ACCOUNT');
  assert.equal((await runTool(state, 'set_bank_account', { label: 'Petty', kind: 'cash', ifsc: 'nope' })).error, 'BAD_IFSC');
  const renamed = await runTool(state, 'set_bank_account', { id: '1003', label: 'HDFC main' });
  assert.equal(renamed.ok, true, JSON.stringify(renamed));
  assert.equal(renamed.created, false);
  assert.equal(state.ledger.accounts.get(1003n).name, 'HDFC main');

  recordReceipt(createInvoice(state, { id: 'INV-0001', date: '2026-09-01', partyName: 'Sharma Traders', lines: [{ description: 'Supply', rate: 100000, gstRate: 0 }] }).invoice ? state : state, { invoiceId: 'INV-0001', amount: 100000, date: '2026-09-02', mode: 'bank' });
  const moved = await runTool(state, 'record_transfer', { fromAccount: 'Bank', toAccount: 'HDFC main', amount: 50000, date: '2026-09-10', reference: 'own transfer' });
  assert.equal(moved.ok, true, JSON.stringify(moved));
  assert.equal(moved.transfer.id, 'CTR-0001');
  assert.deepEqual([moved.transfer.fromAccount, moved.transfer.toAccount, moved.transfer.amount], ['1002', '1003', 50000]);
  const contra = state.ledger.transfers.filter((row) => row.code === 'CONTRA');
  assert.equal(contra.length, 1);
  assert.deepEqual([contra[0].debitAccountId, contra[0].creditAccountId, contra[0].invoiceId], [1003n, 1002n, 'CTR-0001']);
  assert.equal(state.bankTransfers.length, 1);
  assert.equal(balanceOf(state, '1003'), 50000);
  assert.equal(balanceOf(state, '1002'), 50000);

  const bankSide = await heldImport(state, statement([['10-09-2026', 'NEFT DR OWN TRANSFER HDFC', 50000, 0]]));
  assert.equal(bankSide.data.lines.matched, 1);
  const hdfcSide = await heldImport(state, statement([['10-09-2026', 'NEFT CR FROM BANK', 0, 50000]]), { account: 'HDFC main' });
  assert.equal(hdfcSide.data.lines.account, '1003');
  assert.equal(hdfcSide.data.lines.matched, 1);
  const [bankLine, hdfcLine] = state.bankLines;
  assert.equal(bankLine.account, '1002');
  assert.equal(hdfcLine.account, '1003');
  assert.deepEqual(bankLine.match.transferIds, hdfcLine.match.transferIds);
  assert.equal(bankLine.match.id, 'CTR-0001');
  assert.equal(contra.length, state.ledger.transfers.filter((row) => row.code === 'CONTRA').length, 'linking posts nothing');
  const hdfcView = await runTool(state, 'bank_reconciliation', { account: 'HDFC main' });
  assert.equal(hdfcView.data.totals.booksBalance, 50000);
  assert.equal(hdfcView.data.totals.difference, 0);

  assert.equal((await runTool(state, 'record_transfer', { fromAccount: 'Bank', toAccount: '1002', amount: 10 })).error, 'SAME_ACCOUNT');
  assert.equal((await runTool(state, 'record_transfer', { fromAccount: 'Bank', toAccount: 'ICICI', amount: 10 })).error, 'ACCOUNT_NOT_FOUND');
  assert.equal((await runTool(state, 'record_transfer', { fromAccount: 'Bank', toAccount: 'Cash', amount: 0 })).error, 'BAD_AMOUNT');
  assert.equal((await runTool(state, 'record_transfer', { fromAccount: 'Cash', toAccount: 'Bank', amount: 10 })).error, 'INSUFFICIENT_CASH');
  assert.equal((await runTool(state, 'record_transfer', { fromAccount: 'Bank', toAccount: 'Cash', amount: 10, date: 'yesterday' })).error, 'INVALID_DATE');

  const fresh = createState();
  await runTool(fresh, 'set_bank_account', { label: 'HDFC current', kind: 'bank' });
  recordReceipt(createInvoice(fresh, { id: 'INV-0001', date: '2026-09-01', partyName: 'Sharma Traders', lines: [{ description: 'Supply', rate: 40000, gstRate: 0 }] }).invoice ? fresh : fresh, { invoiceId: 'INV-0001', amount: 40000, date: '2026-09-02', mode: 'bank' });
  await heldImport(fresh, statement([['12-09-2026', 'TRF TO HDFC', 20000, 0]]));
  const asTransfer = await runTool(fresh, 'match_bank_line', { lineId: 'BL-000001', kind: 'transfer', otherAccount: 'HDFC current' });
  assert.equal(asTransfer.ok, true, JSON.stringify(asTransfer));
  assert.deepEqual(asTransfer.posted.map((item) => [item.kind, item.id]), [['transfer', 'CTR-0001']]);
  assert.equal(fresh.bankLines[0].status, 'booked');
  const otherSide = await heldImport(fresh, statement([['12-09-2026', 'TRF FROM BANK', 0, 20000]]), { account: '1003' });
  assert.equal(otherSide.data.lines.matched, 1);
  assert.equal(fresh.bankLines[1].match.id, 'CTR-0001');
  assert.equal((await runTool(fresh, 'match_bank_line', { lineId: 'BL-000002', kind: 'transfer' })).error, 'LINE_NOT_OPEN');
});

test('rules book open lines now and on later imports, and an unallocated receipt rule leaves the line open with a failure', async () => {
  const state = booksWithSharma();
  await heldImport(state);
  const charge = await runTool(state, 'add_bank_rule', { contains: 'BANK CHARGES', kind: 'charge' });
  assert.equal(charge.ok, true, JSON.stringify(charge));
  assert.equal(charge.rule.id, 'BR-0001');
  assert.equal(charge.rule.side, 'out');
  assert.equal(charge.rule.then.head, '5180');
  assert.deepEqual(charge.applied, { made: [{ lineId: 'BL-000002', ruleId: 'BR-0001', kind: 'charge', ids: ['EXP-0001'] }], failed: [], left: 3 });
  assert.equal(state.bankLines[1].status, 'booked');
  assert.equal(state.bankLines[1].match.ruleId, 'BR-0001');
  assert.equal(state.bankRules[0].hits, 1);
  assert.equal(state.auditEvents.at(-1).action, 'bank_rule_applied');

  const receipt = await runTool(state, 'add_bank_rule', { contains: 'SHARMA TRADERS', kind: 'receipt', partyName: 'sharma traders' });
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  assert.equal(receipt.rule.then.partyName, 'Sharma Traders');
  assert.deepEqual(receipt.applied.made, [{ lineId: 'BL-000004', ruleId: 'BR-0002', kind: 'receipt', ids: ['INV-0002', 'INV-0003'] }]);
  assert.equal(state.invoices.every((inv) => inv.status === 'paid'), true);

  const october = statement([
    ['03-10-2026', 'BANK CHARGES SMS ALERT', 30, 0],
    ['04-10-2026', 'NEFT CR SHARMA TRADERS UTR777', 0, 5000],
  ]);
  const later = await heldImport(state, october, { fileName: 'oct.csv' });
  assert.equal(later.data.lines.byRules, 1);
  assert.equal(later.data.lines.unmatched, 1);
  assert.deepEqual(later.data.lines.ruleFailures.map((row) => [row.lineId, row.ruleId, row.error, row.remainder]), [['BL-000007', 'BR-0002', 'RECEIPT_UNALLOCATED', 5000]]);
  assert.equal(state.bankLines[5].status, 'booked');
  assert.equal(state.bankLines[6].status, 'unmatched');
  assert.equal(state.bankRules[0].hits, 2);

  const dry = await runTool(state, 'run_bank_rules', { dryRun: true });
  assert.deepEqual([dry.made, dry.failed.map((row) => row.error), dry.left], [[], ['RECEIPT_UNALLOCATED'], 3]);
  const run = runDailyAutomation(state, { asOf: '2026-10-20', force: true });
  assert.equal(run.ok, true);
  assert.deepEqual(run.data.run.bankRules.made, []);
  assert.equal(run.data.run.bankRules.failed[0].error, 'RECEIPT_UNALLOCATED');
  assert.ok(run.data.run.warnings.some((text) => /BL-000007 was not booked by bank rule BR-0002/.test(text)), JSON.stringify(run.data.run.warnings));

  const listed = await runTool(state, 'list_bank_rules', {});
  assert.deepEqual(listed.data.rules.map((rule) => rule.id), ['BR-0001', 'BR-0002']);
  const removed = await runTool(state, 'remove_bank_rule', { id: 'BR-0001' });
  assert.equal(removed.ok, true);
  assert.deepEqual((await runTool(state, 'list_bank_rules', {})).data.rules.map((rule) => rule.id), ['BR-0002']);
  assert.equal((await runTool(state, 'remove_bank_rule', { id: 'BR-0009' })).error, 'RULE_NOT_FOUND');
  assert.equal(state.bankLines[1].status, 'booked', 'lines a removed rule booked stay');

  assert.equal((await runTool(state, 'add_bank_rule', { contains: 'X', kind: 'receipt' })).error, 'PARTY_REQUIRED');
  assert.equal((await runTool(state, 'add_bank_rule', { contains: 'X', kind: 'receipt', partyName: 'Nobody' })).error, 'PARTY_NOT_FOUND');
  assert.equal((await runTool(state, 'add_bank_rule', { kind: 'charge' })).error, 'MATCH_REQUIRED');
  assert.equal((await runTool(state, 'add_bank_rule', { contains: 'X', kind: 'expense' })).error, 'HEAD_REQUIRED');
  assert.equal((await runTool(state, 'add_bank_rule', { contains: 'X', kind: 'receipt', partyName: 'Sharma Traders', side: 'out' })).error, 'SIDE_MISMATCH');
  assert.equal((await runTool(state, 'add_bank_rule', { pattern: '(', kind: 'ignore' })).error, 'BAD_PATTERN');
  assert.equal((await runTool(state, 'add_bank_rule', { contains: 'X', kind: 'transfer' })).error, 'OTHER_ACCOUNT_REQUIRED');
  const quiet = await runTool(state, 'add_bank_rule', { pattern: 'SMS\\s+ALERT', kind: 'ignore', note: 'bank noise', applyNow: false });
  assert.equal(quiet.ok, true);
  assert.deepEqual(quiet.applied, { made: [], failed: [], left: 0 });
});

test('a matched or ignored line opens again, a booked line does not, and a locked period refuses new postings', async () => {
  const state = booksWithSharma();
  await heldImport(state);
  const opened = await runTool(state, 'unmatch_bank_line', { lineId: 'BL-000001' });
  assert.equal(opened.ok, true);
  assert.equal(opened.line.status, 'unmatched');
  assert.equal(opened.line.match, null);
  assert.equal(opened.was.id, 'INV-0001');
  assert.equal(balanceOf(state, '1002'), 11800);
  assert.equal((await runTool(state, 'unmatch_bank_line', { lineId: 'BL-000001' })).error, 'LINE_NOT_LINKED');
  assert.equal((await runTool(state, 'unmatch_bank_line', { lineId: 'BL-000777' })).error, 'LINE_NOT_FOUND');

  const ignored = await runTool(state, 'match_bank_line', { lineId: 'BL-000005', kind: 'ignore', note: 'bank error, reversed next month' });
  assert.equal(ignored.line.status, 'ignored');
  assert.equal(ignored.line.match.note, 'bank error, reversed next month');
  assert.equal((await runTool(state, 'unmatch_bank_line', { lineId: 'BL-000005' })).line.status, 'unmatched');

  const charge = await runTool(state, 'match_bank_line', { lineId: 'BL-000002', kind: 'charge' });
  assert.equal(charge.ok, true);
  const refused = await runTool(state, 'unmatch_bank_line', { lineId: 'BL-000002' });
  assert.equal(refused.error, 'BOOKED_LINE');
  assert.deepEqual(refused.ids, ['EXP-0001']);

  lockPeriod(state, '2026-09-30');
  assert.equal((await runTool(state, 'match_bank_line', { lineId: 'BL-000003', kind: 'interest' })).error, 'PERIOD_LOCKED');
  assert.equal((await runTool(state, 'match_bank_line', { lineId: 'BL-000004', kind: 'receipt', partyName: 'Sharma Traders' })).error, 'PERIOD_LOCKED');
  assert.equal((await runTool(state, 'record_transfer', { fromAccount: 'Bank', toAccount: 'Cash', amount: 100, date: '2026-09-15' })).error, 'PERIOD_LOCKED');
  assert.equal((await runTool(state, 'book_bank_charges', {})).booked.length, 0);
  const relinked = await runTool(state, 'match_bank_line', { lineId: 'BL-000001', kind: 'books' });
  assert.equal(relinked.ok, true, 'linking posts nothing, so the lock does not stop it');
  assert.equal(relinked.line.match.id, 'INV-0001');
  assert.deepEqual(state.bankLines.filter((line) => line.status === 'unmatched').map((line) => line.id), ['BL-000003', 'BL-000004', 'BL-000005']);
});

test('own accounts are owner only and ids are handed out from 1003', async () => {
  const state = createState();
  state.__actor = { userId: 'staff-1', role: 'staff' };
  const refused = await runTool(state, 'set_bank_account', { label: 'Petty cash', kind: 'cash' });
  assert.equal(refused.error, 'OWNER_ONLY');
  state.__actor = { userId: 'owner-1', role: 'admin' };
  const petty = await runTool(state, 'set_bank_account', { label: 'Petty cash', kind: 'cash' });
  assert.equal(petty.ok, true, JSON.stringify(petty));
  assert.equal(petty.account.id, '1003');
  assert.equal(petty.account.by, 'owner-1');
  assert.equal(state.ledger.accounts.get(1003n).flags, 2);
  assert.equal((await runTool(state, 'set_bank_account', { id: '1003', label: 'Petty cash', kind: 'bank' })).error, 'KIND_FIXED');
  assert.equal((await runTool(state, 'set_bank_account', { label: 'Wallet', kind: 'purse' })).error, 'BAD_KIND');
  assert.equal((await runTool(state, 'set_bank_account', { label: '' })).error, 'LABEL_REQUIRED');
  assert.equal((await runTool(state, 'set_bank_account', { label: 'Paytm', kind: 'wallet', maskedNumber: '12' })).error, 'BAD_ACCOUNT_NUMBER');
  assert.equal((await runTool(state, 'record_transfer', { fromAccount: 'Petty cash', toAccount: 'Bank', amount: 10 })).error, 'INSUFFICIENT_CASH');
});

test('chat sentences route to the bank tools with arguments the contract accepts', async () => {
  const state = createState();
  await runTool(state, 'set_bank_account', { label: 'HDFC current', kind: 'bank' });
  await runTool(state, 'set_bank_account', { label: 'ICICI savings', kind: 'bank' });
  const expected = [
    ['match bank', 'bank_reconciliation', {}],
    ['reconcile the bank', 'bank_reconciliation', {}],
    ['bank reconciliation', 'bank_reconciliation', {}],
    ['unmatched bank lines', 'bank_reconciliation', { status: 'unmatched' }],
    ['what is not matched on the statement', 'bank_reconciliation', { status: 'unmatched' }],
    ['NEFT from Sharma Traders is a receipt from Sharma Traders', 'add_bank_rule', { contains: 'Sharma Traders', kind: 'receipt', partyName: 'Sharma Traders' }],
    ['anything from Sharma Traders is a receipt', 'add_bank_rule', { contains: 'Sharma Traders', kind: 'receipt', partyName: 'Sharma Traders' }],
    ['always book SMS CHARGES as bank charges', 'add_bank_rule', { contains: 'SMS CHARGES', kind: 'charge' }],
    ['book the bank charges', 'book_bank_charges', {}],
    ['book bank charges and interest', 'book_bank_charges', {}],
    ['moved 2 lakh from HDFC to ICICI', 'record_transfer', { fromAccount: '1003', toAccount: '1004', amount: 200000 }],
    ['add bank account HDFC current 1234', 'set_bank_account', { label: 'HDFC current', kind: 'bank', maskedNumber: '1234' }],
    ['match BL-000012 to INV-0007', 'match_bank_line', { lineId: 'BL-000012', kind: 'receipt', invoiceId: 'INV-0007' }],
    ['BL-000012 is a bank charge', 'match_bank_line', { lineId: 'BL-000012', kind: 'charge' }],
    ['ignore BL-000012', 'match_bank_line', { lineId: 'BL-000012', kind: 'ignore' }],
    ['unmatch BL-000012', 'unmatch_bank_line', { lineId: 'BL-000012' }],
    ['list bank rules', 'list_bank_rules', {}],
    ['remove rule BR-0001', 'remove_bank_rule', { id: 'BR-0001' }],
    ['run bank rules', 'run_bank_rules', {}],
    ['show my bank accounts', 'list_bank_accounts', {}],
  ];
  for (const [text, name, args] of expected) {
    const plan = planLocalToolCall(state, text);
    assert.equal(plan?.kind, 'tool', text);
    assert.equal(plan.name, name, text);
    assert.deepEqual(plan.args, args, text);
    assert.equal(validateAssistantToolCall(name, plan.args).ok, true, `${text}: ${JSON.stringify(validateAssistantToolCall(name, plan.args))}`);
  }
  const dated = planLocalToolCall(state, 'transferred 50000 from bank to cash on 3 November');
  assert.equal(dated.name, 'record_transfer');
  assert.deepEqual({ ...dated.args, date: undefined }, { fromAccount: '1002', toAccount: '1001', amount: 50000, date: undefined });
  assert.match(dated.args.date, /^\d{4}-11-03$/);
  assert.equal(dated.args.date <= localToday(), true);
  assert.equal(validateAssistantToolCall('record_transfer', dated.args).ok, true);
  assert.notEqual(planLocalToolCall(state, 'how do I reconcile my bank statement?')?.name, 'bank_reconciliation');
  assert.notEqual(planLocalToolCall(state, 'reconcile GSTR-2B')?.name, 'bank_reconciliation');
  assert.match(planLocalToolCall(createState(), 'moved 2 lakh from HDFC to ICICI').reply, /do not know an own account called "HDFC" or "ICICI"/);

  const books = booksWithSharma();
  await heldImport(books);
  const view = await chat(books, 'match bank');
  assert.equal(view.tools[0].name, 'bank_reconciliation');
  assert.match(view.reply, /Bank \(1002\): statement ₹26,925\.00 on 9 September 2026, books ₹11,800\.00, difference ₹15,125\.00\./);
  assert.match(view.reply, /4 not matched yet/);
  assert.match(view.reply, /BL-000004 .* could be a receipt from Sharma Traders \(INV-0002, INV-0003 open\)/);
  const held = await chat(books, 'BL-000003 is interest');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.preview.summary, /Book BL-000003: ₹150\.00 as interest income \(4100\)\./);
  const posted = await chat(books, 'yes');
  assert.equal(posted.posted, true, posted.reply);
  assert.match(posted.reply, /^BL-000003 \(₹150\.00 in\) booked as interest income\.$/);
  const rule = await chat(books, 'always book BANK CHARGES as bank charges');
  assert.equal(rule.awaitingConfirmation, true, rule.reply);
  assert.match(rule.preview.summary, /Save a rule: when the narration has "BANK CHARGES", money comes out, book bank charges\. It fits 1 open line now, which will be booked\./);
  const saved = await chat(books, 'yes');
  assert.match(saved.reply, /Saved BR-0001: .* 1 open line booked now\./);
  const imported = await chat(books, 'import bank');
  assert.equal(imported.awaitingConfirmation, undefined);
});

test('the new tools are registered for remote queries, both countries, confirmation and the cloud proposal list', () => {
  for (const name of ['bank_reconciliation', 'list_bank_rules', 'list_bank_accounts']) {
    assert.equal(isRemoteQuery(name), true, name);
    assert.equal(CONFIRM_TOOLS.has(name), false, name);
  }
  for (const name of BANK_WRITES) {
    assert.equal(isRemoteQuery(name), false, name);
    assert.equal(CONFIRM_TOOLS.has(name), true, name);
  }
  for (const name of BANK_TOOLS) {
    assert.equal(toolServesCountry(name, 'IN'), true, name);
    assert.equal(toolServesCountry(name, 'US'), true, name);
  }
  const source = readFileSync(fileURLToPath(new URL('../../cloud/src/api.mjs', import.meta.url)), 'utf8');
  const listed = source.match(/export const PROPOSABLE = new Set\(\[([^\]]*)\]\)/);
  assert.ok(listed, 'PROPOSABLE is a literal set');
  const proposable = new Set([...listed[1].matchAll(/'([^']+)'/g)].map((hit) => hit[1]));
  const engineOnly = new Set(['month_close_approve', 'set_sku_supply', 'record_purchase_order', 'record_advance_tax', 'set_supplier_bank', 'push_tally', 'set_gst_credit_opening', 'set_sales_tax_rate', 'set_contractor', 'set_withholding', 'govt_nic_cancel_irn', 'govt_generate_irn']);
  for (const name of CONFIRM_TOOLS) {
    if (isImport(name) || engineOnly.has(name) || ENGINE_WRITE_TOOLS.includes(name)) continue;
    assert.equal(proposable.has(name), true, `${name} can be proposed from the app`);
  }
  for (const name of [...BANK_WRITES, 'add_recurring', 'stop_recurring']) assert.equal(proposable.has(name), true, name);
  assert.equal(proposable.has('govt_generate_irn'), false);
});

test('open lines older than a week raise an exception and the daily close reports them', async () => {
  const state = booksWithSharma();
  await heldImport(state, statement([
    ['05-09-2026', 'NEFT CR SHARMA TRADERS UTR123', 0, 11800],
    ['06-09-2026', 'BANK CHARGES SMS ALERT', 25, 0],
    ['08-09-2026', 'NEFT CR BIG CUSTOMER', 0, 60000],
  ]));
  refreshExceptions(state, {}, { asOfDate: '2026-09-10', clientId: 'SELF' });
  assert.deepEqual(listExceptions(state, { status: 'open' }).filter((item) => item.source === 'bank'), []);
  refreshExceptions(state, {}, { asOfDate: '2026-09-30', clientId: 'SELF' });
  const open = listExceptions(state, { status: 'open' }).filter((item) => item.source === 'bank');
  assert.deepEqual(open.map((item) => [item.key, item.code, item.severity, item.moneyAtRisk]), [['bank:unmatched:BL-000003', 'BANK_LINE_UNMATCHED', 'high', 60000], ['bank:unmatched:BL-000002', 'BANK_LINE_UNMATCHED', 'medium', 25]]);
  assert.match(open[0].title, /Statement line BL-000003 of ₹60,000\.00 in on 8 September 2026 is not matched/);

  const close = await runTool(state, 'daily_close', { asOf: '2026-09-30' });
  const row = close.data.checklist.find((item) => item.item === 'Bank lines matched');
  assert.deepEqual(row, { item: 'Bank lines matched', ok: false, detail: '2 not matched yet, 2 older than 3 days' });
  assert.ok(close.data.needsYou.includes('Bank lines matched'));
  const quiet = await runTool(createState(), 'daily_close', { asOf: '2026-09-30' });
  assert.deepEqual(quiet.data.checklist.find((item) => item.item === 'Bank lines matched'), { item: 'Bank lines matched', ok: true, detail: 'no statement lines yet' });
  await runTool(state, 'match_bank_line', { lineId: 'BL-000002', kind: 'charge' });
  await runTool(state, 'match_bank_line', { lineId: 'BL-000003', kind: 'ignore', note: 'checking with the bank' });
  const settled = await runTool(state, 'daily_close', { asOf: '2026-09-30' });
  assert.deepEqual(settled.data.checklist.find((item) => item.item === 'Bank lines matched'), { item: 'Bank lines matched', ok: true, detail: 'all matched' });
});
