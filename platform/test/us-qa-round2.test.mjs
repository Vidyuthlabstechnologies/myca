import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040 } from '../src/us-1040.mjs';
import { deemedEarnedIncome } from '../src/us-form-2441.mjs';
import { legalHolidays, nextFilingDay } from '../src/us-legal-holidays.mjs';
import { form1040X } from '../src/us-1040x.mjs';
import { rules } from '../src/sprint-load.mjs';
import { usInterview } from '../src/us-return.mjs';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';

const codes = (data) => data.checks.map((item) => item.code);
const compute = (input, year = '2025') => {
  const out = computeForm1040(input, year);
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.data;
};

const careFamily = {
  filingStatus: 'mfj',
  taxpayer: { firstName: 'Sam', lastName: 'Lee', dateOfBirth: '1985-03-10' },
  spouse: { firstName: 'Alex', lastName: 'Lee', dateOfBirth: '1986-01-01' },
  dependents: [
    { id: 'dep-Mia', firstName: 'Mia', lastName: 'Lee', relationship: 'daughter', dateOfBirth: '2020-03-01', months: 12 },
    { id: 'dep-Leo', firstName: 'Leo', lastName: 'Lee', relationship: 'daughter', dateOfBirth: '2016-02-01', months: 12 },
  ],
  answers: { careStudentOrDisabled: 'spouse', careStudentOrDisabledMonths: '9' },
  forms: [
    { kind: 'W-2', owner: 'taxpayer', payer: 'Acme Inc', fields: { wages: 60000 } },
    { kind: 'W-2', owner: 'spouse', payer: 'Beta LLC', fields: { wages: 2000 } },
    { kind: '2441-PROVIDER', owner: 'taxpayer', payer: 'Sunny', payerTin: '12-3456789', fields: { amountPaid: 6000, qualifyingPerson: 'Mia' } },
    { kind: '2441-PROVIDER', owner: 'taxpayer', payer: 'Club', payerTin: '12-3456789', fields: { amountPaid: 4000, qualifyingPerson: 'Leo' } },
  ],
};
const care = (data) => data.schedules['2441'];

test('Pub. 503 (2025) and Form 2441 lines 4-5: a spouse who was a student 9 months with $2,000 of summer pay, two qualifying persons: 9 x 500 + 2,000 = 6,500; line 6 = min(6,000, 60,000, 6,500) = 6,000; 20% at AGI 62,000 = 1,200', () => {
  const data = compute({ ...careFamily, answers: { ...careFamily.answers, careStudentOrDisabledOtherPay: 2000 } });
  assert.deepEqual([care(data)['3'], care(data)['4'], care(data)['5'], care(data)['6'], care(data)['11']], [6000, 60000, 6500, 6000, 1200]);
  assert.equal(care(data).B, true);
  assert.ok(!codes(data).includes('CARE_DEEMED_OTHER_MONTHS_PAY'));
});

test('Pub. 503 one qualifying person: 9 x 250 + 2,000 = 4,250; line 3 = 3,000, line 6 = 3,000, credit 20% = 600', () => {
  const data = compute({ ...careFamily, dependents: [careFamily.dependents[0]], forms: careFamily.forms.slice(0, 3), answers: { ...careFamily.answers, careStudentOrDisabledOtherPay: 2000 } });
  assert.deepEqual([care(data)['3'], care(data)['5'], care(data)['6'], care(data)['11']], [3000, 4250, 3000, 600]);
});

test('Without the pay of the other months all 2,000 is treated as earned in the student months: max(4,500, 2,000) = 4,500, credit 900, and the interview asks for it', async () => {
  const data = compute(careFamily);
  assert.deepEqual([care(data)['5'], care(data)['6'], care(data)['11']], [4500, 4500, 900]);
  assert.ok(codes(data).includes('CARE_DEEMED_OTHER_MONTHS_PAY'));
  const state = createState();
  state.company = { name: 'Lee household', country: 'US', gstin: '', state: '' };
  const set = await runTool(state, 'set_us_taxpayer', { taxYear: '2025', filingStatus: 'mfj', taxpayer: { ...careFamily.taxpayer, ssn: '400-12-3456' }, spouse: { ...careFamily.spouse, ssn: '400-12-3457' }, address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' } });
  assert.equal(set.ok, true, JSON.stringify(set));
  const added = await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: '2441-PROVIDER', payer: 'Sunny', payerTin: '12-3456789', fields: { amountPaid: 6000, qualifyingPerson: 'spouse' } });
  assert.equal(added.ok, true, JSON.stringify(added));
  for (const [id, answer] of [['careStudentOrDisabled', 'spouse'], ['careStudentOrDisabledMonths', '9']]) await runTool(state, 'answer_us_interview', { taxYear: '2025', id, answer });
  const questions = usInterview(state, { taxYear: '2025' }).data.questions.map((item) => item.id);
  assert.ok(questions.includes('careStudentOrDisabledOtherPay'), questions.join(','));
});

