import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040 } from '../src/us-1040.mjs';

const w2 = (wages, withheld = 0, extra = {}) => ({ kind: 'W-2', owner: 'taxpayer', payer: 'Acme Inc', fields: { wages, federalWithheld: withheld, socialSecurityWages: wages, socialSecurityTax: Math.round(wages * 0.062 * 100) / 100, medicareWages: wages, medicareTax: Math.round(wages * 0.0145 * 100) / 100, ...extra } });
const adult = { firstName: 'Ana', lastName: 'Diaz', dateOfBirth: '1988-04-02' };
const spouse = { firstName: 'Sam', lastName: 'Diaz', dateOfBirth: '1987-01-05' };
const kid = (firstName, dateOfBirth, more = {}) => ({ firstName, relationship: 'son', dateOfBirth, months: 12, ...more });
const run = (filingStatus, forms, more = {}, year = '2025') => computeForm1040({ filingStatus, taxpayer: adult, ...(filingStatus === 'mfj' ? { spouse } : {}), forms, ...more }, year);
const codes = (out) => out.data.checks.map((item) => item.code);
const needs = (out) => out.data.unsupported.filter((item) => item.required !== false).map((item) => item.form);
const lt = (gain) => ({ kind: '1099-B', payer: 'Broker', fields: { proceeds: Math.max(0, gain), costBasis: Math.max(0, -gain), term: 'long' } });
const st = (gain) => ({ kind: '1099-B', payer: 'Broker', fields: { proceeds: Math.max(0, gain), costBasis: Math.max(0, -gain), term: 'short' } });

test('Form 1040 instructions, Tax Computation Worksheet: 2025 single taxable income exactly at the 24%/32% boundary of $197,300', () => {
  const out = run('single', [w2(213050)]);
  assert.equal(out.data.lines['15'], 197300);
  assert.equal(out.data.lines['16'], 40199);
});

test('Tax Computation Worksheet: 2026 joint taxable income exactly at the 22%/24% boundary of $211,400', () => {
  const out = run('mfj', [w2(243600)], {}, '2026');
  assert.equal(out.data.lines['12'], 32200);
  assert.equal(out.data.lines['15'], 211400);
  assert.equal(out.data.lines['16'], 35932);
});

test('2025 Tax Table last row ($99,950 to $100,000) versus the Tax Computation Worksheet at exactly $100,000', () => {
  assert.equal(run('single', [w2(115749)]).data.lines['16'], 16909);
  assert.equal(run('single', [w2(115750)]).data.lines['16'], 16914);
});

test('Head of household 2025: standard deduction $23,625 and HOH brackets', () => {
  const out = run('hoh', [w2(60000)], { dependents: [kid('Leo', '2005-01-01', { relationship: 'parent', months: 0 })] });
  assert.equal(out.data.lines['12'], 23625);
  assert.equal(out.data.lines['15'], 36375);
  assert.equal(out.data.lines['16'], 4025);
});

test('Qualifying surviving spouse: joint brackets and standard deduction, but the $200,000 child tax credit threshold (IRC 24(b)(2), Schedule 8812 line 9)', () => {
  const out = run('qss', [w2(250000)], { dependents: [kid('Mia', '2015-03-01', { relationship: 'daughter' })] });
  assert.equal(out.data.lines['12'], 31500);
  assert.equal(out.data.lines['15'], 218500);
  assert.equal(out.data.schedules['8812']['9'], 200000);
  assert.equal(out.data.schedules['8812']['12'], 0);
  assert.equal(out.data.lines['19'], 0);
  assert.equal(out.data.schedules['8959']['7'], 450);
});

test('Qualifying surviving spouse: Social Security Benefits Worksheet line 8 base is $25,000, not the joint $32,000', () => {
  const out = run('qss', [{ kind: 'SSA-1099', fields: { netBenefits: 20000 } }, { kind: '1099-R', payer: 'Pension', fields: { grossDistribution: 30000, taxableAmount: 30000, distributionCode: '7' } }], { dependents: [kid('Mia', '2015-03-01', { relationship: 'daughter' })] });
  assert.equal(out.data.socialSecurityWorksheet['8'], 25000);
  assert.equal(out.data.lines['6b'], 9600);
});

