import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat, propose, confirmPending } from '../src/router.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { quarterOf, parseQuarter } from '../src/tds-return.mjs';
import { planTds } from '../src/tds-deduction.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

const RAO = { tdsSection: '194J', tdsCategory: 'professional', payeePan: 'AAAFR1234K' };

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', tdsDeductor: true, tan: 'MUMA12345B' };
  return state;
}

const bill = (date, rate, gstRate, extra = RAO, partyName = 'Rao & Co') => ({ partyName, date, lines: [{ description: 'Fees', qty: 1, rate, gstRate }], ...extra });

async function post(state, tool, args) {
  const held = propose(state, tool, args);
  assert.ok(held.preview?.token, held.reply);
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, done.reply);
  return held;
}

async function quarterWithDeductions(state) {
  await post(state, 'create_purchase', bill('2026-07-10', 40000, 18));
  await post(state, 'create_purchase', bill('2026-08-20', 20000, 18));
  await post(state, 'create_purchase', bill('2026-09-05', 100000, 0, { tdsSection: '194C', payeePan: 'AAACB1234P' }, 'Build Co'));
}

test('quarters follow the financial year and are read in either order', () => {
  assert.deepEqual(quarterOf('2026-09-05'), { label: 'Q2 2026-27', quarter: 2, fy: '2026-27', months: ['2026-07', '2026-08', '2026-09'], endDate: '2026-09-30' });
  assert.equal(quarterOf('2027-02-01').label, 'Q4 2026-27');
  assert.deepEqual(quarterOf('2027-02-01').months, ['2027-01', '2027-02', '2027-03']);
  assert.equal(parseQuarter('q2 2026-27').label, 'Q2 2026-27');
  assert.equal(parseQuarter('2026-27 Q2').label, 'Q2 2026-27');
  assert.equal(parseQuarter('September'), null);
});

test('the quarterly statement groups deductees by PAN and section, matches challans in date order, and knows its due date', async () => {
  const state = books();
  await quarterWithDeductions(state);
  const draft = await runTool(state, 'tds_return', {});
  assert.equal(draft.ok, true, JSON.stringify(draft));
  const d = draft.data;
  assert.equal(d.quarter, 'Q2 2026-27');
  assert.deepEqual(d.quarters, ['Q2 2026-27']);
  assert.equal(d.form, '140');
  assert.equal(d.tan, 'MUMA12345B');
  const rao = d.deductees.find((row) => row.pan === 'AAAFR1234K');
  assert.equal(rao.section, '194J');
  assert.equal(rao.count, 2);
  assert.equal(rao.basis, 60000);
  assert.equal(rao.tds, 6000);
  assert.equal(d.sections.find((row) => row.section === '194J').tds, 6000);
  assert.equal(d.deducted, 6000 + d.sections.find((row) => row.section === '194C').tds);
  assert.deepEqual(d.challans, []);
  assert.equal(d.deposited, 0);
  assert.equal(d.shortfall, d.deducted);
  assert.equal(d.dueDate, '2026-10-31');
  assert.equal(d.filed, null);
  assert.equal(d.unreviewed, true);
  const deposit = await runTool(state, 'record_tds_deposit', { challan: 'CIN0001', amount: 6000, date: '2026-09-06' });
  assert.equal(deposit.ok, true, JSON.stringify(deposit));
  const after = (await runTool(state, 'tds_return', { quarter: 'Q2 2026-27' })).data;
  assert.equal(after.challans.length, 1);
  assert.equal(after.challans[0].covers, 6000);
  assert.equal(after.deposited, 6000);
  assert.equal(after.shortfall, d.deducted - 6000);
  assert.notEqual(after.draftHash, d.draftHash, 'a challan changes the draft');
  assert.equal((await runTool(state, 'tds_return', { quarter: 'Q9' })).error, 'INVALID_QUARTER');
  assert.equal((await runTool(createState(), 'tds_return', {})).error, 'NOT_A_DEDUCTOR');
  assert.equal(isRemoteQuery('tds_return'), true);
  assert.equal(validateAssistantToolCall('tds_return', { quarter: 'Q2 2026-27' }).ok, true);
  assert.equal(validateAssistantToolCall('tds_return', { quarter: 'Q2' }).ok, false);
});

test('a challan paid for an earlier quarter is split between quarters in date order', async () => {
  const state = books();
  await post(state, 'create_purchase', bill('2026-05-10', 60000, 18));
  await post(state, 'create_purchase', bill('2026-07-10', 10000, 18));
  const q1 = (await runTool(state, 'tds_return', { quarter: 'Q1 2026-27' })).data;
  assert.equal(q1.deducted, 6000);
  await runTool(state, 'record_tds_deposit', { challan: 'CIN0002', amount: 6500, date: '2026-08-07' });
  const q1After = (await runTool(state, 'tds_return', { quarter: 'Q1 2026-27' })).data;
  assert.equal(q1After.challans[0].covers, 6000);
  assert.equal(q1After.shortfall, 0);
  const q2 = (await runTool(state, 'tds_return', { quarter: 'Q2 2026-27' })).data;
  assert.equal(q2.challans[0].covers, 500);
  assert.equal(q2.shortfall, 500);
});

