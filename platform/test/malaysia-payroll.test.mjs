import test from 'node:test';
import assert from 'node:assert/strict';
import { malaysiaPayroll } from '../src/countries/malaysia/payroll.mjs';
import { ENGINE } from '../src/countries/malaysia/engine.mjs';
import { rules } from '../src/sprint-load.mjs';

const one = (employee, month = '2026-10') => malaysiaPayroll({ month, employees: [employee] }).data.employees[0];

test('the SOCSO and EIS rows match every row PERKESO publishes from RM5,000.01 to RM6,000', () => {
  const published = [[5100, 8835, 2525, 1010], [5200, 9015, 2575, 1030], [5300, 9185, 2625, 1050], [5400, 9365, 2675, 1070], [5500, 9535, 2725, 1090], [5600, 9715, 2775, 1110], [5700, 9885, 2825, 1130], [5800, 10065, 2875, 1150], [5900, 10235, 2925, 1170], [6000, 10415, 2975, 1190], [1100, 1835, 525, 210]];
  const socso = rules.rule('my.payroll.socso', '2026-10-01').value.rows;
  const eis = rules.rule('my.payroll.eis', '2026-10-01').value.rows;
  for (const [wage, employer, employee, each] of published) {
    assert.deepEqual(socso.find((row) => row[0] === wage * 100), [wage * 100, employer, employee], `SOCSO ${wage}`);
    assert.deepEqual(eis.find((row) => row[0] === wage * 100), [wage * 100, each], `EIS ${wage}`);
  }
});

test('a RM3,000 employee pays EPF 11% and the employer 13%, with SOCSO and EIS from the band', () => {
  const row = one({ name: 'Aina', wages: 3000 });
  assert.deepEqual(row.epf, { employee: 330, employer: 390, basis: 'band' });
  assert.deepEqual(row.socso, { employee: 14.75, employer: 51.65 });
  assert.deepEqual(row.eis, { employee: 5.9, employer: 5.9 });
  assert.equal(row.netBeforePcb, 2649.35);
  assert.equal(row.employerCost, 3447.55);
});

test('EPF uses the top of the band and rounds up; 12% above RM5,000; exact above RM20,000', () => {
  assert.deepEqual(one({ wages: 1010 }).epf, { employee: 113, employer: 133, basis: 'band' });
  assert.deepEqual(one({ wages: 5450 }).epf, { employee: 605, employer: 660, basis: 'band' });
  const high = one({ wages: 25000 });
  assert.deepEqual(high.epf, { employee: 2750, employer: 3000, basis: 'exact' });
  assert.deepEqual(high.socso, { employee: 29.75, employer: 104.15 });
  assert.equal(high.eis.employee, 11.9);
});

test('over 60 and non-Malaysian workers get their own rates', () => {
  const senior = one({ wages: 3000, age: 62 });
  assert.deepEqual(senior.epf, { employee: 0, employer: 120, basis: 'band' });
  assert.equal(senior.socso.employer, 0);
  assert.ok(senior.notes.length);
  const foreign = one({ wages: 3000, citizen: false });
  assert.deepEqual(foreign.epf, { employee: 60, employer: 60, basis: 'non-citizen' });
  assert.equal(foreign.eis.employee, 0);
});

test('totals, due date and refusals', () => {
  const out = malaysiaPayroll({ month: '2026-12', employees: [{ wages: 3000 }, { wages: 5500 }] });
  assert.equal(out.data.dueBy, '2027-01-15');
  assert.equal(out.data.totals.wages, 8500);
  assert.equal(malaysiaPayroll({ month: '2026-13', employees: [] }).error, 'BAD_MONTH');
  assert.equal(malaysiaPayroll({ month: '2026-10', employees: [{ wages: -1 }] }).error, 'BAD_INPUT');
  assert.equal(malaysiaPayroll({ month: '2023-10', employees: [{ wages: 1 }] }).error, 'RULE_NOT_IN_FORCE');
  assert.match(ENGINE.words.my_payroll(out), /due by 2027-01-15/);
});

test('PCB by the computerised method: RM5,000 single is RM110 in January and every month after', () => {
  const january = one({ wages: 5000 }, '2026-01');
  assert.deepEqual(january.pcb, { amount: 110, normal: 110, onBonus: 0, zakatOffset: 0, category: 1, children: 0, method: 'computerised', yearlyChargeableIncome: 47000, yearlyTax: 1320 });
  assert.equal(january.netPay, 4305.35);
  const june = one({ wages: 5000 }, '2026-06');
  assert.equal(june.pcb.amount, 110);
  assert.match(june.notes.join(' '), /same pay and PCB every month since January/);
  const exact = one({ wages: 5000, yearToDate: { income: 25000, epf: 2750, pcb: 550 } }, '2026-06');
  assert.equal(exact.pcb.amount, 110);
  assert.doesNotMatch(exact.notes.join(' '), /since January/);
});

test('PCB category 2 takes spouse relief and the RM800 rebate band; children take RM2,000 each', () => {
  assert.equal(one({ wages: 5000, pcbCategory: 2, children: 2 }, '2026-01').pcb.amount, 70);
  assert.equal(one({ wages: 3000 }, '2026-01').pcb.amount, 0);
});

test('PCB on a bonus is the extra yearly tax it causes, and EPF on the bonus counts toward the RM4,000 cap', () => {
  const row = one({ wages: 5000, bonus: 10000 }, '2026-01');
  assert.equal(row.epf.employee, 1650);
  assert.equal(row.pcb.normal, 110);
  assert.equal(row.pcb.onBonus, 950);
  assert.equal(row.pcb.amount, 1060);
  assert.equal(row.netPay, 12255.35);
});

test('zakat this month reduces PCB, and anything under RM10 is not deducted', () => {
  assert.equal(one({ wages: 5000, zakat: 50 }, '2026-01').pcb.amount, 60);
  const small = one({ wages: 5000, zakat: 105 }, '2026-01');
  assert.equal(small.pcb.amount, 0);
  assert.equal(small.pcb.zakatOffset, 105);
});

test('non-residents pay PCB at the flat non-resident rate; PCB inputs are checked', () => {
  const row = one({ wages: 5000, resident: false, citizen: false }, '2026-01');
  assert.equal(row.pcb.amount, 1500);
  assert.equal(row.pcb.method, 'non-resident flat rate');
  const bad = malaysiaPayroll({ month: '2026-01', employees: [{ wages: 5000, pcbCategory: 4, children: -1, bonus: -5 }] });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.problems.map((problem) => problem.field), ['bonus']);
  const badCategory = malaysiaPayroll({ month: '2026-01', employees: [{ wages: 5000, pcbCategory: 4 }] });
  assert.deepEqual(badCategory.problems.map((problem) => problem.field), ['pcbCategory']);
});

test('the payroll totals PCB and lists the PCB rules it used', () => {
  const run = malaysiaPayroll({ month: '2026-01', employees: [{ wages: 5000 }, { wages: 5000, pcbCategory: 2, children: 2 }] });
  assert.equal(run.data.totals.pcb, 180);
  assert.ok(run.data.rulesUsed.some((rule) => rule.id === 'my.payroll.pcb'));
  assert.match(ENGINE.words.my_payroll(run), /PCB RM ?180/);
});