test('Qualifying surviving spouse: Schedule 1-A uses the non-joint thresholds and overtime cap; Form 8863 uses the $80,000 to $90,000 range', () => {
  const out = run('qss', [w2(85000), { kind: '1098-T', payer: 'College', fields: { tuitionPaid: 4000, atLeastHalfTime: true } }], { dependents: [kid('Mia', '2015-03-01', { relationship: 'daughter' })], answers: { qualifiedOvertime: 20000 } });
  assert.equal(out.data.schedules['1-A']['21'], 12500);
  assert.equal(out.data.schedules['8863'].phaseOutFraction, 0.5);
  assert.equal(out.data.schedules['8863']['7'], 1250);
  const senior = computeForm1040({ filingStatus: 'qss', taxpayer: { ...adult, dateOfBirth: '1958-06-01' }, dependents: [kid('Mia', '2010-03-01', { relationship: 'daughter' })], forms: [w2(100000)] }, '2025');
  assert.equal(senior.data.schedules['1-A']['37'], 4500);
  assert.equal(senior.data.lines['12'], 33100);
});

test('Married filing separately: no student loan interest deduction, no education credit, no EIC while living together', () => {
  const kids = [kid('Leo', '2016-02-02')];
  const out = run('mfs', [w2(20000), { kind: '1098-E', payer: 'Lender', fields: { studentLoanInterest: 2000 } }, { kind: '1098-T', payer: 'College', fields: { tuitionPaid: 4000, atLeastHalfTime: true } }], { dependents: kids });
  assert.equal(out.data.schedules['1']['21'], 0);
  assert.equal(out.data.lines['29'], 0);
  assert.equal(out.data.lines['27'], 0);
  assert.ok(codes(out).includes('STUDENT_LOAN_MFS'));
  assert.ok(codes(out).includes('EDUCATION_MFS'));
  assert.ok(out.data.schedules.EIC.notAllowed.length > 0);
});

test('Married filing separately: the separated-spouse EIC rule (IRC 32(d)(2)) needs a qualifying child; 2025 EIC Table $20,000-$20,050 one child is $4,328', () => {
  const alone = run('mfs', [w2(20000)], { taxpayer: { ...adult, dateOfBirth: '1990-01-01' }, answers: { separatedFromSpouse: true } });
  assert.equal(alone.data.lines['27'], 0);
  const withChild = run('mfs', [w2(20000)], { dependents: [kid('Leo', '2016-02-02')], answers: { separatedFromSpouse: true } });
  assert.equal(withChild.data.lines['27'], 4328);
});

test('Married filing separately: capital loss limited to $1,500 (IRC 1211(b)) with the rest carried over', () => {
  const out = run('mfs', [w2(60000), st(-10000)]);
  assert.equal(out.data.lines['7'], -1500);
  assert.deepEqual(out.data.capitalLossCarryover, { shortTerm: 8500, longTerm: 0 });
});

test('Married filing separately: SALT cap is $20,000 (Schedule A line 5e)', () => {
  const out = run('mfs', [w2(100000, 0, { stateWithheld: 30000 })], { answers: { itemize: 'yes' } });
  assert.equal(out.data.schedules.A['5e'], 20000);
});

test('Standard deduction chart for people born before January 2, 1961 or blind: 2025 single, joint, HOH and QSS additional amounts', () => {
  assert.equal(run('single', [w2(50000)], { taxpayer: { ...adult, dateOfBirth: '1960-03-01', blind: true } }).data.lines['12'], 19750);
  assert.equal(run('single', [w2(50000)], { taxpayer: { ...adult, dateOfBirth: '1961-01-01' } }).data.lines['12'], 17750);
  assert.equal(run('single', [w2(50000)], { taxpayer: { ...adult, dateOfBirth: '1961-01-02' } }).data.lines['12'], 15750);
  assert.equal(computeForm1040({ filingStatus: 'mfj', taxpayer: { ...adult, dateOfBirth: '1955-01-01' }, spouse: { ...spouse, dateOfBirth: '1956-01-01' }, forms: [w2(50000)] }, '2025').data.lines['12'], 34700);
  assert.equal(run('hoh', [w2(50000)], { taxpayer: { ...adult, dateOfBirth: '1955-01-01' }, dependents: [kid('Leo', '2016-02-02')] }).data.lines['12'], 25625);
});

test('Standard Deduction Worksheet for Dependents: greater of $1,350 or earned income plus $450, capped at the basic amount', () => {
  const dep = (wages) => run('single', [w2(wages)], { taxpayer: { ...adult, canBeClaimedAsDependent: true } }).data.lines['12'];
  assert.equal(dep(500), 1350);
  assert.equal(dep(3000), 3450);
  assert.equal(dep(20000), 15750);
  assert.equal(run('single', [{ kind: '1099-INT', payer: 'Bank', fields: { interest: 5000 } }], { taxpayer: { ...adult, canBeClaimedAsDependent: true } }).data.lines['15'], 3650);
});

