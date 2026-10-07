import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { isQuestion, isNegated, parseDocument } from '../src/intent.mjs';
import { trialBalance } from '../src/ledger.mjs';

const SALE = 'Invoice Retail Mart GSTIN 27AAACH7409R1Z1, 10 rolls at 50000, GST 5%';

function books() {
  const state = createState();
  createInvoice(state, { id: 'INV-0003', date: '2026-08-01', partyName: 'Apna Retail', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });
  return state;
}

test('H10: a question about payment records nothing', async () => {
  const state = books();
  const out = await chat(state, 'Has INV-0003 been paid yet?');
  assert.equal(out.awaitingConfirmation, undefined);
  assert.equal((state.invoices[0].receipts || []).length, 0);
  assert.equal(state.invoices[0].status, 'posted');
  assert.match(out.reply, /marked posted/);
  assert.match(out.reply, /recorded nothing/);
});

test('H10: asking how to import does not import the attachment again', async () => {
  const state = createState();
  state.files.bank = 'Date,Narration,Withdrawal,Deposit,Balance\n01-08-2026,UPI,100,,900\n';
  const before = trialBalance(state.ledger).debit;
  for (const phrase of ['how do I reconcile my bank statement?', 'what happens when I import tally?', 'do not import the bank statement']) {
    const out = await chat(state, phrase);
    assert.equal(out.posted, undefined, phrase);
    assert.equal(out.awaitingConfirmation, undefined, phrase);
  }
  assert.equal(trialBalance(state.ledger).debit, before, 'nothing was posted by a question');
});

test('H10: "at" inside a word is not a rate', () => {
  assert.equal(parseDocument('format 2'), null);
  assert.equal(parseDocument('what is the flat 2 percent thing'), null);
  assert.ok(parseDocument('invoice Apna at 500'), 'a real rate is still read');
  assert.ok(parseDocument('invoice Apna rate 500'));
});

test('H10: question and negation detection', () => {
  assert.equal(isQuestion('should I post this?'), true);
  assert.equal(isQuestion('how do I reconcile'), true);
  assert.equal(isQuestion('is INV-1 paid'), true);
  assert.equal(isQuestion('post invoice for Apna at 500'), false);
  assert.equal(isNegated('do not post that'), true);
  assert.equal(isNegated("don't import it"), true);
  assert.equal(isNegated('post it'), false);
});

test('H10: a sale is previewed with the computed figures and posts only after confirmation', async () => {
  const state = createState();
  const preview = await chat(state, SALE);
  assert.equal(preview.awaitingConfirmation, true);
  assert.equal(preview.posted, false);
  assert.equal(state.invoices.length, 0);
  assert.equal(preview.preview.tool, 'create_invoice');
  assert.match(preview.preview.token, /^[0-9a-f]{12}$/);
  assert.equal(preview.preview.figures.taxable, 500000);
  assert.equal(preview.preview.figures.total, 525000);
  assert.match(preview.reply, /Nothing is posted yet/);

  const posted = await chat(state, 'yes');
  assert.equal(posted.posted, true);
  assert.equal(posted.confirmed, true);
  assert.equal(state.invoices.length, 1);
  assert.equal(state.invoices[0].total, 525000);
  assert.equal(state.pendingChatAction, null, 'the preview is single use');
});

test('H10: the confirmation code only posts its own preview', async () => {
  const state = createState();
  const first = await chat(state, SALE);
  const wrong = await chat(state, 'confirm 000000000000');
  assert.match(wrong.reply, /does not match/);
  assert.equal(state.invoices.length, 0);
  assert.equal(state.pendingChatAction, null, 'a mismatched code discards the preview');

  await chat(state, SALE);
  const right = await chat(state, `confirm ${state.pendingChatAction.token}`);
  assert.equal(right.posted, true);
  assert.equal(state.invoices.length, 1);
  void first;
});

test('H10: "no" discards, and a later "yes" posts nothing', async () => {
  const state = createState();
  await chat(state, SALE);
  const dropped = await chat(state, 'no');
  assert.match(dropped.reply, /^Not posted: /);
  assert.equal(state.pendingChatAction, null);
  const stray = await chat(state, 'yes');
  assert.match(stray.reply, /nothing waiting/i);
  assert.equal(state.invoices.length, 0);
});

test('H10: an expired preview is refused instead of posted', async () => {
  const state = createState();
  await chat(state, SALE);
  state.pendingChatAction = { ...state.pendingChatAction, expiresAt: new Date(Date.now() - 1000).toISOString() };
  const out = await chat(state, 'yes');
  assert.match(out.reply, /ten minutes old/);
  assert.equal(state.invoices.length, 0);
});

test('H10: a preview reports what would stop the posting, and holds nothing', async () => {
  const state = createState();
  state.lockThrough = '2026-12-31';
  const out = await chat(state, SALE);
  assert.equal(out.blocked, true);
  assert.equal(out.awaitingConfirmation, undefined);
  assert.match(out.reply, /locked period/);
  assert.equal(state.pendingChatAction, null);
  assert.equal(state.invoices.length, 0);
});

test('H10: an over-long message is refused before any pattern matching', async () => {
  const state = createState();
  const out = await chat(state, `invoice Apna at 500 ${'x'.repeat(5000)}`);
  assert.match(out.reply, /I read up to 2000/);
  assert.equal(state.invoices.length, 0);
  assert.equal(state.pendingChatAction, null);
});

test('H10: the preview of a receipt shows the outstanding amount and refuses an overpayment', async () => {
  const state = books();
  const out = await chat(state, 'record receipt INV-0003');
  assert.equal(out.awaitingConfirmation, true);
  assert.equal(out.preview.figures.amount, 1050);
  assert.equal(out.preview.figures.due, 1050);
  await chat(state, 'yes');
  assert.equal(state.invoices[0].status, 'paid');
  const again = await chat(state, 'record receipt INV-0003');
  assert.equal(again.blocked, true);
  assert.match(again.reply, /already fully received/);
});
