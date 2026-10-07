import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { chat } from '../src/router.mjs';
import { salaryOn } from '../src/employees.mjs';
import { bookView } from '../src/book-view.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { listAccounts } from '../src/ledger.mjs';

const RAVI = {
  name: 'Ravi Kumar',
  joinedOn: '2026-09-01',
  designation: 'Store manager',
  components: [{ name: 'Basic', amount: 15000 }, { name: 'HRA', amount: 6000 }, { name: 'Special allowance', amount: 4000 }],
  pan: 'abcpk1234d',
  pfMember: true,
  ptState: '29',
  taxRegime: 'new',
};

test('an employee is added with a salary in parts; nothing is posted and no deduction is worked out', async () => {
  const state = createState();
  const ledgerBefore = JSON.stringify(listAccounts(state.ledger));
  const preview = previewOf(state, 'add_employee', RAVI);
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /^Add Ravi Kumar, Store manager, joined 2026-09-01, at ₹25,000(\.00)? a month \(Basic ₹15,000(\.00)? \+ HRA ₹6,000(\.00)? \+ Special allowance ₹4,000(\.00)?\)\. in provident fund, new tax regime\.$/);
  assert.match(preview.effects.join(' '), /no payroll is run\. Deductions are not worked out yet/);
  const out = await runTool(state, 'add_employee', RAVI);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.employee.id, 'EMP-0001');
  assert.equal(out.employee.pan, 'ABCPK1234D');
  assert.equal(out.employee.esiMember, false);
  assert.equal(JSON.stringify(listAccounts(state.ledger)), ledgerBefore);
  const listed = await runTool(state, 'list_employees', { today: '2026-10-07' });
  assert.equal(listed.data.monthlyTotal, 25000);
  assert.match(listed.data.note, /not worked out yet/);
});

test('a salary change is dated: earlier months keep their salary, and a later list shows the new one', async () => {
  const state = createState();
  await runTool(state, 'add_employee', RAVI);
  const change = await runTool(state, 'change_salary', { id: 'EMP-0001', effectiveFrom: '2026-11-01', components: [{ name: 'Basic', amount: 18000 }, { name: 'HRA', amount: 7200 }] });
  assert.equal(change.ok, true, JSON.stringify(change));
  const [ravi] = state.employees;
  assert.equal(salaryOn(ravi, '2026-10-31').monthly, 25000);
  assert.equal(salaryOn(ravi, '2026-11-01').monthly, 25200);
  assert.equal(salaryOn(ravi, '2026-08-31'), null, 'no salary before joining');
  assert.equal((await runTool(state, 'list_employees', { today: '2026-10-07' })).data.employees[0].monthly, 25000);
  assert.equal((await runTool(state, 'list_employees', { today: '2026-11-02' })).data.employees[0].monthly, 25200);
  assert.match(previewOf(state, 'change_salary', { id: 'EMP-0001', effectiveFrom: '2026-12-01', components: [{ name: 'Basic', amount: 20000 }] }).summary, /^Ravi Kumar: ₹20,000(\.00)? a month from 2026-12-01, was ₹25,200(\.00)?\.$/);
});

test('leaving keeps the record; the list shows current staff unless asked for all', async () => {
  const state = createState();
  await runTool(state, 'add_employee', RAVI);
  await runTool(state, 'add_employee', { name: 'Meena', joinedOn: '2026-09-15', components: [{ name: 'Salary', amount: 18000 }] });
  assert.equal((await runTool(state, 'end_employment', { id: 'emp-0002', leftOn: '2026-09-30' })).ok, true);
  const current = await runTool(state, 'list_employees', { today: '2026-10-07' });
  assert.deepEqual(current.data.employees.map((e) => e.name), ['Ravi Kumar']);
  assert.equal(current.data.monthlyTotal, 25000);
  const all = await runTool(state, 'list_employees', { today: '2026-10-07', include: 'all' });
  assert.deepEqual(all.data.employees.map((e) => [e.name, e.active]), [['Ravi Kumar', true], ['Meena', false]]);
  assert.equal((await runTool(state, 'end_employment', { id: 'EMP-0002', leftOn: '2026-10-01' })).error, 'ALREADY_LEFT');
  assert.equal((await runTool(state, 'change_salary', { id: 'EMP-0002', effectiveFrom: '2026-10-01', components: [{ name: 'Salary', amount: 1 }] })).error, 'AFTER_LEAVING');
});