test('Schedule A: itemizing only when larger than the standard deduction; equal amounts keep the standard deduction', () => {
  const equal = run('single', [w2(100000)], { answers: { otherItemizedDeductions: 15750 } });
  assert.equal(equal.data.summary.itemized, false);
  const larger = run('single', [w2(100000)], { answers: { otherItemizedDeductions: 15751 } });
  assert.equal(larger.data.summary.itemized, true);
  assert.equal(larger.data.lines['12'], 15751);
  const medical = run('single', [w2(100000)], { answers: { itemize: 'yes', medicalExpenses: 10000 } });
  assert.equal(medical.data.schedules.A['4'], 2500);
});

test('Schedule A line 5e: SALT cap $40,000 phased down by 30% of MAGI over $500,000 to the $10,000 floor (IRC 164(b)(7)); 2026 $40,400 above $505,000', () => {
  const at = (wages, year = '2025') => run('single', [w2(wages, 0, { stateWithheld: 60000 })], { answers: { itemize: 'yes' } }, year).data.schedules.A['5e'];
  assert.equal(at(500000), 40000);
  assert.equal(at(550000), 25000);
  assert.equal(at(600000), 10000);
  assert.equal(at(505000, '2026'), 40400);
});

test('Qualified Dividends and Capital Gain Tax Worksheet: 2025 single 0% band ends at $48,350', () => {
  const zero = run('single', [w2(15750), lt(48350)]);
  assert.equal(zero.data.lines['15'], 48350);
  assert.equal(zero.data.lines['16'], 0);
  const over = run('single', [w2(15750), lt(49350)]);
  assert.equal(over.data.qualifiedDividendsWorksheet['17'], 1000);
  assert.equal(over.data.lines['16'], 150);
});

test('Qualified Dividends and Capital Gain Tax Worksheet: 2025 single 20% above $533,400, and Form 8960 net investment income tax', () => {
  const out = run('single', [w2(15750), lt(600000)]);
  const ws = out.data.qualifiedDividendsWorksheet;
  assert.equal(ws['9'], 48350);
  assert.equal(ws['17'], 485050);
  assert.equal(ws['20'], 66600);
  assert.equal(out.data.lines['16'], 86078);
  assert.equal(out.data.schedules['8960']['17'], 15799);
});

test('Qualified dividends above ordinary dividends are capped at ordinary dividends (Form 1040 line 3a)', () => {
  const out = run('single', [w2(40000), { kind: '1099-DIV', payer: 'Fund', fields: { ordinaryDividends: 1000, qualifiedDividends: 5000 } }]);
  assert.equal(out.data.lines['3a'], 1000);
});

test('Capital Loss Carryover Worksheet: short- and long-term losses split the carryover', () => {
  const out = run('single', [w2(60000), st(-2000), lt(-5000)]);
  assert.equal(out.data.lines['7'], -3000);
  assert.deepEqual(out.data.capitalLossCarryover, { shortTerm: 0, longTerm: 4000 });
});

test('Capital Loss Carryover Worksheet: when taxable income is negative the whole loss carries over', () => {
  const out = run('single', [{ kind: '1099-INT', payer: 'Bank', fields: { interest: 1000 } }, st(-10000)]);
  assert.equal(out.data.lines['11'], -2000);
  assert.equal(out.data.lines['15'], 0);
  assert.deepEqual(out.data.capitalLossCarryover, { shortTerm: 10000, longTerm: 0 });
});

test('Schedule D line 6: a prior-year short-term carryover offsets this year\'s gains', () => {
  const out = run('single', [w2(60000), st(2000)], { answers: { shortTermLossCarryover: 5000 } });
  assert.equal(out.data.schedules.D['7'], -3000);
  assert.equal(out.data.lines['7'], -3000);
});

test('Form 8959: Additional Medicare Tax thresholds $250,000 joint and $125,000 separate', () => {
  const joint = computeForm1040({ filingStatus: 'mfj', taxpayer: adult, spouse, forms: [w2(150000), { ...w2(150000), owner: 'spouse' }] }, '2025');
  assert.equal(joint.data.schedules['8959']['7'], 450);
  assert.equal(joint.data.lines['25c'], 0);
  const separate = run('mfs', [w2(150000)]);
  assert.equal(separate.data.schedules['8959']['7'], 225);
});

test('Form 8960: no net investment income tax with MAGI exactly at the $250,000 joint threshold', () => {
  const out = run('mfj', [w2(240000), { kind: '1099-INT', payer: 'Bank', fields: { interest: 10000 } }]);
  assert.equal(out.data.lines['11'], 250000);
  assert.equal(out.data.schedules['8960'], undefined);
});

