import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { bookView } from '../src/book-view.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

function books({ held = false } = {}) {
  const state = createState();
  const sale = (id, date, partyName, partyGstin, rate, gstRate) => {
    const out = createInvoice(state, { id, date, partyName, partyGstin, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate, gstRate }] });
    assert.notEqual(out.ok, false, JSON.stringify(out));
  };
  sale('INV-0001', '2026-09-05', 'Retail Mart', '27AAACH7409R1Z1', 10000, 5);
  sale('INV-0002', '2026-09-20', 'Gujarat Mills', '24AAACF7856R1ZY', 50000, 18);
  if (held) sale('INV-0003', '2026-09-22', 'Bad GSTIN Co', '27ZZZZZ0000Z9ZZ', 1000, 5);
  createPurchase(state, { date: '2026-09-06', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey cloth', hsn: '5208', qty: 1, rate: 4000, gstRate: 5 }] });
  return state;
}

async function review(state, period = '2026-09') {
  const out = await runTool(state, 'gst_review', { period });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.data;
}

async function answer(state, step, value, extra = {}) {
  const current = await review(state);
  return runTool(state, 'gst_review_answer', { period: '2026-09', step, answer: value, draftHash: current.draftHash, ...extra });
}

test('the review shows sales, then credit, then approval, with the engine figures and no amount to pay', async () => {
  const data = await review(books());
  assert.equal(data.month, 'September 2026');
  assert.match(data.draftHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(data.steps.map((s) => s.id), ['sales', 'credit', 'approve']);
  assert.equal(data.next, 'sales');
  const sales = data.steps[0];
  assert.equal(sales.question, 'Is this information correct?');
  assert.deepEqual(sales.lines.find((l) => l.label === 'Tax on sales'), { label: 'Tax on sales', amount: 9500, strong: true });
  assert.deepEqual(sales.lines.find((l) => l.label === 'IGST on sales'), { label: 'IGST on sales', amount: 9000 });
  assert.match(sales.lines.at(-1).label, /2 to registered buyers/);
  assert.equal(data.steps[1].lines.find((l) => l.label === 'Input credit').amount, 200);
  assert.match(data.steps[1].note, /not been checked against GSTR-2B/);
  const approve = data.steps[2];
  assert.equal(approve.waitingFor, 'sales');
  assert.match(approve.note, /no amount to pay is shown/);
  assert.equal(approve.lines.some((l) => /pay/i.test(l.label)), false);
});

test('held invoices come first and must be acknowledged before the sales step', async () => {
  const state = books({ held: true });
  const data = await review(state);
  assert.deepEqual(data.steps.map((s) => s.id), ['held', 'sales', 'credit', 'approve']);
  assert.equal(data.steps[0].lines[0].label, 'INV-0003: the buyer GSTIN is not valid');
  assert.equal((await answer(state, 'sales', 'correct')).error, 'STEP_NOT_READY');
  assert.equal((await answer(state, 'held', 'correct')).ok, true);
  assert.equal((await answer(state, 'sales', 'correct')).ok, true);
});

test('steps are answered in order, the owner approves, and approval files nothing', async () => {
  const state = books();
  const before = state.ledger.transfers.length;
  assert.equal((await answer(state, 'approve', 'approve')).error, 'STEP_NOT_READY');
  assert.equal((await answer(state, 'sales', 'approve')).error, 'ANSWER_DOES_NOT_FIT');
  const sales = await answer(state, 'sales', 'correct');
  assert.equal(sales.ok, true, JSON.stringify(sales));
  assert.equal(sales.next, 'credit');
  assert.equal((await answer(state, 'credit', 'correct')).next, 'approve');
  const approved = await answer(state, 'approve', 'approve');
  assert.equal(approved.approved, true);
  const data = await review(state);
  assert.equal(data.approved, true);
  assert.equal(data.approval.draftHash, data.draftHash);
  assert.equal(data.next, null);
  assert.equal(state.ledger.transfers.length, before);
  assert.equal((state.approvals || []).length, 0);
});

test('a change to the month after a step was confirmed voids the confirmations and says so', async () => {
  const state = books();
  const seen = await review(state);
  await answer(state, 'sales', 'correct');
  createInvoice(state, { id: 'INV-0009', date: '2026-09-28', partyName: 'Late Sale', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 100, gstRate: 5 }] });
  const after = await review(state);
  assert.notEqual(after.draftHash, seen.draftHash);
  assert.equal(after.changed, true);
  assert.equal(after.next, 'sales');
  assert.equal(after.steps[0].status, 'open');
  const stale = await runTool(state, 'gst_review_answer', { period: '2026-09', step: 'credit', answer: 'correct', draftHash: seen.draftHash });
  assert.equal(stale.error, 'DRAFT_CHANGED');
  createInvoice(state, { id: 'INV-0010', date: '2026-10-02', partyName: 'October Sale', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 100, gstRate: 5 }] });
  assert.equal((await review(state)).draftHash, after.draftHash, 'another month does not disturb this review');
});

