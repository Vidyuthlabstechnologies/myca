import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { isRemoteQuery as remoteQuery } from '../src/remote-contract.mjs';

const RAVI = { name: 'Ravi Kumar', joinedOn: '2026-04-01', components: [{ name: 'Basic', amount: 20000 }, { name: 'HRA', amount: 8000 }], pan: 'ABCPK1234L', ptState: '27', sex: 'male' };
const MEENA = { name: 'Meena Iyer', joinedOn: '2026-04-01', components: [{ name: 'Basic', amount: 15000 }], ptState: '27', sex: 'female' };

async function approvedMonth(state, period = '2026-09') {
  const draft = await runTool(state, 'payroll_run', { period });
  assert.equal(draft.ok, true, JSON.stringify(draft).slice(0, 300));
  const approved = await runTool(state, 'approve_payroll', { period, draftHash: draft.data.draftHash });
  assert.equal(approved.ok, true, JSON.stringify(approved).slice(0, 300));
}

test('the payout file lists net pay with each recorded account, names who has none, and is a phone query', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const ravi = await runTool(state, 'add_employee', { ...RAVI, bankAccount: '12345678901', ifsc: 'hdfc0001234' });
  assert.equal(ravi.ok, true, JSON.stringify(ravi));
  assert.equal(ravi.employee.ifsc, 'HDFC0001234');
  const meena = await runTool(state, 'add_employee', MEENA);
  await approvedMonth(state);
  const none = await runTool(state, 'payroll_payout_file', { period: '2026-10' });
  assert.equal(none.error, 'NOT_APPROVED');
  const out = await runTool(state, 'payroll_payout_file', { period: '2026-09' });
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300));
  assert.equal(out.data.employees, 2);
  assert.deepEqual(out.data.missingBank, ['Meena Iyer']);
  assert.equal(out.data.fileName, 'salary-payout-2026-09.csv');
  const lines = out.data.csv.trim().split('\n');
  assert.equal(lines[0], 'Beneficiary Name,Account Number,IFSC,Amount,Narration');
  assert.match(lines[1], /^Ravi Kumar,12345678901,HDFC0001234,[0-9]+\.[0-9]{2},SAL-2026-09$/);
  assert.match(lines[2], /^Meena Iyer,,,[0-9]+\.[0-9]{2},SAL-2026-09$/);
  const net = state.payrollRuns['2026-09'].totals.netPaise / 100;
  assert.equal(out.data.total, net);
  assert.equal(remoteQuery('payroll_payout_file'), true);

  const bank = await runTool(state, 'set_employee_bank', { id: meena.employee.id, bankAccount: '98765432109876', ifsc: '021000021' });
  assert.equal(bank.ok, true, JSON.stringify(bank));
  assert.equal(bank.employee.bankAccount, 'xxxx9876');
  const complete = await runTool(state, 'payroll_payout_file', { period: '2026-09' });
  assert.deepEqual(complete.data.missingBank, []);
  const bad = await runTool(state, 'set_employee_bank', { id: meena.employee.id, bankAccount: '12', ifsc: 'HDFC0001234' });
  assert.equal(bad.error, 'BAD_BANK_ACCOUNT');
  const badIfsc = await runTool(state, 'set_employee_bank', { id: meena.employee.id, bankAccount: '12345678901', ifsc: 'HDFC1234' });
  assert.equal(badIfsc.error, 'BAD_IFSC');
  assert.equal(validateAssistantToolCall('set_employee_bank', { id: 'EMP-0001', bankAccount: '12345678901', ifsc: 'HDFC0001234' }).ok, true);
  assert.equal(validateAssistantToolCall('set_employee_bank', { id: 'EMP-0001', bankAccount: '123', ifsc: 'HDFC0001234' }).ok, false);

  const said = await chat(state, 'salary payout file for September 2026');
  assert.match(said.reply, /Salary payout for September 2026: 2 employees/);
  const listed = await runTool(state, 'list_employees', {});
  assert.equal(listed.data.employees.find((e) => e.name === 'Ravi Kumar').bankAccount, '12345678901');
});