test('Schedule SE: wages above the 2025 $176,100 wage base leave only the 2.9% Medicare part; Form 8959 Part II', () => {
  const out = run('single', [w2(180000, 0, { socialSecurityWages: 176100, socialSecurityTax: 10918.2 })], { businesses: [{ name: 'Consulting', grossReceipts: 50000, totalExpenses: 0 }] });
  const se = out.data.schedules.SE[0].lines;
  assert.equal(se['9'], 0);
  assert.equal(se['10'], 0);
  assert.equal(se['12'], 1339);
  assert.equal(se['13'], 670);
  assert.equal(out.data.schedules['8959']['13'], 236);
});

test('Schedule SE: wages below the wage base use the room left (line 9) for the 12.4% part', () => {
  const out = run('single', [w2(150000)], { businesses: [{ name: 'Consulting', grossReceipts: 50000, totalExpenses: 0 }] });
  const se = out.data.schedules.SE[0].lines;
  assert.equal(se['9'], 26100);
  assert.equal(se['10'], 3236);
  assert.equal(se['12'], 4575);
});

test('Schedule SE: net earnings under $400 owe no SE tax and add nothing to Form 8959', () => {
  const out = run('single', [w2(30000)], { businesses: [{ name: 'Side', grossReceipts: 400, totalExpenses: 0 }] });
  assert.equal(out.data.schedules.SE[0].belowMinimum, true);
  assert.equal(out.data.lines['23'], 0);
});

test('Schedule 8812 lines 8-12: $2,200 a child and $500 other dependent reduced by $50 per $1,000 (or part) over $200,000', () => {
  const deps = [kid('A', '2012-01-01'), kid('B', '2014-01-01'), { firstName: 'Gran', relationship: 'parent', dateOfBirth: '1950-01-01', months: 12 }];
  const out = run('single', [w2(210500)], { dependents: deps });
  const f = out.data.schedules['8812'];
  assert.equal(f['8'], 4900);
  assert.equal(f['10'], 11000);
  assert.equal(f['12'], 4350);
  assert.equal(out.data.lines['19'], 4350);
});

test('Schedule 8812: a child who is 17 at the end of the year gets the $500 credit for other dependents', () => {
  const out = run('single', [w2(60000)], { dependents: [kid('Teen', '2008-06-01')] });
  assert.equal(out.data.schedules['8812']['4'], 0);
  assert.equal(out.data.schedules['8812']['6'], 1);
  assert.equal(out.data.lines['19'], 500);
});

test('Schedule 8812 Part II-A: refundable credit is 15% of earned income over $2,500, up to $1,700 a child; 2025 EIC Table $10,000-$10,050 one child is $3,409', () => {
  const out = run('hoh', [w2(10000)], { dependents: [kid('Leo', '2016-02-02')] });
  assert.equal(out.data.lines['19'], 0);
  assert.equal(out.data.schedules['8812']['17'], 1700);
  assert.equal(out.data.schedules['8812']['20'], 1125);
  assert.equal(out.data.lines['28'], 1125);
  assert.equal(out.data.lines['27'], 3409);
});

test('Schedule 8812 Part II-B: three children and withheld social security and Medicare above 15% of earned income', () => {
  const kids = [kid('A', '2012-01-01'), kid('B', '2014-01-01'), kid('C', '2016-01-01')];
  const out = run('hoh', [w2(3000), { kind: '1099-INT', payer: 'Bank', fields: { interest: 12000 } }], { dependents: kids });
  assert.equal(out.data.lines['27'], 0);
  assert.equal(out.data.schedules['8812']['20'], 75);
  assert.equal(out.data.lines['28'], 230);
});

test('Schedule 8812 instructions: from 2025 the filer needs an SSN valid for work for the child tax credit; the child still gets $500', () => {
  const out = run('single', [w2(60000)], { taxpayer: { ...adult, ssnValid: false }, dependents: [kid('Leo', '2016-02-02')] });
  assert.equal(out.data.schedules['8812']['4'], 0);
  assert.equal(out.data.lines['19'], 500);
  assert.ok(codes(out).includes('CTC_NEEDS_FILER_SSN'));
  const joint = computeForm1040({ filingStatus: 'mfj', taxpayer: { ...adult, ssnValid: false }, spouse, dependents: [kid('Leo', '2016-02-02')], forms: [w2(60000)] }, '2025');
  assert.equal(joint.data.schedules['8812']['4'], 1);
});

