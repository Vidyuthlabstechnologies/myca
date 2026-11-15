import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-itinterest-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthsOrPart, roundDownToHundredRupees, interest234A, interest234B, interest234C, fee234E, interest201,
  incomeTaxInterest, tdsInterest,
} from '../src/it-interest.mjs';
import { createState } from '../src/store.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { TOOL_ARG_SCHEMAS } from '../src/tool-schemas.mjs';
import { assistantTools } from '../src/assistant-tools.mjs';
import { REMOTE_QUERY_TOOLS } from '../src/remote-contract.mjs';
import { advanceTax } from '../src/advance-tax.mjs';
import { propose, confirmPending } from '../src/router.mjs';

const R = 100;

test('Rule 119A(a): a month or part of a month is a full month, counted from the start date', () => {
  assert.equal(monthsOrPart('2026-08-01', '2026-08-01'), 1);
  assert.equal(monthsOrPart('2026-08-01', '2026-08-31'), 1);
  assert.equal(monthsOrPart('2026-08-01', '2026-09-01'), 2);
  assert.equal(monthsOrPart('2026-04-01', '2026-07-15'), 4);
  assert.equal(monthsOrPart('2026-09-16', '2026-10-15'), 1);
  assert.equal(monthsOrPart('2026-09-16', '2026-10-16'), 2);
  assert.equal(monthsOrPart('2026-08-02', '2026-08-01'), 0);
});

test('Rule 119A(a): month counting across February in common and leap years', () => {
  assert.equal(monthsOrPart('2027-01-31', '2027-02-28'), 1);
  assert.equal(monthsOrPart('2027-01-31', '2027-03-01'), 2);
  assert.equal(monthsOrPart('2027-01-29', '2027-02-28'), 1);
  assert.equal(monthsOrPart('2028-01-29', '2028-02-28'), 1);
  assert.equal(monthsOrPart('2028-01-29', '2028-02-29'), 2, 'in a leap year 29 January to 28 February is the first month');
  assert.equal(monthsOrPart('2028-01-30', '2028-02-29'), 1);
  assert.equal(monthsOrPart('2028-01-30', '2028-03-01'), 2);
  assert.equal(monthsOrPart('2028-01-31', '2028-02-29'), 1);
});

test('Rule 119A(a): calendar basis counts every calendar month touched, as TRACES does for s.201(1A)', () => {
  assert.equal(monthsOrPart('2026-01-25', '2026-03-08', { basis: 'calendar' }), 3);
  assert.equal(monthsOrPart('2026-01-28', '2026-02-08', { basis: 'calendar' }), 2);
  assert.equal(monthsOrPart('2026-01-28', '2026-02-08', { basis: 'period' }), 1);
  assert.equal(monthsOrPart('2026-12-31', '2027-01-01', { basis: 'calendar' }), 2);
});

test('Rule 119A(b): the amount on which interest is charged is rounded down to a multiple of Rs 100', () => {
  assert.equal(roundDownToHundredRupees(12345678), 12340000);
  assert.equal(roundDownToHundredRupees(9999), 0);
  assert.equal(roundDownToHundredRupees(10000), 10000);
  assert.equal(roundDownToHundredRupees(-500), 0);
});

test('s.234A: 1% a month or part on tax less advance tax and TDS, from the day after the due date to filing', () => {
  const r = interest234A({ dueDate: '2026-07-31', filedOn: '2026-11-14', taxPaise: 150000 * R, advanceTaxPaise: 50000 * R, tdsTcsPaise: 40000 * R });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.from, '2026-08-01');
  assert.equal(r.data.months, 4);
  assert.equal(r.data.basePaise, 60000 * R);
  assert.equal(r.data.interestPaise, 2400 * R);
});

test('s.234A with Rule 119A(b): Rs 60,550.75 due is charged on Rs 60,500', () => {
  const r = interest234A({ dueDate: '2026-07-31', filedOn: '2026-11-14', taxPaise: 15055075, advanceTaxPaise: 50000 * R, tdsTcsPaise: 40000 * R });
  assert.equal(r.data.basePaise, 60500 * R);
  assert.equal(r.data.interestPaise, 2420 * R);
});

