import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listDeadlines, profileOf, returnsFor } from '../src/deadlines.mjs';

const dealer = { clientId: 'CMP-1', name: 'Sharma Kirana', gst: 'TRUE', composition: 'TRUE', entity: 'proprietor', turnover: 4000000, state: '27' };
const regular = { ...dealer, clientId: 'REG-1', composition: 'FALSE' };
const months = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-04', '2027-12'];
const types = (rows, id) => [...new Set(rows.filter((row) => row.clientId === id).map((row) => row.returnType))];

test('a composition dealer owes CMP-08 on the 18th after each quarter and none of GSTR-1, GSTR-3B or GSTR-9', () => {
  const rows = listDeadlines({ clients: [dealer], months });
  assert.deepEqual(rows.filter((row) => row.returnType === 'CMP-08').map((row) => [row.period, row.dueDate]), [
    ['Q2 2026-27', '2026-10-18'],
    ['Q3 2026-27', '2027-01-18'],
    ['Q4 2026-27', '2027-04-18'],
  ]);
  for (const returnType of ['GSTR-1', 'GSTR-3B', 'PMT-06', 'GSTR-9']) assert.equal(types(rows, 'CMP-1').includes(returnType), false, returnType);
});

test('a regular GST business keeps its monthly returns and has no CMP-08', () => {
  const rows = listDeadlines({ clients: [regular], months });
  assert.equal(types(rows, 'REG-1').includes('GSTR-1'), true);
  assert.equal(types(rows, 'REG-1').includes('GSTR-3B'), true);
  assert.equal(types(rows, 'REG-1').includes('CMP-08'), false);
});

test('composition without a GSTIN is ignored, and a composition dealer is never quarterly-QRMP', () => {
  assert.equal(profileOf({ ...dealer, gst: 'FALSE' }).composition, false);
  const both = profileOf({ ...dealer, qrmp: 'TRUE' });
  assert.equal(both.composition, true);
  assert.equal(both.gstQuarterly, false);
  assert.equal(both.gstMonthly, false);
});

test('the returns a composition dealer can record include CMP-08 and not GSTR-1', () => {
  const codes = returnsFor(profileOf(dealer)).map((entry) => entry.code);
  assert.equal(codes.includes('CMP-08'), true);
  assert.equal(codes.includes('GSTR-1'), false);
  assert.equal(codes.includes('GSTR-9'), false);
});
