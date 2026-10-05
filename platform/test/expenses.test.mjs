import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createTransfers, listAccounts, paise, trialBalance } from '../src/ledger.mjs';
import { tagExpense, expenseHeads, EXPENSE_HEADS } from '../src/expenses.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { lockPeriod } from '../src/period-lock.mjs';
import { serializeBook, deserializeBook, newBook } from '../src/books.mjs';

const debits = (state) => Object.fromEntries(listAccounts(state.ledger).map((a) => [a.code, a.debitsPosted]));

test('every head has a distinct code in the 5000 range and a name; keywords never repeat across heads', () => {
  const codes = new Set();
  const seen = new Map();
  for (const head of EXPENSE_HEADS) {
    assert.match(head.code, /^5[0-9]{3}$/);
    assert.equal(codes.has(head.code), false, head.code);
    codes.add(head.code);
    assert.ok(head.name);
    for (const keyword of head.keywords) {
      assert.equal(seen.has(keyword), false, `${keyword} in ${seen.get(keyword)} and ${head.name}`);
      seen.set(keyword, head.name);
    }
  }
  assert.deepEqual(expenseHeads()[0], { code: '5100', name: 'Other expenses' });
});

test('the tagger reads the words, says why, and falls back to Other expenses with a nudge', () => {
  const state = createState();
  assert.equal(tagExpense(state, { description: 'Shop rent for October' }).head, '5110');
  assert.equal(tagExpense(state, { description: 'Petrol for the van' }).head, '5150');
  assert.equal(tagExpense(state, { description: 'Electricity bill' }).head, '5130');
  assert.equal(tagExpense(state, { description: 'Airtel broadband' }).head, '5140');
  assert.equal(tagExpense(state, { description: 'CA fees for GST filing' }).head, '5170');
  assert.equal(tagExpense(state, { description: 'Google Ads' }).head, '5200');
  assert.equal(tagExpense(state, { description: 'Cartons and tape' }).head, '5240');
  assert.equal(tagExpense(state, { description: 'Tally licence' }).head, '5230');
  assert.equal(tagExpense(state, { description: 'Bank charges' }).head, '5180');
  assert.equal(tagExpense(state, { description: 'Printing paper' }).head, '5190');
  assert.equal(tagExpense(state, { description: '', payee: 'Mahesh Transport' }).head, '5210');
  const rent = tagExpense(state, { description: 'rent' });
  assert.equal(rent.source, 'keyword');
  assert.match(rent.why, /reads as Rent/);
  const unknown = tagExpense(state, { description: 'Diwali gifts' });
  assert.equal(unknown.head, '5100');
  assert.equal(unknown.source, 'default');
  assert.match(unknown.why, /Tap to change it/);
  const mixed = tagExpense(state, { description: 'Petrol and rent' });
  assert.equal(mixed.head, '5100');
});