test('s.234A: nothing on or before the due date; one day late is one month; an extended due date mid-month', () => {
  assert.equal(interest234A({ dueDate: '2026-07-31', filedOn: '2026-07-31', taxPaise: 100000 * R }).data.interestPaise, 0);
  const oneDay = interest234A({ dueDate: '2026-07-31', filedOn: '2026-08-01', taxPaise: 100000 * R });
  assert.equal(oneDay.data.months, 1);
  assert.equal(oneDay.data.interestPaise, 1000 * R);
  const extended = interest234A({ dueDate: '2026-09-15', filedOn: '2026-10-16', taxPaise: 100000 * R });
  assert.equal(extended.data.months, 2);
});

test('s.234A per CIT v Prannoy Roy (SC): self-assessment tax paid by the due date is not charged', () => {
  const r = interest234A({ dueDate: '2026-07-31', filedOn: '2026-11-14', taxPaise: 15055075, advanceTaxPaise: 50000 * R, tdsTcsPaise: 40000 * R, paidBeforeDuePaise: 60550 * R });
  assert.equal(r.data.basePaise, 0);
  assert.equal(r.data.interestPaise, 0);
});

test('s.234A: bad dates and amounts are refused as {ok:false,error}', () => {
  assert.deepEqual(interest234A({ dueDate: '2026-02-30', filedOn: '2026-11-14', taxPaise: 1 }).error, 'INVALID_DATE');
  assert.equal(interest234A({ dueDate: '2026-07-31', filedOn: '2026-11-14', taxPaise: -1 }).error, 'BAD_AMOUNT');
  assert.equal(interest234A({ dueDate: '2026-07-31', filedOn: '2026-11-14', taxPaise: 1.5 }).error, 'BAD_AMOUNT');
});

test('s.234B(1): advance tax below 90% of assessed tax carries 1% a month from 1 April of the AY on the shortfall', () => {
  const r = interest234B({ fy: '2025-26', assessedTaxPaise: 250000 * R, advanceTaxPaise: 200000 * R, determinedOn: '2026-07-20' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.applies, true);
  assert.equal(r.data.legs.length, 1);
  assert.deepEqual([r.data.legs[0].from, r.data.legs[0].months, r.data.legs[0].basePaise], ['2026-04-01', 4, 50000 * R]);
  assert.equal(r.data.interestPaise, 2000 * R);
});

test('s.234B(1): exactly 90% paid is enough; assessed tax under Rs 10,000 (s.208) and s.207(2) seniors are outside', () => {
  assert.equal(interest234B({ fy: '2025-26', assessedTaxPaise: 250000 * R, advanceTaxPaise: 225000 * R, determinedOn: '2026-07-20' }).data.interestPaise, 0);
  const just = interest234B({ fy: '2025-26', assessedTaxPaise: 250000 * R, advanceTaxPaise: 224999 * R, determinedOn: '2026-07-20' });
  assert.equal(just.data.applies, true);
  assert.equal(just.data.legs[0].basePaise, 25000 * R, 'Rs 25,001 shortfall rounded down');
  assert.equal(interest234B({ fy: '2025-26', assessedTaxPaise: 9999 * R, advanceTaxPaise: 0, determinedOn: '2026-07-20' }).data.interestPaise, 0);
  assert.equal(interest234B({ fy: '2025-26', assessedTaxPaise: 50000 * R, advanceTaxPaise: 0, determinedOn: '2026-07-20', seniorNoBusiness: true }).data.interestPaise, 0);
});

test('s.234B(2): self-assessment tax stops the full shortfall at its month; the rest runs on the reduced shortfall', () => {
  const r = interest234B({ fy: '2025-26', assessedTaxPaise: 250000 * R, advanceTaxPaise: 200000 * R, determinedOn: '2026-09-05', selfAssessment: [{ date: '2026-06-10', taxPaise: 30000 * R }] });
  assert.deepEqual(r.data.legs.map((l) => [l.from, l.to, l.months, l.basePaise, l.interestPaise]), [
    ['2026-04-01', '2026-06-10', 3, 50000 * R, 1500 * R],
    ['2026-07-01', '2026-09-05', 3, 20000 * R, 600 * R],
  ]);
  assert.equal(r.data.interestPaise, 2100 * R);
});

test('s.234B(2): two self-assessment payments in one month and a payment that clears the shortfall', () => {
  const r = interest234B({ fy: '2025-26', assessedTaxPaise: 250000 * R, advanceTaxPaise: 200000 * R, determinedOn: '2026-09-05', selfAssessment: [{ date: '2026-06-20', taxPaise: 10000 * R }, { date: '2026-06-10', taxPaise: 40000 * R }] });
  assert.deepEqual(r.data.legs.map((l) => [l.months, l.basePaise]), [[3, 50000 * R]]);
  assert.equal(r.data.interestPaise, 1500 * R);
});

test('s.234B: an invalid financial year is refused', () => {
  assert.equal(interest234B({ fy: '2025-27', assessedTaxPaise: 1, advanceTaxPaise: 0, determinedOn: '2026-07-20' }).error, 'INVALID_FY');
});

const PAYMENTS = [
  { date: '2025-06-14', amountPaise: 20000 * R },
  { date: '2025-09-15', amountPaise: 40000 * R },
  { date: '2025-12-16', amountPaise: 60000 * R },
  { date: '2026-03-15', amountPaise: 50000 * R },
];

test('s.234C(1)(a): 3 months on the June, September and December shortfalls and 1 month on March', () => {
  const r = interest234C({ fy: '2025-26', taxDuePaise: 180000 * R, advancePayments: PAYMENTS });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data.instalments.map((i) => [i.dueDate, i.requiredPaise, i.paidPaise, i.basePaise, i.months, i.interestPaise]), [
    ['2025-06-15', 27000 * R, 20000 * R, 7000 * R, 3, 210 * R],
    ['2025-09-15', 81000 * R, 60000 * R, 21000 * R, 3, 630 * R],
    ['2025-12-15', 135000 * R, 60000 * R, 75000 * R, 3, 2250 * R],
    ['2026-03-15', 180000 * R, 170000 * R, 10000 * R, 1, 100 * R],
  ]);
  assert.equal(r.data.interestPaise, 3190 * R);
});