test('EIC Table 2025 by number of children, and the 25-64 age rule without a child', () => {
  const none = run('single', [w2(9000)], { taxpayer: { ...adult, dateOfBirth: '1995-01-01' } });
  assert.equal(none.data.lines['27'], 649);
  const young = run('single', [w2(9000)], { taxpayer: { ...adult, dateOfBirth: '2001-06-01' } });
  assert.equal(young.data.lines['27'], 0);
  const old = run('single', [w2(9000)], { taxpayer: { ...adult, dateOfBirth: '1960-06-01' } });
  assert.equal(old.data.lines['27'], 0);
  const two = run('hoh', [w2(25000)], { dependents: [kid('A', '2012-01-01'), kid('B', '2014-01-01')] });
  assert.equal(two.data.lines['27'], 6799);
  const twoJoint = run('mfj', [w2(25000)], { dependents: [kid('A', '2012-01-01'), kid('B', '2014-01-01')] });
  assert.equal(twoJoint.data.lines['27'], 7152);
});

test('EIC: investment income of exactly $11,950 is allowed, one dollar more is not (2025)', () => {
  const at = (interest) => run('hoh', [w2(15000), { kind: '1099-INT', payer: 'Bank', fields: { interest } }], { dependents: [kid('Leo', '2016-02-02')] }).data.lines['27'];
  assert.ok(at(11950) > 0);
  assert.equal(at(11951), 0);
});

test('EIC: a joint return needs an SSN valid for work for both spouses', () => {
  const out = computeForm1040({ filingStatus: 'mfj', taxpayer: adult, spouse: { ...spouse, ssnValid: false }, dependents: [kid('Leo', '2016-02-02')], forms: [w2(20000)] }, '2025');
  assert.equal(out.data.lines['27'], 0);
});

test('EIC Worksheet B: a Schedule C loss reduces earned income', () => {
  const out = run('hoh', [w2(20000)], { dependents: [kid('Leo', '2016-02-02')], businesses: [{ name: 'Side', grossReceipts: 1000, totalExpenses: 6000 }] });
  assert.equal(out.data.schedules.EIC.earnedIncome, 15000);
});

test('Form 8863: lifetime learning credit is 20% of up to $10,000; a dependent filer gets no education credit', () => {
  const llc = run('single', [w2(60000), { kind: '1098-T', payer: 'College', fields: { tuitionPaid: 12000, graduate: true } }]);
  assert.equal(llc.data.schedules['8863']['12'], 2000);
  assert.equal(llc.data.schedules['3']['3'], 2000);
  const dep = run('single', [w2(20000), { kind: '1098-T', payer: 'College', fields: { tuitionPaid: 4000, atLeastHalfTime: true } }], { taxpayer: { ...adult, canBeClaimedAsDependent: true } });
  assert.equal(dep.data.lines['29'], 0);
  assert.ok(codes(dep).includes('EDUCATION_DEPENDENT'));
});

test('Student loan interest worksheet (Pub. 970): $2,500 cap and the $85,000 to $100,000 phase-out', () => {
  const at = (wages) => run('single', [w2(wages), { kind: '1098-E', payer: 'Lender', fields: { studentLoanInterest: 3000 } }]).data.schedules['1']['21'];
  assert.equal(at(80000), 2500);
  assert.equal(at(92500), 1250);
  assert.equal(at(100000), 0);
});

test('Schedule 1-A lines 11 and 19 round the $1,000 steps down; line 28 (car loan interest) rounds up', () => {
  const tipped = run('single', [w2(151500)], { answers: { qualifiedTips: 10000, qualifiedOvertime: 5000, carLoanInterest: 0 } });
  assert.equal(tipped.data.schedules['1-A']['13'], 9900);
  assert.equal(tipped.data.schedules['1-A']['21'], 4900);
  const car = run('single', [w2(101500)], { answers: { carLoanInterest: 5000 } });
  assert.equal(car.data.schedules['1-A']['30'], 4600);
});

test('Schedule 1-A Part V: $6,000 a senior less 6% of MAGI over $75,000 ($150,000 joint)', () => {
  const single = run('single', [w2(85000)], { taxpayer: { ...adult, dateOfBirth: '1958-01-01' } });
  assert.equal(single.data.schedules['1-A']['37'], 5400);
  const joint = computeForm1040({ filingStatus: 'mfj', taxpayer: { ...adult, dateOfBirth: '1958-01-01' }, spouse: { ...spouse, dateOfBirth: '1959-01-01' }, forms: [w2(160000)] }, '2025');
  assert.equal(joint.data.schedules['1-A']['37'], 10800);
  const noSsn = run('single', [w2(50000)], { taxpayer: { ...adult, dateOfBirth: '1958-01-01', ssnValid: false } });
  assert.equal(noSsn.data.lines['13b'], 0);
});

