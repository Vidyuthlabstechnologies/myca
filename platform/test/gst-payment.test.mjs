import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { setOff, interestOn, lateFeeFor } from '../src/gst-setoff.mjs';
import { paymentFor, broughtForward } from '../src/gst-payment.mjs';
import { planGstPayFromChat } from '../src/gst-pay-intent.mjs';
import { rules } from '../src/sprint-load.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';

const GOLDEN = new URL('../../sprints/statutory-rules/golden/gst-payment.json', import.meta.url);

function pick(result, keys) {
  return Object.fromEntries(keys.map((key) => [key, result[key]]));
}

function computeGolden(input) {
  if (input.check === 'set-off') return pick(setOff(input), ['cash', 'carried', 'creditUsed', 'ruleUsed']);
  if (input.check === 'interest') return pick(interestOn(input), ['days', 'interest', 'ruleUsed']);
  if (input.check === 'late-fee') return pick(lateFeeFor(input), ['days', 'lateFee', 'cap', 'turnoverAssumedAboveCaps', 'ruleUsed']);
  throw new Error(`unknown golden check ${input.check}`);
}

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const sale = (id, date, partyName, partyGstin, rate, gstRate) => {
    const out = createInvoice(state, { id, date, partyName, partyGstin, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate, gstRate }] });
    assert.notEqual(out.ok, false, JSON.stringify(out));
  };
  sale('INV-0001', '2026-09-05', 'Retail Mart', '27AAACH7409R1Z1', 10000, 5);
  sale('INV-0002', '2026-09-20', 'Gujarat Mills', '24AAACF7856R1ZY', 50000, 18);
  createPurchase(state, { date: '2026-09-06', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey cloth', hsn: '5208', qty: 1, rate: 4000, gstRate: 5 }] });
  return state;
}

test('the set-off, interest and late-fee golden cases pass against the dated rules', async () => {
  const result = await rules.runGolden(GOLDEN, computeGolden);
  assert.deepEqual(result.failures, [], JSON.stringify(result, null, 2));
  assert.equal(result.ok, true);
  assert.ok(result.total >= 18);
});

test('a month is set off head by head: IGST in cash, CGST and SGST less their own credit', async () => {
  const state = books();
  const out = await runTool(state, 'gst_payable', { period: '2026-09' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.deepEqual(d.output, { igst: 9000, cgst: 250, sgst: 250, total: 9500 });
  assert.deepEqual(d.credit, { igst: 0, cgst: 100, sgst: 100, total: 200 });
  assert.deepEqual(d.cash, { igst: 9000, cgst: 150, sgst: 150, total: 9300 });
  assert.equal(d.toPay, 9300);
  assert.equal(d.creditUsed, 200);
  assert.deepEqual(d.carried, { igst: 0, cgst: 0, sgst: 0, total: 0 });
  assert.equal(d.broughtForwardKnown, false);
  assert.deepEqual(d.rulesUsed.slice(0, 1), ['gst.setoff.order@2019-04-01']);
  assert.equal(d.unreviewed, true);
  assert.match(d.notes.join(' '), /not reviewed yet/);
  assert.match(d.notes.join(' '), /No credit brought forward/);
  assert.equal(isRemoteQuery('gst_payable'), true);
  assert.equal(validateAssistantToolCall('gst_payable', { period: '2026-09' }).ok, true);
  assert.equal(validateAssistantToolCall('gst_payable', { period: 'Sept' }).ok, false);
  assert.equal(validateAssistantToolCall('set_gst_credit_opening', { period: '2026-09', cgst: 10 }).ok, true);
  assert.equal(validateAssistantToolCall('set_gst_credit_opening', { period: '2026-09', cgst: -1 }).ok, false);
});

test('credit brought forward is set off first, IGST credit before own-head credit, and the rest is carried', async () => {
  const state = books();
  const set = await runTool(state, 'set_gst_credit_opening', { period: '2026-08', igst: 12000, cgst: 500, sgst: 500 });
  assert.equal(set.ok, true, JSON.stringify(set));
  assert.deepEqual(set.opening, { period: '2026-08', igst: 12000, cgst: 500, sgst: 500, total: 13000 });
  const forward = broughtForward(state, '2026-09');
  assert.deepEqual(forward.credit, { igst: 12000, cgst: 500, sgst: 500, total: 13000 }, 'August has no documents, so the balance passes through');
  const out = await runTool(state, 'gst_payable', { period: '2026-09' });
  const d = out.data;
  assert.equal(d.broughtForwardKnown, true);
  assert.deepEqual(d.cash, { igst: 0, cgst: 0, sgst: 0, total: 0 });
  assert.equal(d.used.igst.igst, 9000);
  assert.equal(d.used.igst.cgst + d.used.igst.sgst, 500, 'the IGST remainder covers CGST and SGST before their own credit');
  assert.deepEqual(d.carried, { igst: 2500, cgst: 600, sgst: 600, total: 3700 });
  const october = await runTool(state, 'gst_payable', { period: '2026-10' });
  assert.deepEqual(october.data.broughtForward, { igst: 2500, cgst: 600, sgst: 600, total: 3700 }, 'what September carried is October\'s opening');
  const earlier = await runTool(state, 'gst_payable', { period: '2026-07' });
  assert.equal(earlier.data.broughtForwardKnown, false);
  assert.match(earlier.data.notes.join(' '), /before the credit balance you set/);
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.deepEqual(copy.gstCreditOpening.period, '2026-08');
  assert.equal((await runTool(state, 'set_gst_credit_opening', { period: '2026-8' })).error, 'INVALID_PERIOD');
  assert.equal((await runTool(state, 'set_gst_credit_opening', { period: '2026-08', cgst: -1 })).error, 'BAD_AMOUNT');
});

test('after the due date the payment carries interest on the cash part and the late fee from the rules', async () => {
  const state = books();
  state.company.grossTurnoverPrevFy = 10000000;
  const onTime = await runTool(state, 'gst_payable', { period: '2026-09', payOn: '2026-10-20' });
  assert.equal(onTime.data.dueDate, '2026-10-20');
  assert.equal(onTime.data.late, null);
  const late = await runTool(state, 'gst_payable', { period: '2026-09', payOn: '2026-11-04' });
  assert.deepEqual(late.data.late, {
    payOn: '2026-11-04',
    days: 15,
    interest: 68.79,
    interestRatePercent: 18,
    lateFee: 750,
    lateFeeCap: 2000,
    turnoverAssumedAboveCaps: false,
    total: 10118.79,
  });
  assert.deepEqual(late.data.rulesUsed, ['gst.setoff.order@2019-04-01', 'gst.interest.rate@2017-07-01', 'gst.late-fee.gstr3b@2021-06-01']);
  delete state.company.grossTurnoverPrevFy;
  const unknown = await runTool(state, 'gst_payable', { period: '2026-09', payOn: '2027-06-01' });
  assert.equal(unknown.data.late.lateFee, 10000);
  assert.equal(unknown.data.late.turnoverAssumedAboveCaps, true);
  assert.match(unknown.data.notes.join(' '), /assumes a turnover above five crore/);
  const filed = await runTool(state, 'record_filing', { returnType: 'GSTR-3B', period: '2026-09', arn: 'AA2709261234567', filedOn: '2026-10-10' });
  assert.equal(filed.ok, true, JSON.stringify(filed));
  const afterFiling = await runTool(state, 'gst_payable', { period: '2026-09', payOn: '2026-11-04' });
  assert.equal(afterFiling.data.late, null, 'a recorded filing stops the late charges');
  assert.equal(afterFiling.data.filed.arn, 'AA2709261234567');
});

test('the period summary, filing pack and cash forecast all carry the set-off figure for the month', async () => {
  const state = books();
  const summary = await runTool(state, 'gst_period_summary', { period: '2026-09' });
  assert.equal(summary.data.payment.toPay, 9300);
  assert.equal(summary.data.payment.cash.igst, 9000);
  const pack = await runTool(state, 'filing_pack', { period: '2026-09' });
  assert.equal(pack.data.payable, 9300);
  assert.match(pack.data.payableBasis, /this return period/);
  const due = await runTool(state, 'deadlines', { asOfDate: '2026-10-01' });
  const row = due.data.deadlines.find((item) => item.returnType === 'GSTR-3B' && item.period === '2026-09');
  assert.ok(row, 'GSTR-3B for September is due');
});

test('the review has an amount-to-pay step before approval, and changing the opening balance reopens it', async () => {
  const state = books();
  const first = await runTool(state, 'gst_review', { period: '2026-09' });
  assert.deepEqual(first.data.steps.map((s) => s.id), ['sales', 'credit', 'pay', 'approve']);
  const pay = first.data.steps[2];
  assert.equal(pay.title, 'Amount to pay for September 2026');
  assert.deepEqual(pay.lines.find((l) => l.label === 'To pay in cash'), { label: 'To pay in cash', amount: 9300, strong: true });
  assert.deepEqual(pay.lines.find((l) => l.label === 'IGST to pay'), { label: 'IGST to pay', amount: 9000 });
  assert.deepEqual(pay.lines.find((l) => l.label === 'Credit used'), { label: 'Credit used', amount: -200 });
  assert.match(pay.note, /head by head/);
  assert.match(pay.note, /not reviewed yet/);
  assert.equal(first.data.toPay, 9300);
  const approve = first.data.steps[3];
  assert.deepEqual(approve.lines.at(-1), { label: 'To pay in cash', amount: 9300, strong: true });
  assert.match(approve.note, /moves no money/);
  const answer = (step, value, draftHash) => runTool(state, 'gst_review_answer', { period: '2026-09', step, answer: value, draftHash });
  assert.equal((await answer('sales', 'correct', first.data.draftHash)).ok, true);
  assert.equal((await answer('credit', 'correct', first.data.draftHash)).ok, true);
  assert.equal((await answer('pay', 'correct', first.data.draftHash)).ok, true);
  const ready = await runTool(state, 'gst_review', { period: '2026-09' });
  assert.equal(ready.data.next, 'approve');
  await runTool(state, 'set_gst_credit_opening', { period: '2026-09', igst: 9000 });
  const changed = await runTool(state, 'gst_review', { period: '2026-09' });
  assert.equal(changed.data.changed, true, 'the draft hash covers the credit brought forward');
  assert.equal(changed.data.next, 'sales');
  assert.equal(changed.data.toPay, 300);
  assert.equal((await answer('pay', 'correct', first.data.draftHash)).error, 'DRAFT_CHANGED');
});

test('chat: the amount to pay is asked for by month, and the credit balance is set by head after a preview', async () => {
  const state = books();
  assert.deepEqual(planGstPayFromChat('how much GST do I pay for September?'), { kind: 'tool', name: 'gst_payable', args: { period: '2026-09' } });
  assert.deepEqual(planGstPayFromChat('gst to pay'), { kind: 'tool', name: 'gst_payable', args: {} });
  assert.deepEqual(planGstPayFromChat('GST credit balance at start of August 2026: IGST 12,000, CGST 500, SGST 500'), { kind: 'tool', name: 'set_gst_credit_opening', args: { period: '2026-08', igst: 12000, cgst: 500, sgst: 500 } });
  assert.equal(planGstPayFromChat('gst credit balance 5000 at start of august').kind, 'reply');
  assert.equal(planGstPayFromChat('do not record gst credit balance'), null);
  const asked = await chat(state, 'how much GST do I pay for September 2026?');
  assert.match(asked.reply, /^GST for September 2026: tax on sales ₹9,500\.00, input credit ₹200\.00, credit used ₹200\.00\. To pay in cash: ₹9,300\.00 \(IGST ₹9,000\.00, CGST ₹150\.00, SGST ₹150\.00\)\. Due by 20 October 2026\./, asked.reply);
  assert.match(asked.reply, /not reviewed yet/);
  const held = await chat(state, 'GST credit balance at start of August 2026: IGST 12000, CGST 500, SGST 500');
  assert.equal(held.preview?.tool, 'set_gst_credit_opening', held.reply);
  assert.equal(state.gstCreditOpening, null, 'nothing before yes');
  const done = await chat(state, 'yes');
  assert.match(done.reply, /^Recorded the GST credit balance at the start of August 2026: IGST ₹12,000\.00, CGST ₹500\.00, SGST ₹500\.00\./);
  assert.equal(state.gstCreditOpening.period, '2026-08');
  const again = await chat(state, 'how much GST do I pay for September 2026?');
  assert.match(again.reply, /plus ₹13,000\.00 brought forward/);
  assert.match(again.reply, /Nothing to pay in cash\. Credit carried forward: ₹3,700\.00\./);
});
