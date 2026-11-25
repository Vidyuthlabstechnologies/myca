import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { addEmployee, planEmployee } from '../src/employees.mjs';

const hire = (extra = {}) => ({ name: 'Ravi Kumar', joinedOn: '2026-10-01', components: [{ name: 'Basic', amount: 30000 }], ...extra });

function books(companyState) {
  const state = createState();
  state.employees = [];
  state.company = { ...state.company, state: companyState };
  return state;
}

test('a new employee gets professional tax in the business state when none is given', () => {
  const state = books('36');
  const added = addEmployee(state, hire());
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.equal(added.employee.ptState, '36');
});

test('the plan shown before posting already carries that state', () => {
  const plan = planEmployee(books('27'), hire());
  assert.equal(plan.employee.ptState, '27');
});

test('a state given on the hire is kept as given', () => {
  const added = addEmployee(books('36'), hire({ ptState: '29' }));
  assert.equal(added.employee.ptState, '29');
});

test('an empty state on the hire means no professional tax and is respected', () => {
  const added = addEmployee(books('36'), hire({ ptState: '' }));
  assert.equal(added.employee.ptState, '');
});

test('a business with no state set leaves the employee without one', () => {
  const added = addEmployee(books(''), hire());
  assert.equal(added.employee.ptState, '');
});

test('an employee already on the books keeps what they had', () => {
  const state = books('36');
  const first = addEmployee(state, hire({ ptState: '' }));
  state.company.state = '29';
  assert.equal(state.employees.find((e) => e.id === first.employee.id).ptState, '');
});