test('Schedule 1-A Parts II and III need an SSN valid for work', () => {
  const out = run('single', [w2(40000)], { taxpayer: { ...adult, ssnValid: false }, answers: { qualifiedTips: 5000, qualifiedOvertime: 2000 } });
  assert.equal(out.data.lines['13b'], 0);
  assert.ok(codes(out).includes('TIPS_NEED_SSN'));
  assert.ok(codes(out).includes('OVERTIME_NEEDS_SSN'));
});

test('Zero income: a return with nothing on it computes to zero and asks for forms', () => {
  const out = computeForm1040({ filingStatus: 'single', taxpayer: adult }, '2025');
  assert.equal(out.ok, true);
  assert.equal(out.data.lines['9'], 0);
  assert.equal(out.data.lines['24'], 0);
  assert.equal(out.data.lines['34'], 0);
  assert.equal(out.data.lines['37'], 0);
  assert.equal(out.data.summary.effectiveRate, 0);
  assert.ok(codes(out).includes('NO_INCOME_DOCUMENTS'));
});

test('Negative AGI from a Schedule C loss: taxable income and tax are zero, no EIC and no refund beyond withholding', () => {
  const out = run('single', [{ kind: '1099-INT', payer: 'Bank', fields: { interest: 1000, federalWithheld: 100 } }], { businesses: [{ name: 'Startup', grossReceipts: 10000, totalExpenses: 40000 }] });
  assert.equal(out.data.lines['11'], -29000);
  assert.equal(out.data.lines['15'], 0);
  assert.equal(out.data.lines['16'], 0);
  assert.equal(out.data.lines['27'], 0);
  assert.equal(out.data.lines['35a'], 100);
  assert.equal(out.data.lines['23'], 0);
});

test('Refund versus amount owed, applying part of a refund to next year, and whole-dollar rounding', () => {
  const owe = run('single', [w2(50000.49, 3000.5)]);
  assert.equal(owe.data.lines['1a'], 50000);
  assert.equal(owe.data.lines['25a'], 3001);
  assert.equal(owe.data.lines['37'], 874);
  assert.equal(owe.data.lines['35a'], 0);
  const refund = run('single', [w2(50000, 5000)], { answers: { applyToNextYear: 500 } });
  assert.equal(refund.data.lines['34'], 1125);
  assert.equal(refund.data.lines['36'], 500);
  assert.equal(refund.data.lines['35a'], 625);
  assert.ok(Object.values(refund.data.lines).every(Number.isInteger));
});

test('Huge values stay whole dollars and use the 37% band', () => {
  const out = run('single', [w2(1000015750)]);
  assert.equal(out.data.lines['15'], 1000000000);
  assert.equal(out.data.lines['16'], Math.round(188769.75 + (1000000000 - 626350) * 0.37));
  assert.ok(Object.values(out.data.lines).every(Number.isSafeInteger));
});

test('Invalid inputs: unknown year or status refuses; non-numbers count as zero; negative form amounts are an error and count as zero', () => {
  assert.equal(computeForm1040({ filingStatus: 'single' }, '2024').error, 'TAX_YEAR_NOT_SUPPORTED');
  assert.equal(computeForm1040({ filingStatus: 'single' }, '2027').error, 'TAX_YEAR_NOT_SUPPORTED');
  assert.equal(computeForm1040({ filingStatus: 'widow' }, '2025').error, 'FILING_STATUS_REQUIRED');
  assert.equal(computeForm1040({}, '2025').error, 'FILING_STATUS_REQUIRED');
  assert.equal(run('single', [w2('abc')]).data.lines['1a'], 0);
  const negative = run('single', [w2(50000, -5000)]);
  assert.equal(negative.data.lines['25a'], 0);
  assert.ok(negative.data.checks.some((item) => item.code === 'FORM_AMOUNT_NEGATIVE' && item.level === 'error'));
  const badDob = run('single', [w2(50000)], { taxpayer: { ...adult, dateOfBirth: '04/02/1988' } });
  assert.ok(badDob.data.checks.some((item) => item.code === 'TAXPAYER_DOB_INVALID' && item.level === 'error'));
});

