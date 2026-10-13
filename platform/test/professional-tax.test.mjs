import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { rules } from '../src/sprint-load.mjs';

const STATES = ['27', '29', '19', '36', '37', '24', '23', '21', '20', '18', '22', '03', '33', '32', '10'];

async function ptFor({ state: code, monthly, sex = 'male', period = '2026-10' }) {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const out = await runTool(state, 'add_employee', { name: 'Test Person', joinedOn: '2026-04-01', components: [{ name: 'Salary', amount: monthly }], ptState: code, sex });
  assert.equal(out.ok, true, JSON.stringify(out));
  const run = await runTool(state, 'payroll_run', { period });
  assert.equal(run.ok, true, JSON.stringify(run));
  return run.data.rows[0];
}

test('every encoded state has a professional tax rule in force for FY 2026-27', () => {
  for (const code of STATES) {
    const found = rules.rule(`payroll.pt.${code}`, '2026-10-31');
    assert.equal(found.ok, true, code);
    assert.ok(['monthly', 'annual', 'half-yearly'].includes(found.record.value.basis), code);
    const slabs = found.record.value.slabs.all || found.record.value.slabs.men;
    assert.equal(slabs.at(-1).payUpToPaise, null, `${code} ends with an open slab`);
    for (let i = 1; i < slabs.length - 1; i += 1) assert.ok(slabs[i].payUpToPaise > slabs[i - 1].payUpToPaise, `${code} slabs rise`);
  }
});

test('monthly-slab states: Karnataka, West Bengal, Telangana, Andhra Pradesh, Gujarat, Odisha, Assam', async () => {
  assert.equal((await ptFor({ state: '29', monthly: 24999 })).pt, 0);
  assert.equal((await ptFor({ state: '29', monthly: 25000 })).pt, 200);
  assert.equal((await ptFor({ state: '29', monthly: 25000, period: '2027-02' })).pt, 300, 'Karnataka charges three hundred in February from April 2025');
  assert.equal((await ptFor({ state: '19', monthly: 10000 })).pt, 0);
  assert.equal((await ptFor({ state: '19', monthly: 12000 })).pt, 110);
  assert.equal((await ptFor({ state: '19', monthly: 20000 })).pt, 130);
  assert.equal((await ptFor({ state: '19', monthly: 30000 })).pt, 150);
  assert.equal((await ptFor({ state: '19', monthly: 50000 })).pt, 200);
  assert.equal((await ptFor({ state: '36', monthly: 15000 })).pt, 0);
  assert.equal((await ptFor({ state: '36', monthly: 18000 })).pt, 150);
  assert.equal((await ptFor({ state: '37', monthly: 25000 })).pt, 200);
  assert.equal((await ptFor({ state: '24', monthly: 12000 })).pt, 0);
  assert.equal((await ptFor({ state: '24', monthly: 12001 })).pt, 200);
  assert.equal((await ptFor({ state: '21', monthly: 13304 })).pt, 0);
  assert.equal((await ptFor({ state: '21', monthly: 20000 })).pt, 125);
  assert.equal((await ptFor({ state: '21', monthly: 30000, period: '2027-02' })).pt, 300);
  assert.equal((await ptFor({ state: '18', monthly: 15000 })).pt, 0);
  assert.equal((await ptFor({ state: '18', monthly: 20000 })).pt, 180);
  assert.equal((await ptFor({ state: '18', monthly: 25000 })).pt, 208);
});

test('annual-pay states: Madhya Pradesh, Jharkhand, Chhattisgarh, Punjab, with the last month of the year', async () => {
  assert.equal((await ptFor({ state: '23', monthly: 18750 })).pt, 0);
  assert.equal((await ptFor({ state: '23', monthly: 20000 })).pt, 125);
  assert.equal((await ptFor({ state: '23', monthly: 30000 })).pt, 166);
  assert.equal((await ptFor({ state: '23', monthly: 30000, period: '2027-03' })).pt, 174);
  assert.equal((await ptFor({ state: '23', monthly: 50000 })).pt, 208);
  assert.equal((await ptFor({ state: '23', monthly: 50000, period: '2027-03' })).pt, 212);
  assert.equal((await ptFor({ state: '20', monthly: 25000 })).pt, 0);
  assert.equal((await ptFor({ state: '20', monthly: 30000 })).pt, 100);
  assert.equal((await ptFor({ state: '20', monthly: 90000 })).pt, 208);
  assert.equal((await ptFor({ state: '22', monthly: 10000 })).pt, 130);
  assert.equal((await ptFor({ state: '22', monthly: 25000, period: '2027-03' })).pt, 212);
  assert.equal((await ptFor({ state: '03', monthly: 20000 })).pt, 0);
  assert.equal((await ptFor({ state: '03', monthly: 21000 })).pt, 200);
  assert.equal((await ptFor({ state: '10', monthly: 25000 })).pt, 0, 'Bihar: three lakh a year is nil');
  assert.equal((await ptFor({ state: '10', monthly: 30000 })).pt, 83);
  assert.equal((await ptFor({ state: '10', monthly: 30000, period: '2027-03' })).pt, 87, 'eleven months of 83 and 87 in March make one thousand');
  assert.equal((await ptFor({ state: '10', monthly: 60000 })).pt, 166);
  assert.equal((await ptFor({ state: '10', monthly: 100000 })).pt, 208);
  assert.equal((await ptFor({ state: '10', monthly: 100000, period: '2027-03' })).pt, 212);
});

test('half-yearly states deduct only in the named months: Chennai in September and March, Kerala in August and February', async () => {
  assert.equal((await ptFor({ state: '33', monthly: 10000, period: '2026-09' })).pt, 930, 'sixty thousand a half-year');
  assert.equal((await ptFor({ state: '33', monthly: 10000, period: '2026-10' })).pt, 0);
  assert.equal((await ptFor({ state: '33', monthly: 3500, period: '2026-09' })).pt, 0);
  assert.equal((await ptFor({ state: '33', monthly: 20000, period: '2027-03' })).pt, 1250);
  const kerala = await ptFor({ state: '32', monthly: 5000, period: '2026-08' });
  assert.equal(kerala.pt, 300, 'thirty thousand a half-year');
  assert.match(kerala.notes.join(' '), /half-yearly/);
  assert.equal((await ptFor({ state: '32', monthly: 5000, period: '2026-09' })).pt, 0);
  assert.equal((await ptFor({ state: '32', monthly: 1999, period: '2027-02' })).pt, 0);
  assert.equal((await ptFor({ state: '32', monthly: 25000, period: '2027-02' })).pt, 1250);
});

test('Maharashtra keeps its slabs by sex and February charge; an unknown state still deducts nothing and says so', async () => {
  assert.equal((await ptFor({ state: '27', monthly: 9000 })).pt, 175);
  assert.equal((await ptFor({ state: '27', monthly: 9000, sex: 'female' })).pt, 0);
  assert.equal((await ptFor({ state: '27', monthly: 30000, period: '2027-02' })).pt, 300);
  const unknown = await ptFor({ state: '07', monthly: 30000 });
  assert.equal(unknown.pt, 0);
  assert.match(unknown.notes.join(' '), /not in MyCA's rules yet/);
});
