import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { bookView } from '../src/book-view.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

async function approvedOctober() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', tdsDeductor: true, tan: 'MUMA12345B' };
  const add = async (args) => { const out = await runTool(state, 'add_employee', args); assert.equal(out.ok, true, JSON.stringify(out)); };
  await add({ name: 'Ravi Kumar', joinedOn: '2026-04-01', components: [{ name: 'Basic', amount: 20000 }, { name: 'HRA', amount: 10000 }], pfMember: true, uan: '100200300400', ptState: '27', pan: 'ABCPK1234L', sex: 'male' });
  await add({ name: 'Meena Shah', joinedOn: '2026-10-16', components: [{ name: 'Salary', amount: 18000 }], pfMember: true, esiMember: true, esiNumber: '1234567890', ptState: '27', sex: 'female' });
  await add({ name: 'Arjun Rao', joinedOn: '2026-04-01', components: [{ name: 'Basic', amount: 100000 }, { name: 'HRA', amount: 50000 }], esiMember: false, pan: 'ABCPR1234L', taxRegime: 'new' });
  const draft = (await runTool(state, 'payroll_run', { period: '2026-10' })).data;
  const approved = await runTool(state, 'approve_payroll', { period: '2026-10', draftHash: draft.draftHash });
  assert.equal(approved.ok, true, JSON.stringify(approved));
  return { state, draft };
}

test('the PF ECR file has one line per member in whole rupees, sums to the remittance, and names members without a UAN', async () => {
  const { state, draft } = await approvedOctober();
  const out = await runTool(state, 'pf_ecr', { period: '2026-10' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.equal(d.members, 2);
  assert.equal(d.fileName, 'ECR_27AABCU9603R1ZN_2026-10.txt');
  const lines = d.text.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], '100200300400#~#RAVI KUMAR#~#30000#~#15000#~#15000#~#15000#~#1800#~#1250#~#550#~#0#~#0');
  const meena = lines[1].split('#~#');
  assert.equal(meena[0], '', 'no UAN yet');
  assert.equal(meena[1], 'MEENA SHAH');
  assert.equal(meena[2], '9290');
  assert.equal(meena[9], '15', 'non-contributory days for a mid-month joiner');
  assert.deepEqual(d.missingUan, ['Meena Shah']);
  assert.equal(d.totals.adminCharge, 500);
  assert.equal(d.totals.remittance, d.totals.employeeShare + d.totals.pensionShare + d.totals.employerEpfShare + d.totals.edli + d.totals.adminCharge);
  assert.ok(Math.abs(d.totals.remittance - draft.totals.pfPayable) < 3, 'within rupee rounding of what was posted');
  assert.equal((await runTool(state, 'pf_ecr', { period: '2026-09' })).error, 'NOT_APPROVED');
  assert.equal(isRemoteQuery('pf_ecr'), true);
  assert.equal(validateAssistantToolCall('pf_ecr', { period: '2026-10' }).ok, true);
  assert.equal((await runTool(bookView(state, state, { actor: { userId: 'u-staff', role: 'staff' } }), 'pf_ecr', { period: '2026-10' })).error, 'SALARIES_PRIVATE');
});

