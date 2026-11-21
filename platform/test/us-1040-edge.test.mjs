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
  const brokerWithheld = (federalWithheld) => run('single', [w2(50000), { kind: '1099-B', payer: 'Broker', fields: { federalWithheld, transactions: [{ proceeds: 1000, costBasis: 500, term: 'long', federalWithheld: 40 }, { proceeds: 800, costBasis: 900, term: 'short', federalWithheld: -200 }] } }]);
  assert.equal(brokerWithheld(60).data.lines['25b'], 100);
  assert.equal(brokerWithheld(-300).data.lines['25b'], 40);
  assert.ok(brokerWithheld(-300).data.checks.some((item) => item.code === 'FORM_AMOUNT_NEGATIVE' && /federalWithheld/.test(item.message)));
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

test('Unsupported forms land in unsupported with required true: Form 1116 and Form 8283; the Pub. 936 limit is prorated and the 2026 section 68 limit applied, both only flagged', () => {
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
  assert.ok(!needs(mortgage).includes('Pub. 936 worksheet'));
  assert.ok(mortgage.data.unsupported.some((item) => item.form === 'Pub. 936 worksheet' && item.required === false));
  assert.equal(mortgage.data.schedules.A['8a'], 31250);
  const top = run('single', [w2(900000, 0, { stateWithheld: 50000 })], { answers: { itemize: 'yes', charityCash: 50000 } }, '2026');
  assert.ok(!needs(top).includes('Section 68 limit'));
  assert.ok(top.data.checks.some((item) => item.code === 'ITEMIZED_37_LIMIT'));
  assert.ok(top.data.schedules.A.section68Reduction > 0);
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

const smallBusiness = (net, participation) => ({ businesses: [{ name: 'Studio', grossReceipts: net + 500, totalExpenses: 500 }], ...(participation === undefined ? {} : { answers: { qbiMaterialParticipation: participation } }) });

test('IRC 199A(i) 2026: an active business with QBI of at least $1,000 gets the $400 minimum when 20% of QBI is lower (draft Form 8995 lines 15 to 17)', () => {
  const yes = run('single', [w2(30000)], smallBusiness(1500, 'yes'), '2026');
  assert.equal(yes.ok, true);
  const form = yes.data.schedules[8995];
  assert.ok(form['2'] >= 1000);
  assert.ok(form['15'] < 400);
  assert.equal(form['16'], 400);
  assert.equal(form['17'], 400);
  assert.equal(yes.data.lines['13a'], 400);
  assert.ok(!codes(yes).includes('QBI_MINIMUM_NEEDS_ANSWER'));
  assert.equal(run('single', [w2(30000)], smallBusiness(1500, true), '2026').data.lines['13a'], 400);
  assert.ok(!yes.data.unsupported.some((item) => item.form === 'QBI minimum deduction'));
});

test('IRC 199A(i) 2026: no minimum without material participation, below $1,000 of QBI, or when 20% of QBI is already higher', () => {
  const no = run('single', [w2(30000)], smallBusiness(1500, 'no'), '2026');
  assert.ok(no.data.lines['13a'] < 400);
  assert.equal(no.data.lines['13a'], no.data.schedules[8995]['15']);
  assert.equal(no.data.schedules[8995]['16'], 0);
  assert.ok(!codes(no).includes('QBI_MINIMUM_NEEDS_ANSWER'));
  const small = run('single', [w2(30000)], smallBusiness(1000, 'yes'), '2026');
  assert.ok(small.data.schedules[8995]['2'] < 1000);
  assert.ok(small.data.lines['13a'] < 400);
  assert.ok(!codes(small).includes('QBI_MINIMUM_NEEDS_ANSWER'));
  const big = run('single', [w2(30000)], smallBusiness(8000, 'yes'), '2026');
  assert.ok(big.data.lines['13a'] > 400);
  assert.equal(big.data.lines['13a'], big.data.schedules[8995]['15']);
});

test('IRC 199A(i) 2026: an unanswered participation question warns without blocking, and only when the minimum would help', () => {
  const unanswered = run('single', [w2(30000)], smallBusiness(1500), '2026');
  assert.ok(unanswered.data.lines['13a'] < 400);
  assert.ok(codes(unanswered).includes('QBI_MINIMUM_NEEDS_ANSWER'));
  assert.equal(unanswered.data.checks.find((item) => item.code === 'QBI_MINIMUM_NEEDS_ANSWER').level, 'warning');
  assert.deepEqual(needs(unanswered), []);
  assert.ok(!codes(run('single', [w2(30000)], smallBusiness(8000), '2026')).includes('QBI_MINIMUM_NEEDS_ANSWER'));
  assert.ok(!codes(run('single', [w2(30000)], {}, '2026')).includes('QBI_MINIMUM_NEEDS_ANSWER'));
});

test('IRC 199A(i): the minimum applies even when the taxable-income limit is lower, and taxable income never goes below zero', () => {
  const out = run('single', [], smallBusiness(1500, 'yes'), '2026');
  assert.equal(out.data.schedules[8995]['14'], 0);
  assert.equal(out.data.lines['13a'], 400);
  assert.equal(out.data.lines['15'], 0);
});

test('IRC 199A(i): 2025 has no minimum and keeps the 2025 Form 8995 layout', () => {
  const y2025 = run('single', [w2(30000)], smallBusiness(1500, 'yes'), '2025');
  assert.ok(y2025.data.lines['13a'] < 400);
  assert.equal(y2025.data.schedules[8995]['17'], undefined);
  assert.ok(!codes(y2025).includes('QBI_MINIMUM_NEEDS_ANSWER'));
});

test('IRC 199A(i) 2026: a net business loss is carried forward on line 18 with no minimum', () => {
  const out = run('single', [w2(30000)], { businesses: [{ name: 'Studio', grossReceipts: 1000, totalExpenses: 3000 }], answers: { qbiMaterialParticipation: 'yes' } }, '2026');
  assert.equal(out.data.lines['13a'], 0);
  assert.ok(out.data.schedules[8995]['18'] < 0);
  assert.equal(out.data.schedules[8995]['16'], 0);
});

const ssa = (netBenefits, owner = 'taxpayer') => ({ kind: 'SSA-1099', owner, payer: 'SSA', fields: { netBenefits } });

test('Pub. 915: a negative SSA-1099 box 5 makes line 6a zero; a net repayment of $3,000 or less is not deductible', () => {
  const out = run('single', [w2(30000), ssa(-2000)]);
  assert.equal(out.data.lines['6a'], 0);
  assert.equal(out.data.lines['6b'], 0);
  assert.ok(!codes(out).includes('FORM_AMOUNT_NEGATIVE'));
  const warning = out.data.checks.find((item) => item.code === 'SSA_NET_REPAYMENT');
  assert.equal(warning.level, 'warning');
  assert.match(warning.message, /\$2000 more than the benefits paid/);
  assert.match(warning.message, /\$3000 or less is a miscellaneous itemized deduction/);
  const atThreshold = run('single', [w2(30000), ssa(-3000)]);
  assert.ok(codes(atThreshold).includes('SSA_NET_REPAYMENT'));
  assert.ok(!atThreshold.data.unsupported.some((row) => row.form === 'Section 1341 claim'));
});

test('Pub. 915 and IRC 1341: a net repayment over $3,000 is flagged for an itemized deduction or 1341 credit, not required to file', () => {
  const out = run('single', [w2(30000), ssa(-4500)]);
  assert.equal(out.data.lines['6a'], 0);
  const item = out.data.unsupported.find((row) => row.form === 'Section 1341 claim');
  assert.deepEqual(item, { form: 'Section 1341 claim', reason: 'Social Security repaid above the benefits by more than the claim-of-right threshold', code: 'SSA_REPAYMENT_1341', required: false });
  assert.equal(out.data.checks.find((row) => row.code === 'SSA_REPAYMENT_1341').level, 'warning');
  assert.match(out.data.checks.find((row) => row.code === 'SSA_REPAYMENT_1341').message, /\$4500 more than the benefits paid/);
  assert.deepEqual(needs(out), []);
});

test('Pub. 915 joint return: one spouse\'s negative box 5 offsets the other\'s ($3,000 less $500 is $2,500 on line 6a)', () => {
  const out = run('mfj', [w2(20000), ssa(3000), ssa(-500, 'spouse')]);
  assert.equal(out.data.lines['6a'], 2500);
  assert.ok(!codes(out).includes('SSA_NET_REPAYMENT'));
  const negativeWithheld = run('single', [w2(20000), { kind: 'SSA-1099', payer: 'SSA', fields: { netBenefits: 1000, federalWithheld: -50 } }]);
  assert.ok(codes(negativeWithheld).includes('FORM_AMOUNT_NEGATIVE'));
});

test('Schedule 1-A line 11 ("decrease the result to the next lower whole number"): $150,999 of MAGI keeps all $10,000 of tips, $151,000 loses $100, $152,000 loses $200', () => {
  const tipsAt = (wages) => run('single', [w2(wages)], { answers: { qualifiedTips: 10000 } }).data.schedules['1-A']['13'];
  assert.equal(tipsAt(150999), 10000);
  assert.equal(tipsAt(151000), 9900);
  assert.equal(tipsAt(151999), 9900);
  assert.equal(tipsAt(152000), 9800);
  const overtimeAt = (wages) => run('single', [w2(wages)], { answers: { qualifiedOvertime: 12500 } }).data.schedules['1-A']['21'];
  assert.equal(overtimeAt(150999), 12500);
  assert.equal(overtimeAt(151500), 12400);
});

test('Schedule 1-A line 28 ("increase the result to the next higher whole number"): $1 over $100,000 already costs $200 of car loan interest', () => {
  const carAt = (wages) => run('single', [w2(wages)], { answers: { carLoanInterest: 5000 } }).data.schedules['1-A']['30'];
  assert.equal(carAt(100000), 5000);
  assert.equal(carAt(100001), 4800);
  assert.equal(carAt(101000), 4800);
  assert.equal(carAt(101001), 4600);
});

test('Schedule 1-A lines 33 to 35: 6% of MAGI over $75,000 is not stepped; $1 over is 6 cents, which rounds to nothing', () => {
  const seniorAt = (wages) => run('single', [w2(wages)], { taxpayer: { ...adult, dateOfBirth: '1958-01-01' } }).data.lines['13b'];
  assert.equal(seniorAt(75001), 6000);
  assert.equal(seniorAt(75050), 5997);
  assert.equal(seniorAt(175000), 0);
});

test('Schedule 1-A line 5: business tips count only up to the net income of the business less the deductible SE tax (rideshare $1,000 profit, SE deduction $71, so $929 of $1,800)', () => {
  const out = computeForm1040({ filingStatus: 'single', taxpayer: adult, forms: [], businesses: [{ name: 'Rideshare', grossReceipts: 15000, totalExpenses: 14000 }], answers: { businessQualifiedTips: 1800 } }, '2025');
  assert.equal(out.data.schedules['1']['15'], 71);
  assert.equal(out.data.schedules['1-A']['13'], 929);
  assert.ok(codes(out).includes('TIPS_ABOVE_NET_INCOME'));
  const loss = computeForm1040({ filingStatus: 'single', taxpayer: adult, forms: [w2(30000)], businesses: [{ name: 'Rideshare', grossReceipts: 5000, totalExpenses: 6000 }], answers: { businessQualifiedTips: 800, qualifiedTips: 300 } }, '2025');
  assert.equal(loss.data.schedules['1-A']['13'], 300);
});

test('Schedule 1-A Parts II and III on a joint return: only the spouse who received the tips or overtime needs an SSN valid for work', () => {
  const noSsnSpouse = { ...spouse, ssnValid: false };
  const out = computeForm1040({ filingStatus: 'mfj', taxpayer: adult, spouse: noSsnSpouse, forms: [w2(60000)], answers: { qualifiedTips: 5000, qualifiedOvertime: 2000 } }, '2025');
  assert.equal(out.data.schedules['1-A']['13'], 5000);
  assert.equal(out.data.schedules['1-A']['21'], 2000);
  assert.ok(!codes(out).includes('TIPS_NEED_SSN'));
  const both = computeForm1040({ filingStatus: 'mfj', taxpayer: adult, spouse: noSsnSpouse, forms: [w2(60000)], answers: { qualifiedTips: 5000, spouseQualifiedTips: 2000, spouseQualifiedOvertime: 1000 } }, '2025');
  assert.equal(both.data.schedules['1-A']['13'], 5000);
  assert.equal(both.data.schedules['1-A']['21'], undefined);
  assert.ok(codes(both).includes('TIPS_NEED_SSN'));
  assert.ok(codes(both).includes('OVERTIME_NEEDS_SSN'));
});

test('Schedule 1-A lines 2a to 3 and Schedule 8812 lines 2a to 3: excluded foreign or Puerto Rico income is added to AGI for the income limits', () => {
  const tips = run('single', [w2(140000)], { answers: { qualifiedTips: 10000, excludedForeignIncome: 11000 } });
  assert.equal(tips.data.lines['11'], 140000);
  assert.equal(tips.data.schedules['1-A']['13'], 9900);
  const ctc = run('single', [w2(195000)], { dependents: [kid('Leo', '2016-02-02')], answers: { excludedForeignIncome: 6000 } });
  assert.equal(ctc.data.schedules['8812']['10'], 1000);
  assert.equal(ctc.data.schedules['8812']['12'], 2150);
});

test('Schedule 8812 Part II-B lines 21 to 26 (2025): line 21 from the Additional Medicare Tax and RRTA worksheet (W-2 boxes 4 and 6), line 24 is Form 1040 line 27a plus Schedule 3 line 11', () => {
  const kids = [kid('A', '2012-01-01'), kid('B', '2014-01-01'), kid('C', '2016-01-01')];
  const out = run('hoh', [w2(3000), { kind: '1099-INT', payer: 'Bank', fields: { interest: 12000 } }], { dependents: kids });
  const f = out.data.schedules['8812'];
  assert.equal(f['16b'], 5100);
  assert.equal(f['21'], 186 + 44);
  assert.equal(f['22'], 0);
  assert.equal(f['23'], 230);
  assert.equal(f['24'], 0);
  assert.equal(f['25'], 230);
  assert.equal(f['26'], 230);
  assert.equal(f['27'], 230);
  const one = run('hoh', [w2(10000)], { dependents: [kid('Leo', '2016-02-02')] }).data.schedules['8812'];
  assert.equal(one['21'], undefined);
});

test('Educator expenses: $300 (2025) and $350 (2026, Rev. Proc. 2025-32 section 3.12) above the line; from 2026 the rest is an itemized deduction (IRC 67(b)(13), P.L. 119-21 section 70110)', () => {
  const y2025 = run('single', [w2(60000)], { answers: { educatorExpenses: 1000, itemize: 'yes' } }, '2025');
  assert.equal(y2025.data.schedules['1']['11'], 300);
  assert.equal(y2025.data.schedules.A['16'], 0);
  const y2026 = run('single', [w2(60000)], { answers: { educatorExpenses: 1000, itemize: 'yes' } }, '2026');
  assert.equal(y2026.data.schedules['1']['11'], 350);
  assert.equal(y2026.data.schedules.A['16'], 650);
  assert.equal(y2026.data.schedules.A['17'], y2026.data.lines['12']);
  const standard = run('single', [w2(60000)], { answers: { educatorExpenses: 1000 } }, '2026');
  assert.equal(standard.data.schedules['1']['11'], 350);
  assert.equal(standard.data.schedules.A, undefined);
  const joint = run('mfj', [w2(60000)], { answers: { educatorExpenses: 200, spouseEducatorExpenses: 500, itemize: 'yes' } }, '2026');
  assert.equal(joint.data.schedules['1']['11'], 550);
  assert.equal(joint.data.schedules.A['16'], 150);
});