test('posting an expense books it under its head, keeps a record, and takes no credit without a supplier GSTIN', async () => {
  const state = createState();
  const out = await runTool(state, 'post_expense', { narration: 'Shop rent', amount: 11800, gstRate: 18, date: '2026-10-03' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const expense = out.data ? out.data.expense : out.expense;
  assert.equal(expense.id, 'EXP-0001');
  assert.equal(expense.head, '5110');
  assert.equal(expense.headName, 'Rent');
  assert.equal(expense.taxable, 11800);
  assert.equal(expense.inputCredit, false);
  assert.equal(expense.mode, 'bank');
  assert.equal(expense.tag.source, 'keyword');
  const d = debits(state);
  assert.equal(d['5110'], 11800);
  assert.equal(d['1200'] || 0, 0);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal(state.expenses.length, 1);
});

test('with a supplier GSTIN the GST inside the amount becomes input credit, IGST when the supplier is in another state', async () => {
  const state = createState();
  assert.equal((await runTool(state, 'post_expense', { narration: 'Printer repair', amount: 1180, date: '2026-10-03', mode: 'cash' })).error, 'INSUFFICIENT_CASH');
  assert.match(previewOf(state, 'post_expense', { narration: 'Printer repair', amount: 1180, date: '2026-10-03', mode: 'cash' }).blockers[0], /Cash in hand is ₹0\.00/);
  createTransfers(state.ledger, [{ id: 1n, debitAccountId: 1001, creditAccountId: 3000, amount: paise(5000), code: 'CAPITAL' }]);
  const intra = await runTool(state, 'post_expense', { narration: 'Printer repair', amount: 1180, gstRate: 18, date: '2026-10-03', supplierGstin: '27AABCT1332L1ZE', mode: 'cash' });
  assert.equal(intra.ok, true, JSON.stringify(intra));
  assert.deepEqual([intra.expense.taxable, intra.expense.cgst, intra.expense.sgst, intra.expense.igst, intra.expense.inputCredit], [1000, 90, 90, 0, true]);
  const inter = await runTool(state, 'post_expense', { narration: 'Zoho subscription', amount: 1180, gstRate: 18, date: '2026-10-04', supplierGstin: '33AAACZ1234F1Z5' });
  assert.deepEqual([inter.expense.taxable, inter.expense.cgst, inter.expense.sgst, inter.expense.igst], [1000, 0, 0, 180]);
  const d = debits(state);
  assert.equal(d['5160'], 1000);
  assert.equal(d['5230'], 1000);
  assert.equal(d['1200'], 90);
  assert.equal(d['1201'], 90);
  assert.equal(d['1202'], 180);
  assert.equal(listAccounts(state.ledger).find((a) => a.code === '1001').creditsPosted, 1180);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const odd = await runTool(state, 'post_expense', { narration: 'Repair', amount: 1180.01, gstRate: 18, date: '2026-10-05', supplierGstin: '27AABCT1332L1ZE' });
  assert.equal(Math.round((odd.expense.taxable + odd.expense.cgst + odd.expense.sgst) * 100), 118001);
});

test('refusals: bad amount, rate, mode, GSTIN, head, date and a locked period; nothing is posted', async () => {
  const state = createState();
  assert.equal((await runTool(state, 'post_expense', { amount: 0 })).error, 'BAD_AMOUNT');
  assert.equal((await runTool(state, 'post_expense', { amount: 10, gstRate: 40 })).error, 'BAD_RATE');
  assert.equal((await runTool(state, 'post_expense', { amount: 10, mode: 'upi' })).error, 'BAD_MODE');
  assert.equal((await runTool(state, 'post_expense', { amount: 10, supplierGstin: 'ABC' })).error, 'BAD_GSTIN');
  assert.equal((await runTool(state, 'post_expense', { amount: 10, head: '9999' })).error, 'UNKNOWN_HEAD');
  assert.equal((await runTool(state, 'post_expense', { amount: 10, date: '2026-02-30' })).error, 'INVALID_DATE');
  lockPeriod(state, '2026-08-31');
  assert.equal((await runTool(state, 'post_expense', { amount: 10, date: '2026-08-01' })).error, 'PERIOD_LOCKED');
  assert.equal(state.ledger.transfers.length, 0);
  assert.equal((state.expenses || []).length, 0);
});

test('a chosen head is remembered for that payee and wording; moving a posted expense is a new entry that is also remembered', async () => {
  const state = createState();
  const first = await runTool(state, 'post_expense', { narration: 'Diwali gifts', payee: 'Gift Gallery', amount: 5000, date: '2026-10-20', head: '5200' });
  assert.equal(first.expense.head, '5200');
  assert.equal(first.expense.tag.source, 'chosen');
  const again = await runTool(state, 'post_expense', { narration: 'Diwali gifts', amount: 2000, date: '2026-10-21' });
  assert.equal(again.expense.head, '5200');
  assert.equal(again.expense.tag.source, 'memory');
  const byPayee = await runTool(state, 'post_expense', { narration: 'Boxes', payee: 'gift gallery', amount: 300, date: '2026-10-22' });
  assert.equal(byPayee.expense.head, '5200');

  const moved = await runTool(state, 'set_expense_head', { id: 'EXP-0003', head: '5240' });
  assert.equal(moved.ok, true, JSON.stringify(moved));
  assert.equal(moved.from, 'Advertising and marketing');
  assert.equal(state.expenses[2].head, '5240');
  assert.equal(state.expenses[2].transferIds.length, 2);
  const d = debits(state);
  assert.equal(d['5240'], 300);
  assert.equal(listAccounts(state.ledger).find((a) => a.code === '5200').creditsPosted, 300);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const next = await runTool(state, 'post_expense', { narration: 'Boxes', payee: 'Gift Gallery', amount: 100, date: '2026-10-23' });
  assert.equal(next.expense.head, '5240');
  assert.equal((await runTool(state, 'set_expense_head', { id: 'EXP-0003', head: '5240' })).unchanged, true);
  assert.equal((await runTool(state, 'set_expense_head', { id: 'EXP-9999', head: '5240' })).error, 'EXPENSE_NOT_FOUND');
  assert.equal((await runTool(state, 'set_expense_head', { id: 'EXP-0003', head: '1234' })).error, 'UNKNOWN_HEAD');
});

test('the preview names the head, the reason and the credit position before anything posts', () => {
  const state = createState();
  const preview = previewOf(state, 'post_expense', { narration: 'Shop rent', amount: 11800, gstRate: 18, date: '2026-10-03' });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /^Rent: Shop rent ₹11,800\.00 paid from bank on 2026-10-03\. GST 18% is inside the amount, but without the supplier's GSTIN no input credit is taken/);
  assert.equal(preview.figures.head, '5110');
  assert.equal(preview.figures.headName, 'Rent');
  assert.equal(preview.figures.tagSource, 'keyword');
  assert.equal(preview.figures.inputCredit, false);
  assert.equal(state.ledger.transfers.length, 0);
  assert.equal((state.expenses || []).length, 0);
  assert.deepEqual(previewOf(state, 'post_expense', { amount: 10, head: '9999' }).blockers, ['9999 is not an expense head.']);
});

test('expenses are listed by month, read-only, and persist with their tags across a save', async () => {
  const state = createState();
  await runTool(state, 'post_expense', { narration: 'Rent', amount: 10000, date: '2026-09-01' });
  await runTool(state, 'post_expense', { narration: 'Rent', amount: 10000, date: '2026-10-01' });
  await runTool(state, 'post_expense', { narration: 'Diwali gifts', amount: 500, date: '2026-10-02', head: '5200' });
  assert.equal((await runTool(state, 'list_expenses', { period: '2026-10' })).data.length, 2);
  assert.equal((await runTool(state, 'list_expenses', {})).data.length, 3);
  assert.equal((await runTool(state, 'expense_heads', {})).data.length, EXPENSE_HEADS.length);
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.expenses.length, 3);
  assert.equal(back.expenseSeq, 3);
  assert.equal(back.expenseTags['text:diwali gifts'], '5200');
  assert.equal(trialBalance(back.ledger).balanced, true);
  const book = newBook({});
  await runTool(book, 'post_expense', { narration: 'Rent', amount: 100, date: '2026-10-01' });
  const bookBack = deserializeBook(JSON.parse(JSON.stringify(serializeBook(book))));
  assert.equal(bookBack.expenses.length, 1);
  assert.equal(bookBack.expenses[0].head, '5110');
});

test('contracts: strict schemas, remote read tools, and set_expense_head is a write', () => {
  assert.equal(validateAssistantToolCall('post_expense', { amount: 10, narration: 'x', date: '2026-10-01', mode: 'cash', payee: 'p', supplierGstin: '27AABCT1332L1ZE', head: '5110' }).ok, true);
  assert.equal(validateAssistantToolCall('post_expense', { amount: 10, mode: 'upi' }).ok, false);
  assert.equal(validateAssistantToolCall('post_expense', { amount: 10, head: 'rent' }).ok, false);
  assert.equal(validateAssistantToolCall('set_expense_head', { id: 'EXP-0001', head: '5110' }).ok, true);
  assert.equal(validateAssistantToolCall('set_expense_head', { id: 'INV-0001', head: '5110' }).ok, false);
  assert.equal(validateAssistantToolCall('list_expenses', { period: '2026-10' }).ok, true);
  assert.equal(validateAssistantToolCall('list_expenses', { period: 'Oct' }).ok, false);
  assert.equal(isRemoteQuery('list_expenses'), true);
  assert.equal(isRemoteQuery('expense_heads'), true);
  assert.equal(isRemoteQuery('set_expense_head'), false);
});