test('Pub. 503: in a student month the higher of the deemed amount and that month\'s actual pay counts: pay 8,000 with 2,000 outside 9 student months, two persons: 2,000 + max(4,500, 6,000) = 8,000; 12 months ignores the outside pay', () => {
  const credit = rules.rule('us.federal.individual.dependent-care-credit', '2025-12-31').value;
  assert.equal(deemedEarnedIncome(8000, 9, 2, credit, 2000).earned, 8000);
  assert.equal(deemedEarnedIncome(3000, 9, 2, credit, 2000).earned, 6500);
  assert.equal(deemedEarnedIncome(3000, 12, 1, credit, 2000).earned, 3000);
  assert.equal(deemedEarnedIncome(1000, 12, 1, credit, 2000).earned, 3000);
});

test('2026 Form 2441 (Public Law 119-21 rates): the same family, 6,500 on line 5, line 6 = 6,000 and the 2026 rate at AGI 62,000 joint', () => {
  const data = compute({ ...careFamily, answers: { ...careFamily.answers, careStudentOrDisabledOtherPay: 2000 } }, '2026');
  assert.deepEqual([care(data)['5'], care(data)['6']], [6500, 6000]);
  assert.equal(care(data)['11'], Math.round(6000 * care(data)['8']));
});

const adult = { firstName: 'Maya', lastName: 'Shah', dateOfBirth: '1985-06-01' };
const w2 = (wages, owner = 'taxpayer') => ({ kind: 'W-2', owner, payer: 'Acme Inc', fields: { wages, socialSecurityWages: wages, medicareWages: wages } });
const r = (fields, owner = 'taxpayer') => ({ kind: '1099-R', owner, payer: 'Vanguard', fields });
const retire = (forms, answers = {}, year = '2025', extra = {}) => compute({ filingStatus: 'single', taxpayer: adult, forms: [w2(60000), ...forms], answers, ...extra }, year);
const f5329 = (data, owner = 'taxpayer') => data.form5329.find((item) => item.owner === owner);
const f8606 = (data) => data.schedules['8606'][0];

test('Form 8606 line 20 and Form 5329 line 1 (2025 i5329, line 1): 15,000 code J, five-year rule met, 10,000 first-home costs, 4,000 used before: line 20 = min(10,000, 10,000 - 4,000) = 6,000; line 23 = 15,000 - 6,000 - 2,000 = 7,000 taxable; line 1 = 7,000 + 6,000 = 13,000, line 2 = 6,000 (exception 09), line 4 = 700', () => {
  const data = retire([r({ grossDistribution: 15000, distributionCode: 'J' })], { rothFiveYearMet: true, rothFirstHomeExpenses: 10000, firstHomePriorUse: 4000, rothContributionBasis: 2000 });
  assert.deepEqual([f8606(data).lines['19'], f8606(data).lines['20'], f8606(data).lines['21'], f8606(data).lines['22'], f8606(data).lines['23'], f8606(data).lines['25c']], [15000, 6000, 9000, 2000, 7000, 7000]);
  assert.deepEqual([f5329(data).lines['1'], f5329(data).lines['2'], f5329(data).lines['3'], f5329(data).lines['4']], [13000, 6000, 7000, 700]);
  assert.equal(f5329(data).exceptionNumber, '09');
  assert.equal(data.lines['4b'], 7000);
});