test('"something is wrong" is recorded with its note and holds the next step back', async () => {
  const state = books();
  const out = await answer(state, 'sales', 'wrong', { note: 'INV-0002 rate should be 12%' });
  assert.equal(out.ok, true);
  const data = await review(state);
  assert.equal(data.steps[0].status, 'wrong');
  assert.equal(data.steps[0].answer.note, 'INV-0002 rate should be 12%');
  assert.equal(data.next, 'sales');
  assert.equal(data.steps[1].waitingFor, 'sales');
});

test('only the owner approves when a role is known; staff and accountants can answer the other steps', async () => {
  const root = books();
  const asStaff = bookView(root, root, { actor: { userId: 'u-staff', role: 'staff' } });
  const asOwner = bookView(root, root, { actor: { userId: 'u-owner', role: 'admin' } });
  const hash = (await review(root)).draftHash;
  assert.equal((await runTool(asStaff, 'gst_review_answer', { period: '2026-09', step: 'sales', answer: 'correct', draftHash: hash })).ok, true);
  assert.equal((await runTool(asStaff, 'gst_review_answer', { period: '2026-09', step: 'credit', answer: 'correct', draftHash: hash })).ok, true);
  assert.equal((await runTool(asStaff, 'gst_review_answer', { period: '2026-09', step: 'approve', answer: 'approve', draftHash: hash })).error, 'OWNER_APPROVES');
  assert.deepEqual(previewOf(asStaff, 'gst_review_answer', { period: '2026-09', step: 'approve', answer: 'approve', draftHash: hash }).blockers, ['Only the owner approves the return.']);
  const approved = await runTool(asOwner, 'gst_review_answer', { period: '2026-09', step: 'approve', answer: 'approve', draftHash: hash });
  assert.equal(approved.ok, true, JSON.stringify(approved));
  assert.equal(root.gstReviews['2026-09'].approval.by, 'u-owner');
  assert.equal(root.gstReviews['2026-09'].answers.sales.by, 'u-staff');
});

test('chat: "review GST for September" asks "Is this information correct?", yes confirms, and it walks to approval', async () => {
  const state = books();
  const first = await chat(state, 'review GST for September');
  assert.equal(first.awaitingConfirmation, true, JSON.stringify(first));
  assert.match(first.reply, /^Sales in September 2026\n/);
  assert.match(first.reply, /Tax on sales: ₹9,500\.00/);
  assert.match(first.reply, /Is this information correct\?/);
  const yes = await chat(state, 'yes');
  assert.equal(yes.posted, true);
  assert.match(yes.reply, /Next: Purchases and input credit in September 2026/);
  await chat(state, 'review gst');
  await chat(state, 'yes');
  const last = await chat(state, 'review gst');
  assert.match(last.reply, /Approve these figures for the return\?/);
  assert.match(last.reply, /You are approving the September 2026 figures\. Nothing is filed\./);
  assert.match((await chat(state, 'yes')).reply, /^Approved the September 2026 figures\. Nothing has been filed\./);
  assert.match((await chat(state, 'review gst')).reply, /You approved the September 2026 figures/);
});

test('chat: "no" discards and records nothing; an empty month says there is nothing to review', async () => {
  const state = books();
  await chat(state, 'review GST 2026-09');
  assert.match((await chat(state, 'no')).reply, /Not posted|Nothing/);
  assert.deepEqual(state.gstReviews, {});
  assert.match((await chat(state, 'review gst for march')).reply, /nothing to review/);
});

test('reviews persist, and the contracts are strict and the read tool is remote', async () => {
  const state = books();
  await answer(state, 'sales', 'correct');
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal((await review(back)).steps[0].status, 'confirmed');
  assert.equal(isRemoteQuery('gst_review'), true);
  assert.equal(isRemoteQuery('gst_review_answer'), false);
  const hash = 'a'.repeat(64);
  assert.equal(validateAssistantToolCall('gst_review_answer', { period: '2026-09', step: 'sales', answer: 'correct', draftHash: hash }).ok, true);
  assert.equal(validateAssistantToolCall('gst_review_answer', { period: '2026-09', step: 'sales', answer: 'yes', draftHash: hash }).ok, false);
  assert.equal(validateAssistantToolCall('gst_review_answer', { period: '2026-09', step: 'sales', answer: 'correct' }).ok, false);
});
