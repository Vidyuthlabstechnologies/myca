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
