import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { computePayroll } from '../src/payroll.mjs';

function books(companyState, employee) {
  const state = createState();
  state.company = { ...state.company, name: 'Anita Clinic', gstin: '', state: companyState };
  state.employees = [{ id: 'EMP-0001', name: 'Meena', joinedOn: '2026-04-01', ptState: '', sex: 'female', salary: [{ from: '2026-04-01', components: [{ name: 'Basic', amount: 30000 }], monthly: 30000 }], ...employee }];
  return state;
}

const notesOf = (out) => out.data.rows[0].notes.join(' | ');

test('an employee with no PT state in a business state that charges PT gets a plain note, and no deduction', () => {
  const out = computePayroll(books('36', {}), '2026-10');
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.rows[0].pt, 0);
  assert.match(notesOf(out), /No professional tax state is recorded for Meena, but the business state charges professional tax/);
});

test('with the state set, professional tax is deducted and no such note appears', () => {
  const out = computePayroll(books('36', { ptState: '36' }), '2026-10');
  assert.ok(out.data.rows[0].pt > 0);
  assert.doesNotMatch(notesOf(out), /No professional tax state/);
});

test('a business in a state with no professional tax is not nagged', () => {
  const out = computePayroll(books('07', {}), '2026-10');
  assert.equal(out.ok, true);
  assert.doesNotMatch(notesOf(out), /No professional tax state/);
});

test('a business with no state set is not nagged either', () => {
  const out = computePayroll(books('', {}), '2026-10');
  assert.doesNotMatch(notesOf(out), /No professional tax state/);
});