test('Dependents born or died in the year count for the full year; one born after the year cannot be claimed', () => {
  const born = run('single', [w2(60000)], { dependents: [kid('Baby', '2025-12-31', { months: 0, bornOrDiedInYear: true })] });
  assert.equal(born.data.schedules['8812']['4'], 1);
  const died = run('single', [w2(60000)], { dependents: [kid('Leo', '2016-02-02', { months: 3, bornOrDiedInYear: true })] });
  assert.equal(died.data.schedules['8812']['4'], 1);
  const later = run('single', [w2(60000)], { dependents: [kid('Next', '2026-01-05', { months: 0, bornOrDiedInYear: true })] });
  assert.equal(later.data.lines['19'], 0);
  assert.ok(later.data.checks.some((item) => item.code === 'DEPENDENT_BORN_AFTER_YEAR' && item.level === 'error'));
});

test('A filer who can be claimed as a dependent cannot claim dependents (IRC 152(b)(1))', () => {
  const out = run('single', [w2(30000)], { taxpayer: { ...adult, canBeClaimedAsDependent: true }, dependents: [kid('Leo', '2016-02-02')] });
  assert.equal(out.data.lines['19'], 0);
  assert.equal(out.data.lines['28'], 0);
  assert.ok(out.data.checks.some((item) => item.code === 'DEPENDENT_FILER_WITH_DEPENDENTS' && item.level === 'error'));
});

test('Estimated tax penalty (IRC 6654, Form 2210): 110% of last year\'s tax above $150,000 prior-year AGI', () => {
  const short = run('single', [w2(100000)], { answers: { priorYearTax: 5000, priorYearAgi: 160000, estimatedTaxPayments: 5499 } });
  assert.ok(short.data.unsupported.some((item) => item.form === '2210' && item.required === false));
  const met = run('single', [w2(100000)], { answers: { priorYearTax: 5000, priorYearAgi: 160000, estimatedTaxPayments: 5500 } });
  assert.ok(!met.data.unsupported.some((item) => item.form === '2210'));
  const credits = run('hoh', [w2(30000, 0)], { dependents: [kid('A', '2012-01-01'), kid('B', '2014-01-01')] });
  assert.ok(!credits.data.unsupported.some((item) => item.form === '2210'));
});

test('Schedule 3 line 11: excess social security from two employers, capped per employer at $10,918 (2025)', () => {
  const two = run('single', [w2(100000, 0, { socialSecurityTax: 7000 }), w2(100000, 0, { socialSecurityTax: 7000 })]);
  assert.equal(two.data.schedules['3']['11'], 3082);
  assert.equal(two.data.lines['31'], 3082);
  const one = run('single', [w2(180000, 0, { socialSecurityTax: 11000 }), w2(30000, 0, { socialSecurityTax: 2000 })]);
  assert.equal(one.data.schedules['3']['11'], 2000);
  assert.ok(codes(one).includes('EMPLOYER_OVERWITHHELD_SS'));
  const joint = computeForm1040({ filingStatus: 'mfj', taxpayer: adult, spouse, forms: [w2(100000, 0, { socialSecurityTax: 7000 }), { ...w2(100000, 0, { socialSecurityTax: 7000 }), owner: 'spouse' }] }, '2025');
  assert.equal(joint.data.schedules['3'], undefined);
});

test('1099-R: IRA and pension lines 4 and 5, blank taxable amount taken as gross, withholding on line 25b', () => {
  const out = run('single', [{ kind: '1099-R', payer: 'Pension', fields: { grossDistribution: 20000, federalWithheld: 2000, distributionCode: '7' } }, { kind: '1099-R', payer: 'IRA', fields: { grossDistribution: 8000, taxableAmount: 5000, iraSepSimple: true, distributionCode: '7' } }]);
  assert.equal(out.data.lines['5b'], 20000);
  assert.equal(out.data.lines['4a'], 8000);
  assert.equal(out.data.lines['4b'], 5000);
  assert.equal(out.data.lines['25b'], 2000);
});

test('Schedule 2 line 8: 10% additional tax on a code 1 early distribution (IRC 72(t)); an exception or code J/S needs Form 5329', () => {
  const early = run('single', [w2(40000), { kind: '1099-R', payer: 'IRA', fields: { grossDistribution: 10000, taxableAmount: 10000, iraSepSimple: true, distributionCode: '1' } }]);
  assert.equal(early.data.schedules['2']['8'], 1000);
  assert.deepEqual(needs(early), []);
  const exception = run('single', [w2(40000), { kind: '1099-R', payer: 'IRA', fields: { grossDistribution: 10000, taxableAmount: 10000, iraSepSimple: true, distributionCode: '1' } }], { answers: { earlyDistributionException: true } });
  assert.equal(exception.data.lines['23'], 0);
  assert.deepEqual(needs(exception), ['5329']);
  const roth = run('single', [w2(40000), { kind: '1099-R', payer: 'Roth', fields: { grossDistribution: 3000, taxableAmount: 0, iraSepSimple: true, distributionCode: 'J' } }]);
  assert.deepEqual(needs(roth), ['5329']);
});

