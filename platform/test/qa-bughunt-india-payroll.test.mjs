import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-qa-bughunt-payroll-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';

const FY_MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Rao Consulting', gstin: '27AABCU9603R1ZN', pan: 'AABCU9603R', state: '27', address: '1 FC Road', city: 'Pune', pin: '411004', tdsDeductor: true, tan: 'PNEA12345B' };
  return state;
}

async function runYear(state, name) {
  const byMonth = {};
  for (const period of FY_MONTHS) {
    const run = await runTool(state, 'payroll_run', { period });
    assert.equal(run.ok, true, JSON.stringify(run));
    const row = run.data.rows.find((item) => item.name === name);
    if (!row) continue;
    byMonth[period] = row;
    assert.equal((await runTool(state, 'approve_payroll', { period })).ok, true);
  }
  return byMonth;
}

test('salary TDS of an employee with a known last day is all deducted by that month, not spread over the rest of the year', async () => {
  const state = books();
  const added = await runTool(state, 'add_employee', { name: 'Arjun Rao', joinedOn: '2026-04-01', components: [{ name: 'Basic', amount: 600000 }], taxRegime: 'new', pan: 'ABCPR1234L' });
  assert.equal(added.ok, true, JSON.stringify(added));
  const id = state.employees[0].id;
  assert.equal((await runTool(state, 'end_employment', { id, leftOn: '2026-06-30' })).ok, true);
  const rows = await runYear(state, 'Arjun Rao');
  assert.deepEqual(Object.keys(rows), ['2026-04', '2026-05', '2026-06']);
  const annual = rows['2026-04'].tdsBasis.annualTax;
  assert.equal(rows['2026-04'].tdsBasis.projectedSalary, 1800000);
  const deducted = Object.values(rows).reduce((sum, row) => sum + row.tds, 0);
  assert.ok(Math.abs(deducted - annual) <= 1, `deducted ${deducted} of ${annual}`);
});

test('salary TDS for a mid-month joiner projects the later months at the full monthly pay, not the part month', async () => {
  const state = books();
  const added = await runTool(state, 'add_employee', { name: 'Neha Joshi', joinedOn: '2026-04-16', components: [{ name: 'Basic', amount: 200000 }], taxRegime: 'new', pan: 'ABCPJ1234L' });
  assert.equal(added.ok, true, JSON.stringify(added));
  const run = await runTool(state, 'payroll_run', { period: '2026-04' });
  assert.equal(run.ok, true, JSON.stringify(run));
  const row = run.data.rows.find((item) => item.name === 'Neha Joshi');
  assert.equal(row.gross, 100000);
  assert.equal(row.tdsBasis.projectedSalary, 2300000);
  assert.ok(row.tds > 0);
});