test('One $10,000 lifetime limit (IRC 72(t)(8)(B)): five-year rule not met, so no line 20; the 13,000 taxable gets exception 09 only for the 6,000 left after 4,000 used before: line 4 = 10% of 7,000 = 700', () => {
  const data = retire([r({ grossDistribution: 15000, distributionCode: 'J' })], { rothFiveYearMet: false, rothFirstHomeExpenses: 10000, firstHomePriorUse: 4000, rothContributionBasis: 2000 });
  assert.equal(f8606(data).lines['20'], 0);
  assert.equal(f8606(data).lines['25c'], 13000);
  assert.deepEqual([f5329(data).lines['1'], f5329(data).lines['2'], f5329(data).lines['4']], [13000, 6000, 700]);
  assert.ok(codes(data).includes('EARLY_DISTRIBUTION_EXCEPTION_CAPPED'));
});

test('Exception 09 on a traditional IRA shares the limit with Roth line 20: 6,000 on line 20 leaves 4,000 for an 8,000 code 1 IRA distribution marked 09: line 1 = 8,000 + 6,000 + 7,000, line 2 = 6,000 + 4,000, tax 10% of (8,000 - 4,000 + 7,000) = 1,100', () => {
  const data = retire([r({ grossDistribution: 15000, distributionCode: 'J' }), r({ grossDistribution: 8000, taxableAmount: 8000, iraSepSimple: true, distributionCode: '1', exceptionCode: '09' })], { rothFiveYearMet: true, rothFirstHomeExpenses: 6000, rothContributionBasis: 2000 });
  assert.equal(f8606(data).lines['20'], 6000);
  assert.deepEqual([f5329(data).lines['1'], f5329(data).lines['2'], f5329(data).lines['4']], [21000, 10000, 1100]);
});

test('IRA limit 2025 (i8606: smaller of $7,000, $8,000 at 50, or taxable compensation): 9,000 nondeductible at 40 puts 7,000 on 8606 line 1 and 2,000 on 5329 line 15, 6% = 120', () => {
  const data = retire([], { iraNondeductibleContributions: 9000 });
  assert.equal(f8606(data).lines['1'], 7000);
  assert.deepEqual([f5329(data).lines['15'], f5329(data).lines['16'], f5329(data).lines['17']], [2000, 2000, 120]);
  assert.ok(codes(data).includes('IRA_NONDEDUCTIBLE_OVER_LIMIT'));
  const older = retire([], { iraNondeductibleContributions: 9000 }, '2025', { taxpayer: { ...adult, dateOfBirth: '1975-12-31' } });
  assert.equal(f8606(older).lines['1'], 8000);
  assert.equal(f5329(older).lines['15'], 1000);
});

test('IRA limit 2026 (Notice 2025-67: $7,500, catch-up $1,100): 9,000 at 40 gives 7,500 and 1,500 excess (90); at 50 the limit is 8,600 and the excess 400 (24)', () => {
  const data = retire([], { iraNondeductibleContributions: 9000 }, '2026');
  assert.equal(f8606(data).lines['1'], 7500);
  assert.deepEqual([f5329(data).lines['15'], f5329(data).lines['17']], [1500, 90]);
  const older = retire([], { iraNondeductibleContributions: 9000 }, '2026', { taxpayer: { ...adult, dateOfBirth: '1976-06-01' } });
  assert.equal(f8606(older).lines['1'], 8600);
  assert.deepEqual([f5329(older).lines['15'], f5329(older).lines['17']], [400, 24]);
});

test('IRA limit is also taxable compensation: wages 3,000 limit 3,000, so 5,000 nondeductible gives line 1 = 3,000 and 2,000 excess; a deduction of 2,000 leaves 1,000 for line 1', () => {
  const low = compute({ filingStatus: 'single', taxpayer: adult, forms: [w2(3000)], answers: { iraNondeductibleContributions: 5000 } });
  assert.equal(f8606(low).lines['1'], 3000);
  assert.equal(f5329(low).lines['15'], 2000);
  const deducted = compute({ filingStatus: 'single', taxpayer: adult, forms: [w2(3000)], answers: { iraNondeductibleContributions: 5000, iraDeduction: 2000 } });
  assert.equal(f8606(deducted).lines['1'], 1000);
  assert.equal(f5329(deducted).lines['15'], 4000);
});

test('Roth IRA excess (i5329 line 23: the traditional limit less traditional contributions): 2025, 2,000 nondeductible and 7,000 Roth leaves room 5,000, so 2,000 on line 23 and 6% = 120', () => {
  const data = retire([], { iraNondeductibleContributions: 2000, rothContributions: 7000 });
  assert.deepEqual([f5329(data).lines['23'], f5329(data).lines['24'], f5329(data).lines['25']], [2000, 2000, 120]);
  assert.ok(codes(data).includes('ROTH_CONTRIBUTION_OVER_LIMIT'));
  const within = retire([], { iraNondeductibleContributions: 2000, rothContributions: 5000 });
  assert.equal(within.form5329.length, 0);
});