test('s.234C(1)(a) first proviso: no interest for June when 12% is paid, nor for September when 36% is paid', () => {
  const r = interest234C({ fy: '2025-26', taxDuePaise: 180000 * R, advancePayments: [{ date: '2025-06-15', amountPaise: 21600 * R }, { date: '2025-09-15', amountPaise: 43200 * R }, { date: '2025-12-15', amountPaise: 70200 * R }, { date: '2026-03-15', amountPaise: 45000 * R }] });
  const [jun, sep, dec, mar] = r.data.instalments;
  assert.equal(jun.relaxed, true);
  assert.equal(jun.interestPaise, 0);
  assert.equal(sep.relaxed, true);
  assert.equal(sep.interestPaise, 0);
  assert.equal(dec.interestPaise, 0);
  assert.equal(mar.interestPaise, 0);
  const under = interest234C({ fy: '2025-26', taxDuePaise: 180000 * R, advancePayments: [{ date: '2025-06-15', amountPaise: 21599 * R }] });
  assert.equal(under.data.instalments[0].relaxed, false);
  assert.equal(under.data.instalments[0].basePaise, 5400 * R);
  assert.equal(under.data.instalments[0].interestPaise, 162 * R);
});

test('s.234C with Rule 119A(b): the shortfall is rounded down before 1% is applied', () => {
  const r = interest234C({ fy: '2025-26', taxDuePaise: 180155 * R, advancePayments: PAYMENTS });
  assert.equal(r.data.instalments[0].requiredPaise, 2702325);
  assert.equal(r.data.instalments[0].basePaise, 7000 * R);
  assert.equal(r.data.instalments[0].interestPaise, 210 * R);
});

test('s.234C(1)(b): presumptive 44AD/44ADA pays only the 15 March instalment, 1 month', () => {
  const r = interest234C({ fy: '2025-26', taxDuePaise: 180000 * R, presumptive: true, advancePayments: [{ date: '2026-03-15', amountPaise: 100050 * R }, { date: '2026-03-20', amountPaise: 79950 * R }] });
  assert.equal(r.data.instalments.length, 1);
  assert.deepEqual([r.data.instalments[0].dueDate, r.data.instalments[0].basePaise, r.data.instalments[0].months, r.data.instalments[0].interestPaise], ['2026-03-15', 79900 * R, 1, 799 * R]);
});