test('bad input is refused with a reason', async () => {
  const state = createState();
  const cases = [
    [{ ...RAVI, name: '' }, 'NAME_REQUIRED'],
    [{ ...RAVI, joinedOn: 'soon' }, 'INVALID_DATE'],
    [{ ...RAVI, components: [] }, 'SALARY_REQUIRED'],
    [{ ...RAVI, components: [{ name: 'Basic', amount: 0 }] }, 'ZERO_SALARY'],
    [{ ...RAVI, components: [{ name: 'Basic', amount: 1 }, { name: 'basic', amount: 2 }] }, 'DUPLICATE_COMPONENT'],
    [{ ...RAVI, components: [{ name: 'Basic', amount: -5 }] }, 'BAD_AMOUNT'],
    [{ ...RAVI, pan: 'ABC123' }, 'BAD_PAN'],
    [{ ...RAVI, uan: '1234' }, 'BAD_UAN'],
    [{ ...RAVI, ptState: 'KA' }, 'BAD_STATE'],
  ];
  for (const [args, error] of cases) assert.equal((await runTool(state, 'add_employee', args)).error, error, error);
  await runTool(state, 'add_employee', RAVI);
  assert.equal((await runTool(state, 'add_employee', RAVI)).error, 'ALREADY_EMPLOYED');
  assert.equal((await runTool(state, 'change_salary', { id: 'EMP-0001', effectiveFrom: '2026-08-01', components: [{ name: 'Basic', amount: 1 }] })).error, 'BEFORE_JOINING');
  assert.match(previewOf(state, 'add_employee', { ...RAVI, pan: 'x' }).blockers[0], /five letters, four digits and a letter/);
});

test('only the owner sees or changes salaries; staff and accountants are refused', async () => {
  const state = createState();
  await runTool(state, 'add_employee', RAVI);
  for (const role of ['staff', 'partner']) {
    const view = bookView(state, state, { actor: { userId: 'u2', role } });
    assert.equal((await runTool(view, 'list_employees', {})).error, 'SALARIES_PRIVATE', role);
    assert.equal((await runTool(view, 'add_employee', { ...RAVI, name: 'Someone' })).error, 'SALARIES_PRIVATE', role);
    assert.match(previewOf(view, 'change_salary', { id: 'EMP-0001', effectiveFrom: '2026-10-01', components: [{ name: 'Basic', amount: 1 }] }).blockers[0], /Only the owner/);
  }
  const owner = bookView(state, state, { actor: { userId: 'u1', role: 'admin' } });
  assert.equal((await runTool(owner, 'list_employees', {})).ok, true);
});

test('chat adds an employee after a preview and lists them; records survive saving', async () => {
  const state = createState();
  const held = await chat(state, 'add employee Ravi Kumar as store manager, joined 2026-09-01, salary 25,000');
  assert.equal(held.preview?.tool, 'add_employee', held.reply);
  assert.match(held.preview.summary, /^Add Ravi Kumar, store manager, joined 1 September 2026, at ₹25,000/);
  assert.equal((await chat(state, 'yes')).reply, 'Added Ravi Kumar as EMP-0001, at ₹25,000.00 a month from 1 September 2026. No payroll has been run.');
  assert.match((await chat(state, 'my employees')).reply, /^1 employee, ₹25,000\.00 a month before deductions:\n· EMP-0001 Ravi Kumar, store manager: ₹25,000\.00$/);
  assert.match((await chat(state, 'add employee Meena')).reply, /^To add an employee, say their name, the day they joined and the monthly salary/);
  assert.deepEqual(deserialize(serialize(state)).employees, state.employees);
});

test('the list is a phone query; the writes are strict and proposable', () => {
  assert.equal(isRemoteQuery('list_employees'), true);
  assert.equal(validateAssistantToolCall('add_employee', { name: 'A', joinedOn: '2026-09-01', components: [{ name: 'Salary', amount: 1, bank: 'x' }] }).ok, false);
  assert.equal(validateAssistantToolCall('add_employee', { name: 'A', joinedOn: '2026-09-01', components: [{ name: 'Salary', amount: 1 }], bankAccount: '123' }).ok, false);
  assert.equal(validateAssistantToolCall('change_salary', { id: 'EMP-0001', effectiveFrom: '2026-10-01', components: [{ name: 'Basic', amount: 1 }] }).ok, true);
});

test('a staff member asking for employees in chat is told plainly', async () => {
  const state = createState();
  await runTool(state, 'add_employee', RAVI);
  const view = bookView(state, state, { actor: { userId: 'u2', role: 'staff' } });
  const out = await chat(view, 'my employees');
  assert.equal(out.reply, 'Only the owner can see or change employees and salaries.');
});