test('Joint return, spouse without pay (Kay Bailey Hutchison spousal IRA): the taxpayer\'s 7,000 is within the limit; the excess question answered with a smaller figure warns', () => {
  const data = compute({ filingStatus: 'mfj', taxpayer: adult, spouse: { firstName: 'Ravi', lastName: 'Shah', dateOfBirth: '1984-03-03' }, forms: [w2(60000)], answers: { iraNondeductibleContributions: 7000, spouseSaverIraContributions: 7000 } });
  assert.equal(f8606(data).lines['1'], 7000);
  assert.ok(!codes(data).includes('IRA_NONDEDUCTIBLE_OVER_LIMIT'));
  const answered = retire([], { iraNondeductibleContributions: 9000, iraExcessContributions: true, iraExcessCurrent: 500 });
  assert.equal(f5329(answered).lines['15'], 500);
  assert.ok(codes(answered).includes('IRA_EXCESS_BELOW_LIMIT_CHECK'));
});

test('Roth conversion recapture on Form 5329 line 1 (i5329 line 1, Pub. 590-B ordering): 10,000 code J, 4,000 contributions, 3,000 conversions all from the last five years of which 2,500 taxable: line 1 = 3,000 earnings + 2,500 recapture = 5,500, tax 550', () => {
  const data = retire([r({ grossDistribution: 10000, distributionCode: 'J' })], { rothContributionBasis: 4000, rothConversionBasis: 3000, rothConversionsRecent: 3000, rothConversionsRecentTaxable: 2500 });
  assert.equal(f8606(data).lines['25c'], 3000);
  assert.deepEqual([f5329(data).lines['1'], f5329(data).lines['3'], f5329(data).lines['4']], [5500, 5500, 550]);
  assert.ok(codes(data).includes('ROTH_CONVERSION_RECAPTURE_INCLUDED'));
  assert.ok(!data.unsupported.some((item) => item.code === 'ROTH_CONVERSION_RECAPTURE'));
  assert.equal(data.lines['4b'], 3000);
});

test('Recapture follows first-in first-out: 6,000 code J with 4,000 contributions takes 2,000 of conversions, all from the 2,000 older ones, so nothing is recaptured', () => {
  const data = retire([r({ grossDistribution: 6000, distributionCode: 'J' })], { rothContributionBasis: 4000, rothConversionBasis: 3000, rothConversionsRecent: 1000, rothConversionsRecentTaxable: 1000 });
  assert.equal(data.form5329.find((item) => item.owner === 'taxpayer')?.lines['1'] || 0, 0);
  assert.ok(!codes(data).includes('ROTH_CONVERSION_RECAPTURE_INCLUDED'));
  const after = retire([r({ grossDistribution: 8000, distributionCode: 'J' })], { rothContributionBasis: 4000, rothConversionBasis: 3000, rothConversionsRecent: 1000, rothConversionsRecentTaxable: 600 });
  assert.deepEqual([f5329(after).lines['1'], f5329(after).lines['4']], [1600, 160]);
});

test('Code T (over 59 1/2 or another exception) owes no recapture; without the recent conversion answers the recapture is flagged', () => {
  const t = retire([r({ grossDistribution: 10000, distributionCode: 'T' })], { rothFiveYearMet: false, rothContributionBasis: 4000, rothConversionBasis: 3000, rothConversionsRecent: 3000, rothConversionsRecentTaxable: 3000 });
  assert.ok(!codes(t).includes('ROTH_CONVERSION_RECAPTURE_INCLUDED'));
  const unanswered = retire([r({ grossDistribution: 10000, distributionCode: 'J' })], { rothContributionBasis: 4000, rothConversionBasis: 3000 });
  assert.ok(unanswered.unsupported.some((item) => item.code === 'ROTH_CONVERSION_RECAPTURE'));
});