test('s.234C second proviso: tax on capital gains arising after an instalment date is left out of that instalment', () => {
  const pay = [{ date: '2025-06-15', amountPaise: 22500 * R }, { date: '2025-09-15', amountPaise: 45000 * R }, { date: '2025-12-15', amountPaise: 45000 * R }, { date: '2026-03-15', amountPaise: 67500 * R }];
  const without = interest234C({ fy: '2025-26', taxDuePaise: 180000 * R, advancePayments: pay });
  assert.equal(without.data.instalments[2].interestPaise, 675 * R);
  const withProviso = interest234C({ fy: '2025-26', taxDuePaise: 180000 * R, advancePayments: pay, excludedIncome: [{ kind: 'capital-gains', arisedOn: '2026-01-10', taxPaise: 30000 * R, paidInRemainingInstalments: true }] });
  assert.deepEqual(withProviso.data.instalments.map((i) => i.requiredPaise), [22500 * R, 67500 * R, 112500 * R, 180000 * R]);
  assert.equal(withProviso.data.interestPaise, 0);
  const unpaid = interest234C({ fy: '2025-26', taxDuePaise: 180000 * R, advancePayments: pay, excludedIncome: [{ kind: 'capital-gains', arisedOn: '2026-01-10', taxPaise: 30000 * R }] });
  assert.equal(unpaid.data.interestPaise, 675 * R);
  assert.ok(unpaid.data.notes.some((n) => /remaining instalments/.test(n)));
});

test('s.234C: tax due under Rs 10,000 (s.208) is outside; unknown excluded kinds are refused', () => {
  assert.equal(interest234C({ fy: '2025-26', taxDuePaise: 9999 * R, advancePayments: [] }).data.interestPaise, 0);
  assert.equal(interest234C({ fy: '2025-26', taxDuePaise: 50000 * R, advancePayments: [], excludedIncome: [{ kind: 'salary', arisedOn: '2026-01-10', taxPaise: 1 }] }).error, 'BAD_EXCLUDED_KIND');
});

test('s.234E: Rs 200 a day from the day after the due date to filing, capped at the TDS of the statement', () => {
  assert.deepEqual(fee234E({ dueDate: '2026-07-31', filedOn: '2026-08-10', tdsPaise: 5000 * R }).data, { section: '234E', dueDate: '2026-07-31', filedOn: '2026-08-10', days: 10, uncappedPaise: 2000 * R, capPaise: 5000 * R, feePaise: 2000 * R, capped: false });
  assert.equal(fee234E({ dueDate: '2026-07-31', filedOn: '2026-08-10', tdsPaise: 1500 * R }).data.feePaise, 1500 * R);
  assert.equal(fee234E({ dueDate: '2026-07-31', filedOn: '2026-07-31', tdsPaise: 1500 * R }).data.feePaise, 0);
  assert.equal(fee234E({ dueDate: '2026-07-31', filedOn: '2026-08-10', tdsPaise: 0 }).data.feePaise, 0);
});

test('s.234E: February days in a leap year and a common year', () => {
  assert.equal(fee234E({ dueDate: '2028-01-31', filedOn: '2028-03-01', tdsPaise: 100000 * R }).data.days, 30);
  assert.equal(fee234E({ dueDate: '2027-01-31', filedOn: '2027-03-01', tdsPaise: 100000 * R }).data.feePaise, 5800 * R);
});

test('s.201(1A)(i) and (ii): 1% from deductible to deducted, 1.5% from deducted to paid, calendar months as TRACES counts', () => {
  const r = interest201({ amountPaise: 10000 * R, deductibleOn: '2026-01-25', deductedOn: '2026-03-08', paidOn: '2026-05-20' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.data.notDeducted.months, r.data.notDeducted.interestPaise], [3, 300 * R]);
  assert.deepEqual([r.data.notPaid.depositDueDate, r.data.notPaid.months, r.data.notPaid.interestPaise], ['2026-04-30', 3, 450 * R]);
  assert.equal(r.data.interestPaise, 750 * R);
  const period = interest201({ amountPaise: 10000 * R, deductibleOn: '2026-01-25', deductedOn: '2026-03-08', paidOn: '2026-05-20', basis: 'period' });
  assert.deepEqual([period.data.notDeducted.months, period.data.notPaid.months], [2, 3]);
});

test('s.201(1A)(ii): paid by the s.200 due date (7th, or 30 April for March) carries nothing; a day later is charged', () => {
  assert.equal(interest201({ amountPaise: 10000 * R, deductibleOn: '2026-01-28', deductedOn: '2026-01-28', paidOn: '2026-02-07' }).data.interestPaise, 0);
  const late = interest201({ amountPaise: 10000 * R, deductibleOn: '2026-01-28', deductedOn: '2026-01-28', paidOn: '2026-02-08' });
  assert.deepEqual([late.data.notPaid.months, late.data.notPaid.interestPaise], [2, 300 * R]);
  assert.equal(interest201({ amountPaise: 10000 * R, deductibleOn: '2026-03-31', deductedOn: '2026-03-31', paidOn: '2026-04-30' }).data.interestPaise, 0);
  assert.equal(interest201({ amountPaise: 10000 * R, deductibleOn: '2026-03-31', deductedOn: '2026-03-31', paidOn: '2026-05-01' }).data.notPaid.interestPaise, 450 * R);
});