test('1099-G: unemployment on Schedule 1 line 7 and its withholding on line 25b; a state refund is taxable only as answered', () => {
  const out = run('single', [{ kind: '1099-G', payer: 'State DOL', fields: { unemployment: 8000, federalWithheld: 800, stateRefund: 600 } }], { answers: { stateRefundTaxable: 400 } });
  assert.equal(out.data.schedules['1']['7'], 8000);
  assert.equal(out.data.schedules['1']['1'], 400);
  assert.equal(out.data.lines['8'], 8400);
  assert.equal(out.data.lines['25b'], 800);
});

test('Social Security Benefits Worksheet: single above the $34,000 adjusted base, below the base, and MFS living together at 85%', () => {
  const above = run('single', [{ kind: 'SSA-1099', fields: { netBenefits: 24000 } }, { kind: '1099-R', payer: 'Pension', fields: { grossDistribution: 30000, taxableAmount: 30000, distributionCode: '7' } }]);
  assert.equal(above.data.lines['6b'], 11300);
  const below = run('single', [{ kind: 'SSA-1099', fields: { netBenefits: 20000 } }, w2(10000)]);
  assert.equal(below.data.lines['6b'], 0);
  const separate = run('mfs', [{ kind: 'SSA-1099', fields: { netBenefits: 10000 } }]);
  assert.equal(separate.data.lines['6b'], 4250);
  const apart = run('mfs', [{ kind: 'SSA-1099', fields: { netBenefits: 10000 } }], { answers: { livedWithSpouse: false } });
  assert.equal(apart.data.lines['6b'], 0);
});

test('Unsupported forms land in unsupported with required true: Form 1116, Form 8283, the Pub. 936 limit and the 2026 section 68 limit', () => {
  const foreign = run('single', [w2(60000), { kind: '1099-DIV', payer: 'Fund', fields: { ordinaryDividends: 10000, foreignTaxPaid: 400 } }]);
  assert.ok(needs(foreign).includes('1116'));
  const allowed = run('single', [w2(60000), { kind: '1099-DIV', payer: 'Fund', fields: { ordinaryDividends: 10000, foreignTaxPaid: 300 } }]);
  assert.equal(allowed.data.schedules['3']['1'], 300);
  assert.deepEqual(needs(allowed), []);
  const gifts = run('single', [w2(100000)], { answers: { itemize: 'yes', charityNonCash: 2000 } });
  assert.ok(needs(gifts).includes('8283'));
  const giftsStandard = run('single', [w2(100000)], { answers: { itemize: 'no', charityNonCash: 2000 } });
  assert.deepEqual(needs(giftsStandard), []);
  const mortgage = run('single', [w2(300000), { kind: '1098', payer: 'Bank', fields: { mortgageInterest: 50000, outstandingPrincipal: 1200000 } }]);
  assert.ok(needs(mortgage).includes('Pub. 936 worksheet'));
  const top = run('single', [w2(900000, 0, { stateWithheld: 50000 })], { answers: { itemize: 'yes', charityCash: 50000 } }, '2026');
  assert.ok(needs(top).includes('Section 68 limit'));
  const top2025 = run('single', [w2(900000, 0, { stateWithheld: 50000 })], { answers: { itemize: 'yes', charityCash: 50000 } }, '2025');
  assert.ok(!needs(top2025).includes('Section 68 limit'));
});

test('2026: non-itemizers deduct up to $1,000 of cash gifts ($2,000 joint, not QSS) and itemized gifts have a 0.5% of AGI floor', () => {
  assert.equal(run('single', [w2(60000)], { answers: { charityCash: 1500 } }, '2026').data.schedules['1-A'].charity, 1000);
  assert.equal(run('mfj', [w2(60000)], { answers: { charityCash: 3000 } }, '2026').data.schedules['1-A'].charity, 2000);
  assert.equal(run('qss', [w2(60000)], { dependents: [kid('Mia', '2015-03-01', { relationship: 'daughter' })], answers: { charityCash: 3000 } }, '2026').data.schedules['1-A'].charity, 1000);
  const itemized = run('single', [w2(100000)], { answers: { itemize: 'yes', charityCash: 5000 } }, '2026');
  assert.equal(itemized.data.schedules.A['14'], 4500);
  assert.equal(run('single', [w2(60000)], { answers: { charityCash: 1500 } }, '2025').data.lines['13b'], 0);
});
