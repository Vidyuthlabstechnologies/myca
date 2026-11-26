import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { deadlineRun } from '../src/deadline-run.mjs';

function books(extra) {
  const state = createState();
  state.company = { ...state.company, name: 'Sharma Kirana', gstin: '27AABCU9603R1ZN', state: '27', entityType: 'proprietorship', ...extra };
  return state;
}

const own = (state) => deadlineRun(state, { asOfDate: '2026-11-27', months: ['2026-12', '2027-01', '2027-04'] }).deadlines.filter((row) => row.clientId === 'SELF').map((row) => row.returnType);

test('a composition business is shown CMP-08 and not the monthly GST returns', () => {
  const types = own(books({ composition: true }));
  assert.equal(types.includes('CMP-08'), true);
  assert.equal(types.includes('GSTR-1'), false);
  assert.equal(types.includes('GSTR-3B'), false);
});

test('a regular business is shown the monthly GST returns and no CMP-08', () => {
  const types = own(books({ composition: false }));
  assert.equal(types.includes('GSTR-3B'), true);
  assert.equal(types.includes('CMP-08'), false);
});

test('composition with no GSTIN does nothing', () => {
  assert.equal(own(books({ composition: true, gstin: '' })).includes('CMP-08'), false);
});