test('the statement is reviewed step by step, approval files nothing, and a new deduction voids the answers', async () => {
  const state = books();
  await quarterWithDeductions(state);
  const first = await runTool(state, 'tds_review', {});
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.deepEqual(first.data.steps.map((s) => s.id), ['deductees', 'challans', 'approve']);
  assert.equal(first.data.period, 'Q2 2026-27');
  const deductees = first.data.steps[0];
  assert.ok(deductees.lines.some((line) => /Rao & Co \(AAAFR1234K\), 194J, 2 payments of ₹60,000\.00 at 10%/.test(line.label)), JSON.stringify(deductees.lines));
  assert.deepEqual(deductees.lines.at(-1), { label: 'TDS deducted', amount: first.data.deducted, strong: true });
  assert.match(deductees.note, /not reviewed yet/);
  assert.match(first.data.steps[1].note, /No deposit covers this quarter yet/);
  assert.match(first.data.steps[2].note, /Form 140/);
  const answer = (step, value, hash) => runTool(state, 'tds_review_answer', { period: 'Q2 2026-27', step, answer: value, draftHash: hash });
  assert.equal((await answer('approve', 'approve', first.data.draftHash)).error, 'STEP_NOT_READY');
  assert.equal((await answer('deductees', 'correct', first.data.draftHash)).next, 'challans');
  assert.equal((await answer('challans', 'correct', first.data.draftHash)).next, 'approve');
  const transfers = state.ledger.transfers.length;
  const approved = await answer('approve', 'approve', first.data.draftHash);
  assert.equal(approved.approved, true);
  assert.equal(state.ledger.transfers.length, transfers);
  assert.equal((state.filings || []).length, 0);
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal((await runTool(copy, 'tds_review', {})).data.approved, true);
  await post(state, 'create_purchase', bill('2026-09-25', 5000, 18));
  const changed = await runTool(state, 'tds_review', { period: 'Q2 2026-27' });
  assert.equal(changed.data.changed, true);
  assert.equal(changed.data.approved, false);
  assert.equal((await answer('deductees', 'correct', first.data.draftHash)).error, 'DRAFT_CHANGED');
});

test('chat: "TDS return" summarises the quarter and "review TDS" walks the steps with yes', async () => {
  const state = books();
  await quarterWithDeductions(state);
  const summary = await chat(state, 'tds return for Q2 2026-27');
  assert.match(summary.reply, /^TDS statement for payments other than salary for Q2 2026-27 \(Form 140\): deducted ₹[\d,]+\.\d\d, deposited ₹0\.00, still to deposit/);
  assert.match(summary.reply, /· 194J: 1 deductee, ₹6,000\.00/);
  const first = await chat(state, 'review TDS');
  assert.equal(first.awaitingConfirmation, true, JSON.stringify(first));
  assert.match(first.reply, /^TDS deducted in Q2 2026-27\n/);
  assert.match(first.reply, /Is this information correct\?/);
  assert.match((await chat(state, 'yes')).reply, /Next: Challans for Q2 2026-27/);
  await chat(state, 'review tds');
  assert.match((await chat(state, 'yes')).reply, /Next: Approve the Q2 2026-27 TDS statement/);
  const last = await chat(state, 'review tds');
  assert.match(last.reply, /Approve these figures for the statement\?/);
  assert.match((await chat(state, 'yes')).reply, /^Approved the Q2 2026-27 TDS statement\. Nothing has been filed\. ₹[\d,]+\.\d\d is still to deposit/);
  assert.match((await chat(state, 'review tds')).reply, /You approved the Q2 2026-27 TDS statement/);
  assert.match((await chat(createState(), 'review tds')).reply, /not set up to deduct TDS/);
});

test('a payee without a PAN is deducted at the higher rate from the dated rule and reported as having no PAN', async () => {
  const state = books();
  const held = await post(state, 'create_purchase', bill('2026-10-05', 60000, 18, { tdsSection: '194J', tdsCategory: 'professional' }, 'Nameless Consultants'));
  assert.equal(held.preview.figures.tds, 12000, held.reply);
  assert.match(held.reply, /at 20% \(the higher rate, because no PAN was given\)/);
  const entry = state.tdsEntries.at(-1);
  assert.equal(entry.pan, '');
  assert.equal(entry.noPan, true);
  assert.ok(entry.rulesUsed.includes('tds.no-pan.rate@2026-04-01'), entry.rulesUsed.join(','));
  const again = await post(state, 'create_purchase', bill('2026-10-20', 10000, 18, { tdsSection: '194J', tdsCategory: 'professional' }, 'Nameless Consultants'));
  assert.equal(again.preview.figures.tds, 2000, 'the same unnamed payee aggregates by name');
  const draft = (await runTool(state, 'tds_return', { quarter: 'Q3 2026-27' })).data;
  const row = draft.deductees.find((d) => d.payee === 'Nameless Consultants');
  assert.equal(row.noPan, true);
  assert.equal(row.tds, 14000);
  assert.equal(row.rate, 20);
  assert.equal(planTds(state, { tdsSection: '194J', tdsCategory: 'professional' }, { date: '2026-10-05', basis: 60000, payable: 70800, payee: '' }).error, 'PAN_REQUIRED', 'no payee name and no PAN is refused');
});
