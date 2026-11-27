import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { computePayroll } from '../src/payroll.mjs';
import { pfEcr, esiReturn } from '../src/payroll-files.mjs';

const PERIOD = '2026-10';

async function shop(extra = {}) {
  const state = createState();
  state.company = { ...state.company, name: 'Anita Clinic', gstin: '36AABCU9603R1ZN', state: '36' };
  const added = await runTool(state, 'add_employee', { name: 'Meena', joinedOn: '2026-04-01', components: [{ name: 'Basic', amount: 15000 }, { name: 'HRA', amount: 3000 }], pfMember: true, esiMember: true, ptState: '36', sex: 'female', uan: '101234567890', esiNumber: '3112345678', pan: 'ABCDE1234F', ...extra });
  assert.equal(added.ok, true, JSON.stringify(added));
  return state;
}

const adjust = (state, args) => runTool(state, 'set_payroll_adjustment', { id: 'EMP-0001', period: PERIOD, ...args });
const row = (state) => computePayroll(state, PERIOD).data.rows[0];

test('with no changes the pay is exactly what it was', async () => {
  const state = await shop();
  const before = row(state);
  assert.equal(before.gross, 18000);
  assert.equal(before.paidDays, 31);
  assert.equal(before.lopDays, 0);
});

test('two days of loss of pay reduce the days paid, the gross and the provident fund wages in proportion', async () => {
  const state = await shop();
  assert.equal((await adjust(state, { lopDays: 2 })).ok, true);
  const r = row(state);
  assert.equal(r.daysWorked, 31);
  assert.equal(r.paidDays, 29);
  assert.equal(r.lopDays, 2);
    assert.ok(Math.abs(r.gross - 16838.71) < 0.02, `gross ${r.gross}`);
  assert.ok(Math.abs(r.pfWages - 14032.26) < 0.02, `pf wages ${r.pfWages}`);
});

test('half a day of loss of pay works', async () => {
  const state = await shop();
  assert.equal((await adjust(state, { lopDays: 0.5 })).ok, true);
  assert.equal(row(state).paidDays, 30.5);
});

test('overtime, a bonus and arrears are added to gross pay but are not provident fund wages', async () => {
  const state = await shop();
  const plain = row(state);
  assert.equal((await adjust(state, { overtime: 1200, bonus: 3000, arrears: 500 })).ok, true);
  const r = row(state);
  assert.equal(r.gross, plain.gross + 4700);
  assert.equal(r.pfWages, plain.pfWages, 'only basic and dearness allowance count');
  const names = r.components.map((c) => c.name);
  assert.deepEqual(names.slice(-3), ['Overtime', 'Bonus', 'Arrears']);
});

test('state insurance is worked out on the pay including overtime and bonus', async () => {
  const state = await shop({ components: [{ name: 'Basic', amount: 15000 }] });
  const plain = row(state);
  await adjust(state, { overtime: 2000 });
  const r = row(state);
  assert.ok(r.esiEmployer > plain.esiEmployer, 'employer share grows with overtime');
  assert.ok(r.esiEmployer >= Math.ceil(17000 * 0.0325 - 1e-9), `esi employer ${r.esiEmployer}`);
});

test('giving all zeros clears the month for that employee', async () => {
  const state = await shop();
  await adjust(state, { lopDays: 3, bonus: 500 });
  const cleared = await adjust(state, { lopDays: 0, overtime: 0, bonus: 0, arrears: 0 });
  assert.equal(cleared.cleared, true);
  assert.equal(row(state).gross, 18000);
  assert.deepEqual(state.payrollAdjustments ?? {}, {});
});

test('a second call replaces the first, it does not add to it', async () => {
  const state = await shop();
  await adjust(state, { bonus: 1000 });
  await adjust(state, { bonus: 400 });
  assert.equal(row(state).gross, 18400);
});

test('a bad value is refused with a reason and changes nothing', async () => {
  const state = await shop();
  const tries = [
    [{ lopDays: 32 }, 'LOP_EXCEEDS_DAYS'],
    [{ lopDays: 0.3 }, 'BAD_LOP_DAYS'],
    [{ lopDays: -1 }, 'BAD_LOP_DAYS'],
    [{ bonus: -5 }, 'BAD_AMOUNT'],
    [{ overtime: 'lots' }, 'BAD_AMOUNT'],
    [{ arrears: 99999999 }, 'BAD_AMOUNT'],
    [{ bonus: 10.123 }, 'BAD_AMOUNT'],
    [{ period: '2026-13', bonus: 1 }, 'INVALID_PERIOD'],
    [{ id: 'EMP-0099', bonus: 1 }, 'EMPLOYEE_NOT_FOUND'],
    [{}, 'NOTHING_TO_CHANGE'],
  ];
  for (const [args, error] of tries) {
    const out = await adjust(state, args);
    assert.equal(out.ok, false, JSON.stringify(args));
    assert.equal(out.error, error, JSON.stringify(args));
  }
  assert.deepEqual(state.payrollAdjustments ?? {}, {});
  assert.equal(row(state).gross, 18000);
});

test('a month the employee did not work cannot be adjusted', async () => {
  const state = await shop({ joinedOn: '2026-11-10' });
  const out = await adjust(state, { bonus: 100 });
  assert.equal(out.error, 'NOT_EMPLOYED');
});