test('s.201(1A) with Rule 119A(b): Rs 10,150 is charged on Rs 10,100, 1.5% giving paise', () => {
  const r = interest201({ amountPaise: 10150 * R, deductibleOn: '2026-01-10', deductedOn: '2026-01-10', paidOn: '2026-02-08', basis: 'period' });
  assert.equal(r.data.notPaid.basePaise, 10100 * R);
  assert.equal(r.data.notPaid.interestPaise, 15150);
});

test('s.201(1A)(i): not deducted at all runs at 1% to the date given; dates out of order are refused', () => {
  const r = interest201({ amountPaise: 10000 * R, deductibleOn: '2026-01-25', asOf: '2026-06-30' });
  assert.deepEqual([r.data.notDeducted.months, r.data.notDeducted.interestPaise, r.data.notPaid], [6, 600 * R, null]);
  assert.equal(interest201({ amountPaise: 10000 * R, deductibleOn: '2026-03-08', deductedOn: '2026-01-25' }).error, 'DATES_OUT_OF_ORDER');
  assert.equal(interest201({ amountPaise: 10000 * R, deductibleOn: '2026-01-25' }).error, 'DATE_NEEDED');
});

test('s.140A(1) Explanation with s.234A, 234B(2) and 234C: self-assessment tax goes first to interest, then to tax', () => {
  const r = incomeTaxInterest({
    fy: '2025-26', dueDate: '2026-07-31', filedOn: '2026-09-05',
    taxOnTotalIncome: 300000, tdsTcs: 50000,
    advanceTaxPayments: [{ date: '2025-06-15', amount: 37500 }, { date: '2025-09-15', amount: 75000 }, { date: '2025-12-15', amount: 50000 }, { date: '2026-03-15', amount: 37500 }],
    selfAssessmentPayments: [{ date: '2026-06-10', amount: 30000 }],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  const d = r.data;
  assert.equal(d.assessedTax, 250000);
  assert.equal(d.advanceTax, 200000);
  assert.equal(d.s234C.interest, 1250);
  assert.deepEqual(d.s234C.instalments.map((i) => i.interest), [0, 0, 750, 500]);
  assert.equal(d.selfAssessment[0].towardsInterest, 750 + 500 + 1500);
  assert.equal(d.selfAssessment[0].towardsTax, 27250);
  assert.deepEqual(d.s234B.legs.map((l) => [l.months, l.base, l.interest]), [[3, 50000, 1500], [3, 22700, 681]]);
  assert.equal(d.s234B.interest, 2181);
  assert.equal(d.s234A.base, 22700);
  assert.equal(d.s234A.months, 2);
  assert.equal(d.s234A.interest, 454);
  assert.equal(d.totalInterest, 1250 + 2181 + 454);
  assert.equal(d.interestPaid, 2750);
  assert.equal(d.interestStillDue, 1135);
  assert.equal(d.taxStillDue, 22750);
  assert.ok(d.forCA);
  assert.ok(d.sources.some((s) => /234B/.test(s)));
});

test('s.140A and s.234A: tax paid by the due date first clears 234B and 234C to that date, then cuts the 234A base', () => {
  const r = incomeTaxInterest({ fy: '2025-26', dueDate: '2026-07-31', filedOn: '2026-08-20', taxOnTotalIncome: 100000, selfAssessmentPayments: [{ date: '2026-04-20', amount: 100000 }] });
  const d = r.data;
  assert.deepEqual(d.s234C.instalments.map((i) => i.interest), [450, 1350, 2250, 1000]);
  assert.deepEqual(d.s234B.legs.map((l) => [l.months, l.base]), [[1, 100000], [4, 6000]]);
  assert.equal(d.selfAssessment[0].towardsInterest, 6050);
  assert.equal(d.s234A.base, 6000);
  assert.equal(d.s234A.months, 1);
  assert.equal(d.s234A.interest, 60);
});

test('incomeTaxInterest: advance tax dated after 31 March is self-assessment tax, and a filing date is required', () => {
  const r = incomeTaxInterest({ fy: '2025-26', dueDate: '2026-07-31', filedOn: '2026-07-31', taxOnTotalIncome: 100000, advanceTaxPayments: [{ date: '2026-04-05', amount: 100000 }] });
  assert.equal(r.data.advanceTax, 0);
  assert.equal(r.data.selfAssessment.length, 1);
  assert.ok(r.data.notes.some((n) => /after 31 March/.test(n)));
  assert.equal(incomeTaxInterest({ fy: '2025-26', dueDate: '2026-07-31', taxOnTotalIncome: 1 }).error, 'INVALID_DATE');
  assert.equal(incomeTaxInterest({ fy: '2025-26', dueDate: '2026-07-31', filedOn: '2026-07-31', taxOnTotalIncome: 1, tdsTcs: -5 }).error, 'BAD_AMOUNT');
});

test('tdsInterest: s.234E fee and s.201(1A) interest in rupees, and the TDS statement draft supplies the due date and TDS', async () => {
  const plain = tdsInterest({ dueDate: '2026-07-31', filedOn: '2026-08-10', tds: 1500, late: [{ amount: 10000, deductibleOn: '2026-01-25', deductedOn: '2026-03-08', paidOn: '2026-05-20' }] });
  assert.equal(plain.ok, true, JSON.stringify(plain));
  assert.equal(plain.data.s234E.fee, 1500);
  assert.equal(plain.data.s201.interest, 750);
  assert.equal(plain.data.total, 2250);
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', tdsDeductor: true, tan: 'MUMA12345B' };
  for (const [date, rate] of [['2026-07-10', 40000], ['2026-08-20', 20000]]) {
    const held = propose(state, 'create_purchase', { partyName: 'Rao & Co', date, lines: [{ description: 'Fees', qty: 1, rate, gstRate: 18 }], tdsSection: '194J', tdsCategory: 'professional', payeePan: 'AAAFR1234K' });
    assert.equal((await confirmPending(state, held.preview.token)).posted, true);
  }
  const late = await runTool(state, 'tds_interest', { quarter: 'Q2 2026-27', filedOn: '2026-11-10' });
  assert.equal(late.ok, true, JSON.stringify(late));
  assert.equal(late.data.s234E.dueDate, '2026-10-31');
  assert.equal(late.data.s234E.days, 10);
  assert.equal(late.data.s234E.cap, 6000);
  assert.equal(late.data.s234E.fee, 2000);
  const capped = await runTool(state, 'tds_interest', { quarter: 'Q2 2026-27', filedOn: '2027-03-31' });
  assert.equal(capped.data.s234E.fee, 6000);
  assert.equal(capped.data.s234E.capped, true);
  assert.equal(tdsInterest({}).error, 'NOTHING_TO_COMPUTE');
});

test('income_tax_interest and tds_interest are strict read-only assistant tools, available remotely', async () => {
  for (const name of ['income_tax_interest', 'tds_interest']) {
    assert.ok(TOOLS.some((t) => t.name === name), name);
    assert.equal(TOOL_ARG_SCHEMAS[name].additionalProperties, false);
    const tool = assistantTools(TOOLS).find((t) => t.name === name);
    assert.equal(tool.risk, 'read_only');
    assert.equal(tool.strict, true);
    assert.ok(REMOTE_QUERY_TOOLS.has(name));
  }
  const state = createState();
  const r = await runTool(state, 'income_tax_interest', { fy: '2025-26', dueDate: '2026-07-31', filedOn: '2026-11-14', taxOnTotalIncome: 150000, tdsTcs: 40000, advanceTaxPayments: [{ date: '2026-03-15', amount: 50000 }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.data.totalInterest > 0);
});

test('advance tax names the s.234C interest on missed instalments instead of saying it is not worked out', () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Rao', gstin: '27AABCU9603R1ZN', state: '27', entityType: 'proprietorship' };
  state.invoices = [{ id: 'INV-1', date: '2026-05-10', status: 'final', taxable: 3000000, total: 3150000 }];
  const est = advanceTax(state, { asOf: '2026-10-18' });
  assert.equal(est.ok, true, JSON.stringify(est));
  assert.doesNotMatch(est.data.interest, /does not compute/);
  assert.match(est.data.interest, /234B and 234C/);
  assert.ok(est.data.interest234C > 0);
  const missedJun = est.data.instalments[0];
  assert.equal(missedJun.status, 'missed');
});