test('IRC 7503 with D.C. Code 28-2701: 2029-04-15 is a Sunday and Monday 16 April is Emancipation Day, so a TY2025 refund claim is due 2029-04-17; the 2022 and 2023 due dates were April 18', () => {
  const holidays = rules.rule('us.federal.legal-holidays', '2029-04-15').value;
  assert.equal(nextFilingDay('2029-04-15', holidays).date, '2029-04-17');
  assert.equal(nextFilingDay('2022-04-15', holidays).date, '2022-04-18');
  assert.equal(nextFilingDay('2023-04-15', holidays).date, '2023-04-18');
  assert.equal(nextFilingDay('2027-04-15', holidays).date, '2027-04-15');
  assert.equal(nextFilingDay('2026-07-03', holidays).date, '2026-07-06');
  assert.equal(nextFilingDay('2029-01-20', holidays).date, '2029-01-22');
  assert.deepEqual([...legalHolidays(2027, holidays).keys()].sort(), ['2027-01-01', '2027-01-18', '2027-02-15', '2027-04-16', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-10-11', '2027-11-11', '2027-11-25', '2027-12-24', '2027-12-31']);
  const original = { filingStatus: 'single', agi: 60000, deduction: 15750, taxableIncome: 44250, tax: 5075, credits: 0, otherTaxes: 0, totalTax: 5075, withholding: 7000, estimatedPayments: 0, eic: 0, refundableCredits: 0, refund: 1925, appliedToNextYear: 0, amountOwed: 0, dependents: { children: 0, other: 0 } };
  const x = form1040X({ taxYear: '2025', today: '2029-04-17', amendment: { original, explanation: 'Corrected W-2 withholding.', originalFiledOn: '2026-03-01' }, amended: { ...original, withholding: 7100 } });
  assert.equal(x.ok, true, JSON.stringify(x));
  assert.equal(x.data.deadline.refundClaimBy, '2029-04-17');
  assert.deepEqual(x.data.deadline.movedUnderSection7503[0].skipped.map((item) => item.reason), ['Sunday', 'District of Columbia Emancipation Day']);
  assert.ok(!x.data.checks.some((item) => item.code === 'AMENDED_CLAIM_TOO_LATE'));
});

const rental = (fields, owner = 'taxpayer') => ({ kind: 'Rental property', id: `rental-${owner}`, owner, payer: '12 Lake Rd, Tahoe CA', fields });
const vacation = { propertyType: 1, fairRentalDays: 100, personalUseDays: 20, rents: 9000, mortgageInterest: 6000, taxes: 2400, utilities: 1200, depreciation: 6000 };

test('IRC 280A(c)(5), Pub. 527 Worksheet 5-1 (2025), standard deduction: 100/120 rental share; 4b 5,000 + 4c 2,000 + 4a 1,000 = 8,000 allowed against 9,000; 1,000 of the 5,000 depreciation allowed and 4,000 carried over; Schedule E line 21 = 0 and AGI stays 90,000', () => {
  const data = compute({ filingStatus: 'single', taxpayer: adult, forms: [w2(90000), rental(vacation)] });
  const property = data.schedules.E.properties[0];
  const sheet = property.vacationHome.worksheet;
  assert.deepEqual([sheet['1'], sheet['2e'], sheet['3'], sheet['4a'], sheet['4b'], sheet['4c'], sheet['4e'], sheet['4f'], sheet['5'], sheet['6b'], sheet['6e'], sheet['7a'], sheet['7b']], [9000, 0, 9000, 1000, 5000, 2000, 8000, 8000, 1000, 5000, 1000, 0, 4000]);
  assert.deepEqual([property.lines['12'], property.lines['16'], property.lines['17'], property.lines['18'], property.lines['20'], property.lines['21']], [5000, 2000, 1000, 1000, 9000, 0]);
  assert.deepEqual(property.vacationHome.carryover, { operating: 0, depreciation: 4000 });
  assert.equal(data.schedules.E.lines['26'], 0);
  assert.equal(data.summary.agi, 90000);
  assert.ok(codes(data).includes('VACATION_HOME_LIMIT'));
  assert.ok(!data.unsupported.some((item) => item.form === 'Pub 527'));
  assert.equal(data.schedules['8582'], undefined);
});

test('Worksheet 5-1 for an itemizer: interest 5,000 and taxes 2,000 are on lines 2a and 2b and fully deductible; rents 5,000 then leave nothing for utilities or depreciation, so line 21 is -2,000, a nonpassive loss (IRC 469(j)(10))', () => {
  const data = compute({ filingStatus: 'single', taxpayer: adult, forms: [w2(90000), rental({ ...vacation, rents: 5000 })], answers: { itemize: 'yes' } });
  const property = data.schedules.E.properties[0];
  const sheet = property.vacationHome.worksheet;
  assert.deepEqual([sheet['2a'], sheet['2b'], sheet['2e'], sheet['3'], sheet['4e'], sheet['4f'], sheet['6e'], sheet['7a'], sheet['7b']], [5000, 2000, 7000, 0, 1000, 0, 0, 1000, 5000]);
  assert.equal(property.lines['21'], -2000);
  assert.equal(data.schedules.E.lines['26'], -2000);
  assert.equal(data.schedules['8582'], undefined);
  const standard = compute({ filingStatus: 'single', taxpayer: adult, forms: [w2(90000), rental({ ...vacation, rents: 5000 })], answers: { itemize: 'no' } });
  assert.equal(standard.schedules.E.properties[0].lines['21'], 0);
  assert.deepEqual(standard.schedules.E.properties[0].vacationHome.carryover, { operating: 3000, depreciation: 5000 });
});

test('Worksheet 5-1 carryovers from last year (lines 4d and 6c) are used after this year\'s expenses: 500 operating and 1,000 depreciation carried in; 9,000 rents allow 500 of 4d and 500 of depreciation', () => {
  const data = compute({ filingStatus: 'single', taxpayer: adult, forms: [w2(90000), rental({ ...vacation, depreciation: 0, priorOperatingCarryover: 500, priorDepreciationCarryover: 1000 })] });
  const property = data.schedules.E.properties[0];
  const sheet = property.vacationHome.worksheet;
  assert.deepEqual([sheet['4d'], sheet['4e'], sheet['4f'], sheet['5'], sheet['6c'], sheet['6e'], sheet['7b']], [500, 8500, 8500, 500, 1000, 500, 500]);
  assert.deepEqual([property.lines['18'], property.lines['19'], property.lines['21']], [500, 500, 0]);
});

const lossProperty = { propertyType: 1, rents: 12000, mortgageInterest: 15000, taxes: 4000, depreciation: 3000, activeParticipation: true };

test('Form 8582 on a separate return (IRC 469(i)(5)): without the lived-apart answer no allowance is given and the gap is flagged; living apart all year allows up to 12,500 (loss 10,000 at MAGI 40,000)', () => {
  const unanswered = compute({ filingStatus: 'mfs', taxpayer: adult, spouse: { firstName: 'Ravi', lastName: 'Shah' }, forms: [w2(40000), rental(lossProperty)] });
  assert.ok(codes(unanswered).includes('MFS_LIVED_APART_UNANSWERED'));
  assert.equal(unanswered.schedules.E.properties[0].lines['22'], 0);
  const apart = compute({ filingStatus: 'mfs', taxpayer: adult, spouse: { firstName: 'Ravi', lastName: 'Shah' }, forms: [w2(40000), rental(lossProperty)], answers: { livedWithSpouse: false } });
  assert.ok(!codes(apart).includes('MFS_LIVED_APART_UNANSWERED'));
  assert.equal(apart.schedules.E.properties[0].lines['22'], -10000);
  const together = compute({ filingStatus: 'mfs', taxpayer: adult, spouse: { firstName: 'Ravi', lastName: 'Shah' }, forms: [w2(40000), rental(lossProperty)], answers: { livedWithSpouse: true } });
  assert.ok(!codes(together).includes('MFS_LIVED_APART_UNANSWERED'));
  assert.equal(together.schedules.E.properties[0].lines['22'], 0);
});

test('IRA contribution limit records: 2025 7,000 + 1,000, 2026 7,500 + 1,100 (Notice 2025-67), 2027 7,500 + 1,100 (Notice 2026-66)', () => {
  const value = (date) => rules.rule('us.federal.individual.ira-contribution-limit', date).value;
  assert.deepEqual([value('2025-12-31').limitCents, value('2025-12-31').catchUpCents], [700000, 100000]);
  assert.deepEqual([value('2026-12-31').limitCents, value('2026-12-31').catchUpCents], [750000, 110000]);
  assert.deepEqual([value('2027-06-30').limitCents, value('2027-06-30').catchUpCents], [750000, 110000]);
});
