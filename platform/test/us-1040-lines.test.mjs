import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040 } from '../src/us-1040.mjs';
import { form1040Line, form1040Amount, lineLabels, LINE_MAP_YEARS } from '../src/us-line-map.mjs';
import { form1040MefLines, scheduleMefDocuments, repeatedLines } from '../src/us-mef-map.mjs';

const w2 = (wages, withheld) => ({ kind: 'W-2', owner: 'taxpayer', payer: 'Acme Inc', fields: { wages, federalWithheld: withheld, socialSecurityWages: Math.min(wages, 168600), socialSecurityTax: Math.round(Math.min(wages, 168600) * 6.2) / 100, medicareWages: wages, medicareTax: Math.round(wages * 1.45) / 100 } });
const senior = { firstName: 'Rosa', lastName: 'Diaz', dateOfBirth: '1959-05-01' };
const younger = { firstName: 'Ana', lastName: 'Diaz', dateOfBirth: '1985-06-01' };
const son = { firstName: 'Leo', relationship: 'son', dateOfBirth: '2015-02-02', months: 12 };

const worker = (year) => computeForm1040({
  filingStatus: 'hoh',
  taxpayer: senior,
  dependents: [son],
  forms: [w2(40000, 1000), { kind: '1099-NEC', payer: 'Client LLC', fields: { nonemployeeCompensation: 2000 } }, { kind: '1099-B', payer: 'Broker', fields: { proceeds: 1000, costBasis: 0, term: 'long' } }],
  answers: { qualifiedTips: 3000, qualifiedOvertime: 2000, carLoanInterest: 1000, charityCash: 500 },
}, year);

const earner = (year) => computeForm1040({
  filingStatus: 'single',
  taxpayer: younger,
  forms: [w2(230000, 50000), { kind: '1099-INT', payer: 'First Bank', fields: { interest: 10000 } }, { kind: '1099-R', payer: 'Vanguard', fields: { grossDistribution: 10000, taxableAmount: 10000, iraSepSimple: true, distributionCode: '1' } }, { kind: '1099-SA', payer: 'HSA Bank', fields: { grossDistribution: 1000, distributionCode: '1', accountType: 'HSA' } }],
  answers: { rmdShortfall: true, rmdRequired: 20000, rmdDistributed: 12000, hsaQualifiedExpenses: 500, itemize: 'yes', charityCash: 5000, otherItemizedDeductions: 1000 },
}, year);

const absent = (object, keys) => keys.filter((key) => Object.hasOwn(object, key));

test('the line map covers the two supported years and points each meaning at the form line: AGI 11b, deduction 12e, total tax 24 (2025) and 24c (2026)', () => {
  assert.deepEqual(LINE_MAP_YEARS, ['2025', '2026']);
  assert.deepEqual(['agi', 'deduction', 'qbiDeduction', 'additionalDeductions', 'totalTax', 'earnedIncomeCredit', 'otherPayments', 'capitalGain'].map((name) => form1040Line('2025', name)), ['11b', '12e', '13a', '13b', '24', '27a', '32', '7a']);
  assert.deepEqual(['agi', 'deduction', 'nonItemizerCharity', 'qbiDeduction', 'additionalDeductions', 'totalTax', 'earnedIncomeCredit', 'otherPayments', 'capitalGain'].map((name) => form1040Line('2026', name)), ['11b', '12e', '12f', '13b', '13a', '24c', '27a', '32c', '7a']);
  assert.equal(form1040Line('2025', 'nonItemizerCharity'), null);
  assert.equal(form1040Amount({ taxYear: 2026, lines: { '24a': 5, '24c': 7 } }, 'totalTax'), 7);
  assert.throws(() => form1040Line('2024', 'agi'), /US_LINE_MAP_YEAR_UNKNOWN/);
});

test('2025 final Form 1040: 7a, 11a and 11b, 12e, 13a QBI, 13b Schedule 1-A line 38, 27a; tips 3,000 + overtime 2,000 + car loan 1,000 + senior 6,000 = 12,000 on Schedule 1-A lines 13, 21, 30, 37, 38', () => {
  const out = worker('2025');
  assert.equal(out.ok, true, JSON.stringify(out));
  const { lines, schedules, summary } = out.data;
  assert.deepEqual(absent(lines, ['7', '11', '12', '12f', '24a', '24c', '27', '32a', '32c']), []);
  assert.equal(lines['7a'], 1000);
  assert.equal(lines['11a'], summary.agi);
  assert.equal(lines['11b'], summary.agi);
  assert.equal(lines['12e'], summary.deduction);
  assert.ok(lines['13a'] > 0);
  assert.equal(lines['13a'], schedules['8995']['15']);
  assert.equal(lines['13b'], 12000);
  assert.equal(lines['14'], lines['12e'] + lines['13a'] + lines['13b']);
  assert.equal(lines['24'], summary.totalTax);
  assert.ok(lines['27a'] > 0);
  assert.equal(lines['27a'], schedules.EIC.credit);
  assert.equal(lines['32'], lines['27a'] + lines['28'] + lines['29'] + lines['31']);
  assert.deepEqual(schedules['1-A'], { 13: 3000, 21: 2000, 30: 1000, 37: 6000, 38: 12000 });
});