test('the ESI file lists covered members with days and wages in the portal columns', async () => {
  const { state, draft } = await approvedOctober();
  const out = await runTool(state, 'esi_return', { period: '2026-10' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.equal(d.members, 1);
  assert.equal(d.fileName, 'ESI_27AABCU9603R1ZN_2026-10.csv');
  const lines = d.csv.trim().split(/\r?\n/);
  assert.equal(lines[0], 'IP Number,IP Name,No of Days,Total Monthly Wages,Reason Code for Zero workings days,Last Working Day');
  assert.equal(lines[1], '1234567890,Meena Shah,16,9290,,');
  assert.deepEqual(d.missingIp, []);
  assert.equal(d.totals.remittance, draft.totals.esiPayable);
  assert.equal(d.totals.employerContribution, 301.94);
});

test('the salary TDS statement (Form 138) is drafted and reviewed apart from the non-salary one, sharing the challans', async () => {
  const { state, draft } = await approvedOctober();
  const salary = await runTool(state, 'tds_return', { quarter: 'Q3 2026-27', form: 'salary' });
  assert.equal(salary.ok, true, JSON.stringify(salary));
  assert.equal(salary.data.form, '138');
  assert.equal(salary.data.kind, 'salary');
  assert.equal(salary.data.deductees.length, 1);
  assert.equal(salary.data.deductees[0].section, '192');
  assert.equal(salary.data.deductees[0].pan, 'ABCPR1234L');
  assert.equal(salary.data.deducted, draft.totals.tds);
  const other = await runTool(state, 'tds_return', { quarter: 'Q3 2026-27' });
  assert.equal(other.data.empty, true, 'salary TDS stays out of Form 140');
  const bill = await runTool(state, 'create_purchase', { date: '2026-10-20', partyName: 'Rao & Co', lines: [{ description: 'Fees', qty: 1, rate: 60000, gstRate: 18 }], tdsSection: '194J', tdsCategory: 'professional', payeePan: 'AAAFR1234K' });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  const deposit = await runTool(state, 'record_tds_deposit', { challan: 'CIN0001', amount: 6000, date: '2026-10-10' });
  assert.equal(deposit.ok, true, JSON.stringify(deposit));
  const salaryAfter = (await runTool(state, 'tds_return', { quarter: 'Q3 2026-27', form: 'salary' })).data;
  const otherAfter = (await runTool(state, 'tds_return', { quarter: 'Q3 2026-27' })).data;
  assert.equal(Math.round((salaryAfter.deposited + otherAfter.deposited) * 100) / 100, 6000, 'one challan covers both statements in date order');
  assert.equal(otherAfter.deposited, 6000, 'the 20 October bill comes before the 31 October salary in date order');
  assert.equal(salaryAfter.deposited, 0);
  const review = await runTool(state, 'tds_review', { period: 'Q3 2026-27', form: 'salary' });
  assert.equal(review.ok, true, JSON.stringify(review));
  assert.equal(review.data.kind, 'salary');
  assert.match(review.data.steps[0].title, /^TDS deducted in Q3 2026-27 \(salary\)/);
  assert.match(review.data.steps[2].note, /Form 138/);
  const answer = await runTool(state, 'tds_review_answer', { period: 'Q3 2026-27', form: 'salary', step: 'deductees', answer: 'correct', draftHash: review.data.draftHash });
  assert.equal(answer.ok, true, JSON.stringify(answer));
  assert.ok(Object.hasOwn(state.tdsReviews, 'salary:Q3 2026-27'));
  assert.equal((await runTool(state, 'tds_review', { period: 'Q3 2026-27' })).data.steps[0].status, 'open', 'the non-salary review is untouched');
  const summary = (await runTool(state, 'tds_summary', {})).data;
  assert.deepEqual(summary.quarters.map((q) => `${q.quarter} ${q.kind}`), ['Q3 2026-27 other', 'Q3 2026-27 salary']);
  assert.equal(validateAssistantToolCall('tds_review_answer', { period: 'Q3 2026-27', form: 'salary', step: 'deductees', answer: 'correct', draftHash: 'a'.repeat(64) }).ok, true);
});

test('chat: the PF and ESI files and the salary TDS statement are asked for in words', async () => {
  const { state } = await approvedOctober();
  assert.match((await chat(state, 'pf file for October 2026')).reply, /^PF file for October 2026: 2 members, remittance ₹[\d,]+\.\d\d .*No UAN for Meena Shah/);
  assert.match((await chat(state, 'esi return for October 2026')).reply, /^ESI file for October 2026: 1 member, wages ₹9,290\.00/);
  assert.match((await chat(state, 'salary tds statement for Q3 2026-27')).reply, /^TDS statement for salary for Q3 2026-27 \(Form 138\)/);
  const first = await chat(state, 'review salary TDS');
  assert.equal(first.awaitingConfirmation, true, JSON.stringify(first));
  assert.match(first.reply, /^TDS deducted in Q3 2026-27 \(salary\)/);
  assert.match((await chat(state, 'yes')).reply, /Say "review salary TDS" to see it/);
});