test('loss of pay cannot exceed the days employed, so a mid-month joiner is bounded', async () => {
  const state = await shop({ joinedOn: '2026-10-21' });
  assert.equal((await adjust(state, { lopDays: 12 })).error, 'LOP_EXCEEDS_DAYS');
  assert.equal((await adjust(state, { lopDays: 11 })).ok, true);
  assert.equal(row(state).paidDays, 0);
  assert.equal(row(state).gross, 0);
});

test('an employee on loss of pay for the whole month is paid nothing and nothing is deducted', async () => {
  const state = await shop();
  await adjust(state, { lopDays: 31 });
  const r = row(state);
  assert.equal(r.gross, 0);
  assert.equal(r.net, 0);
  assert.equal(r.tds, 0);
  assert.equal(r.pt, 0, 'no professional tax from no pay');
  assert.ok(r.net >= 0);
});

test('professional tax follows the pay actually earned when there is loss of pay, and never exceeds what the pay can bear', async () => {
  const full = await shop();
  const slabFull = row(full).pt;
  const state = await shop();
  await adjust(state, { lopDays: 29 });
  const r = row(state);
  assert.ok(r.pt <= slabFull);
  assert.ok(r.net >= 0, `net ${r.net}`);
});

test('a high earner on a long loss of pay is deducted only what the pay can bear, never to a negative net', async () => {
  const state = await shop({ components: [{ name: 'Basic', amount: 500000 }], pfMember: false, esiMember: false });
  await adjust(state, { lopDays: 30 });
  const r = row(state);
  assert.ok(r.gross > 0 && r.gross < 20000, `gross ${r.gross}`);
  assert.ok(r.net >= 0, `net ${r.net}`);
  assert.ok(r.tds <= r.gross);
  assert.match(r.notes.join(' '), /too low to deduct all the TDS due|too low to deduct the full professional tax/);
  const draft = await runTool(state, 'payroll_run', { period: PERIOD });
  const approved = await runTool(state, 'approve_payroll', { period: PERIOD, draftHash: draft.data.draftHash });
  assert.equal(approved.ok, true, JSON.stringify(approved));
});

test('once the month is approved its pay can no longer be changed', async () => {
  const state = await shop();
  await adjust(state, { bonus: 1000 });
  const draft = await runTool(state, 'payroll_run', { period: PERIOD });
  const approved = await runTool(state, 'approve_payroll', { period: PERIOD, draftHash: draft.data.draftHash });
  assert.equal(approved.ok, true, JSON.stringify(approved));
  assert.equal((await adjust(state, { bonus: 5 })).error, 'ALREADY_APPROVED');
});

test('an approved month with changes balances in the books and keeps the figures', async () => {
  const state = await shop();
  await adjust(state, { lopDays: 2, overtime: 800, bonus: 1500 });
  const draft = await runTool(state, 'payroll_run', { period: PERIOD });
  const approved = await runTool(state, 'approve_payroll', { period: PERIOD, draftHash: draft.data.draftHash });
  assert.equal(approved.ok, true, JSON.stringify(approved));
  assert.ok(approved.run.frozen);
  const frozen = approved.run.rows[0];
  assert.equal(frozen.lopDays, 2);
  assert.equal(frozen.paidDays, 29);
  assert.equal(frozen.net + frozen.deductions, frozen.gross, 'net plus deductions is gross');
});

test('a locked month cannot be changed', async () => {
  const state = await shop();
  state.lockThrough = '2026-10-31';
  assert.equal((await adjust(state, { bonus: 100 })).error, 'PERIOD_LOCKED');
});

test('only the owner can set them', async () => {
  const state = await shop();
  state.__actor = { userId: 'u2', role: 'staff' };
  assert.equal((await adjust(state, { bonus: 100 })).error, 'SALARIES_PRIVATE');
});

test('the ECR and the state insurance file carry the days actually paid', async () => {
  const state = await shop();
  await adjust(state, { lopDays: 4 });
  const draft = await runTool(state, 'payroll_run', { period: PERIOD });
  await runTool(state, 'approve_payroll', { period: PERIOD, draftHash: draft.data.draftHash });
  const ecr = pfEcr(state, PERIOD);
  assert.equal(ecr.ok, true, JSON.stringify(ecr));
  const esi = esiReturn(state, PERIOD);
  assert.equal(esi.ok, true, JSON.stringify(esi));
  const ecrRow = (ecr.rows || ecr.data?.rows)[0];
  assert.equal(ecrRow.ncpDays, 4);
  const esiRow = (esi.rows || esi.data?.rows)[0];
  assert.equal(esiRow.daysWorked, 27);
});

test('the preview says in plain words what will change', async () => {
  const state = await shop();
  const { previewOf } = await import('../src/chat-confirm.mjs');
  const preview = previewOf(state, 'set_payroll_adjustment', { id: 'EMP-0001', period: PERIOD, lopDays: 2, bonus: 1500 });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /Meena, 2026-10: 2 days loss of pay, bonus/);
  assert.match(preview.effects.join(' '), /pay is for 29 of them/);
  const blocked = previewOf(state, 'set_payroll_adjustment', { id: 'EMP-0001', period: PERIOD, lopDays: 40 });
  assert.match(blocked.blockers[0], /up to 31 can be loss of pay/);
});