test('2026 draft Form 1040: 12f non-itemizer charity 500 outside Schedule 1-A, 13a Schedule 1-A line 44, 13b QBI, 24a and 24c, 32a and 32c; Schedule 1-A lines 15, 27, 36, 43, 44', () => {
  const out = worker('2026');
  assert.equal(out.ok, true, JSON.stringify(out));
  const { lines, schedules, summary } = out.data;
  assert.deepEqual(absent(lines, ['7', '11', '12', '24', '27', '32']), []);
  assert.equal(lines['7a'], 1000);
  assert.equal(lines['11a'], summary.agi);
  assert.equal(lines['11b'], summary.agi);
  assert.equal(lines['12e'], summary.deduction);
  assert.equal(lines['12f'], 500);
  assert.equal(lines['13a'], 12000);
  assert.ok(lines['13b'] > 0);
  assert.equal(lines['13b'], schedules['8995']['15']);
  assert.equal(lines['14'], lines['12e'] + lines['12f'] + lines['13a'] + lines['13b']);
  assert.equal(lines['24a'], summary.totalTax);
  assert.equal(lines['24c'], lines['24a']);
  assert.equal(lines['27a'], schedules.EIC.credit);
  assert.equal(lines['32a'], lines['27a'] + lines['28'] + lines['29'] + lines['31']);
  assert.equal(lines['32c'], lines['32a']);
  assert.equal(lines['33'], lines['25d'] + lines['26'] + lines['32c']);
  assert.deepEqual(schedules['1-A'], { 15: 3000, 27: 2000, 36: 1000, 43: 6000, 44: 12000 });
});

test('2025 Schedule 2 and Schedule A: early distribution 10% of 10,000 = 1,000 plus RMD shortfall 8,000 x 25% = 2,000 on line 8, Additional Medicare 0.9% of 30,000 = 270 on line 11, NIIT 3.8% of 10,000 = 380 on line 12, HSA 20% of 500 = 100 on 17c and 18; gifts on 14, other on 16, total on 17', () => {
  const out = earner('2025');
  assert.equal(out.ok, true, JSON.stringify(out));
  const { lines, schedules } = out.data;
  const two = schedules['2'];
  assert.deepEqual([two['8'], two['11'], two['12'], two['17c'], two['18'], two['21']], [3000, 270, 380, 100, 100, 3750]);
  assert.deepEqual(absent(two, ['5', '6', '13c', '14', '15', '17b', '20']), []);
  assert.equal(lines['23'], 3750);
  assert.deepEqual([schedules['8959']['7'], schedules['8959']['18']], [270, 270]);
  const a = schedules.A;
  assert.equal(a['14'], 5000);
  assert.equal(a['16'], 1000);
  assert.equal(a['17'], lines['12e']);
  assert.deepEqual(absent(a, ['13', '15', '17z', '18']), []);
});

test('2026 draft Schedule 2 and Schedule A: early tax 1,000 on line 5, RMD 2,000 on line 18, NIIT 380 on line 6, HSA 100 on 13c and 14, Additional Medicare on wages 270 on 17b and 17d, 15 = 1,480, 20 = 2,270, 21 = 3,750; gifts on 13 and 15, other on 17z, total on 18', () => {
  const out = earner('2026');
  assert.equal(out.ok, true, JSON.stringify(out));
  const { lines, schedules } = out.data;
  const two = schedules['2'];
  assert.deepEqual([two['5'], two['6'], two['11'], two['13c'], two['14'], two['15'], two['17b'], two['17d'], two['18'], two['20'], two['21']], [1000, 380, 0, 100, 100, 1480, 270, 270, 2000, 2270, 3750]);
  assert.deepEqual(absent(two, ['8', '12', '17c']), []);
  assert.equal(lines['23'], 3750);
  assert.deepEqual([schedules['8959']['7'], schedules['8959']['12'], schedules['8959']['18']], [270, 270, 0]);
  const a = schedules.A;
  assert.ok(a['13'] > 0 && a['13'] < 5000);
  assert.equal(a['15'], a['13']);
  assert.equal(a['17z'], 1000);
  assert.equal(a['18'], lines['12e']);
  assert.deepEqual(absent(a, ['14', '16', '17']), []);
});

test('review labels follow the year: 2025 13b and Schedule 1-A 38, 2026 12f, 13a and Schedule 1-A 44', () => {
  const labels = (year, form) => Object.fromEntries(lineLabels(year)[form]);
  assert.equal(labels('2025', '1040')['13b'], 'Additional deductions (Schedule 1-A)');
  assert.equal(labels('2025', '1040')['12f'], undefined);
  assert.equal(labels('2026', '1040')['13a'], 'Additional deductions (Schedule 1-A)');
  assert.equal(labels('2026', '1040')['13b'], 'Qualified business income deduction');
  assert.equal(labels('2026', '1040')['12f'], 'Charitable contribution deduction for non-itemizers');
  assert.equal(labels('2025', 'Schedule 1-A')['38'], 'Total additional deductions');
  assert.equal(labels('2026', 'Schedule 1-A')['44'], 'Total additional deductions');
  assert.equal(labels('2026', 'Schedule 3')['5b'], undefined);
  assert.equal(labels('2026', 'Schedule A')['17z'], 'Other itemized deductions');
});

test('the e-file map follows the year: 2026 13a is the Schedule 1-A total and 13b the QBI deduction, and repeated lines are not sent twice', () => {
  assert.equal(form1040MefLines('2025')['11a'], 'AdjustedGrossIncomeAmt');
  assert.equal(form1040MefLines('2025')['13a'], 'QualifiedBusinessIncomeDedAmt');
  assert.equal(form1040MefLines('2026')['13a'], 'TotalAdditionalDeductionsAmt');
  assert.equal(form1040MefLines('2026')['13b'], 'QualifiedBusinessIncomeDedAmt');
  assert.equal(form1040MefLines('2026')['24a'], 'TotalTaxAmt');
  assert.equal(scheduleMefDocuments('2026')['2'].lines['6'], 'NetInvestmentIncomeTaxAmt');
  assert.deepEqual(repeatedLines('2025', '1040'), ['11b']);
  assert.deepEqual(repeatedLines('2026', '1040'), ['11b', '24c', '32c']);
});
