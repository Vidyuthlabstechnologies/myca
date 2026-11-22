import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040 } from '../src/us-1040.mjs';
import { careApplicableBasisPoints, careExpenseLimit, deemedEarnedIncome } from '../src/us-form-2441.mjs';
import { addUsTaxForm, setUsTaxpayer, answerUsInterview, usInterview, usReturnReview, usFormKinds } from '../src/us-return.mjs';
import { rules } from '../src/sprint-load.mjs';
import { createState } from '../src/store.mjs';

const w2 = (wages, extra = {}, owner = 'taxpayer') => ({ kind: 'W-2', owner, payer: owner === 'spouse' ? 'Beta LLC' : 'Acme Inc', fields: { wages, federalWithheld: 0, socialSecurityWages: wages, medicareWages: wages, ...extra } });
const provider = (name, amountPaid, qualifyingPerson = '', extra = {}) => ({ kind: '2441-PROVIDER', owner: 'taxpayer', payer: name, payerTin: '12-3456789', fields: { amountPaid, qualifyingPerson, ...extra } });
const child = (firstName, dateOfBirth, extra = {}) => ({ id: `dep-${firstName}`, firstName, lastName: 'Diaz', relationship: 'daughter', dateOfBirth, months: 12, ...extra });
const adult = { firstName: 'Ana', lastName: 'Diaz', dateOfBirth: '1988-04-02' };
const partner = { firstName: 'Luis', lastName: 'Diaz', dateOfBirth: '1987-06-10' };
const run = (filingStatus, forms, more = {}, taxYear = '2025') => {
  const out = computeForm1040({ filingStatus, taxpayer: adult, spouse: ['mfj', 'mfs'].includes(filingStatus) ? partner : undefined, forms, ...more }, taxYear);
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.data;
};
const credit2025 = () => rules.rule('us.federal.individual.dependent-care-credit', '2025-12-31').value;
const credit2026 = () => rules.rule('us.federal.individual.dependent-care-credit', '2026-12-31').value;

test('the 2025 percentage is 35% less a point per $2,000 or part above $15,000, never below 20%', () => {
  const rule = credit2025();
  assert.equal(careApplicableBasisPoints(15000, false, rule), 3500);
  assert.equal(careApplicableBasisPoints(15001, false, rule), 3400);
  assert.equal(careApplicableBasisPoints(17000, false, rule), 3400);
  assert.equal(careApplicableBasisPoints(40000, false, rule), 2200);
  assert.equal(careApplicableBasisPoints(43000, false, rule), 2100);
  assert.equal(careApplicableBasisPoints(43001, false, rule), 2000);
  assert.equal(careApplicableBasisPoints(160000, true, rule), 2000);
  assert.equal(careExpenseLimit(1, rule), 3000);
  assert.equal(careExpenseLimit(3, rule), 6000);
});

test('the 2026 percentage follows P.L. 119-21: 50% down to 35% above $15,000, then down to 20% above $75,000 ($150,000 joint, $4,000 steps)', () => {
  const rule = credit2026();
  assert.equal(careApplicableBasisPoints(15000, false, rule), 5000);
  assert.equal(careApplicableBasisPoints(40000, false, rule), 3700);
  assert.equal(careApplicableBasisPoints(43000, false, rule), 3600);
  assert.equal(careApplicableBasisPoints(43001, false, rule), 3500);
  assert.equal(careApplicableBasisPoints(75000, false, rule), 3500);
  assert.equal(careApplicableBasisPoints(75001, false, rule), 3400);
  assert.equal(careApplicableBasisPoints(103000, false, rule), 2100);
  assert.equal(careApplicableBasisPoints(103001, false, rule), 2000);
  assert.equal(careApplicableBasisPoints(150000, true, rule), 3500);
  assert.equal(careApplicableBasisPoints(154000, true, rule), 3400);
  assert.equal(careApplicableBasisPoints(160000, true, rule), 3200);
  assert.equal(careApplicableBasisPoints(206000, true, rule), 2100);
  assert.equal(careApplicableBasisPoints(206001, true, rule), 2000);
  assert.equal(careApplicableBasisPoints(160000, false, rule), 2000);
});

test('the exclusion limit is $5,000 ($2,500 MFS) for 2025 and $7,500 ($3,750) from 2026', () => {
  assert.deepEqual(rules.rule('us.federal.individual.dependent-care-exclusion', '2025-12-31').value, { maxCents: 500000, mfsMaxCents: 250000 });
  assert.deepEqual(rules.rule('us.federal.individual.dependent-care-exclusion', '2026-12-31').value, { maxCents: 750000, mfsMaxCents: 375000 });
});

test('deemed income is the larger of months times $250 ($500 for two or more) and the actual earnings', () => {
  assert.deepEqual(deemedEarnedIncome(0, 9, 2, credit2025()), { earned: 4500, deemed: 4500, used: true });
  assert.deepEqual(deemedEarnedIncome(0, 9, 1, credit2025()), { earned: 2250, deemed: 2250, used: true });
  assert.deepEqual(deemedEarnedIncome(8000, 9, 2, credit2025()), { earned: 8000, deemed: 4500, used: false });
});

test('2025 single parent, one child, $5,000 of daycare: 3,000 x 22% at AGI 40,000 is 660, taken before the child tax credit', () => {
  const data = run('hoh', [w2(40000), provider('Sunny Daycare', 5000, 'Mia')], { dependents: [child('Mia', '2021-03-01')] });
  const form = data.schedules['2441'];
  assert.equal(form['3'], 3000);
  assert.equal(form['4'], 40000);
  assert.equal(form['5'], 40000);
  assert.equal(form['6'], 3000);
  assert.equal(form['7'], 40000);
  assert.equal(form['8'], 0.22);
  assert.equal(form['9a'], 660);
  const taxableIncome = 40000 - 23625;
  const tax = Math.round(16375 * 0.1);
  assert.equal(data.lines['15'], taxableIncome);
  assert.equal(data.lines['18'], tax);
  assert.equal(form['10'], tax);
  assert.equal(form['11'], 660);
  assert.equal(data.schedules['3']['2'], 660);
  assert.equal(data.lines['20'], 660);
  assert.equal(data.lines['19'], tax - 660);
  assert.equal(data.lines['22'], 0);
  assert.deepEqual(form.persons.map((item) => [item.firstName, item.expenses, item.disabledOver12]), [['Mia', 5000, false]]);
  assert.deepEqual(form.providers.map((item) => [item.name, item.amount, item.qualifyingPerson]), [['Sunny Daycare', 5000, 'dep-Mia']]);
  assert.equal(form.A, false);
  assert.equal(form.B, false);
  assert.ok(!data.unsupported.some((item) => item.form === '2441'));
});

test('2025 joint return, two children, $5,000 of W-2 box 10 benefits: 6,000 - 5,000 = 1,000 x 20% = 200', () => {
  const data = run('mfj', [w2(60000, { dependentCareBenefits: 5000 }), w2(45000, {}, 'spouse'), provider('Little Steps', 9000, 'Mia'), provider('After School Club', 4000, 'Leo')], { dependents: [child('Mia', '2022-05-01'), child('Leo', '2017-02-01', { relationship: 'son' })] });
  const form = data.schedules['2441'];
  assert.deepEqual([12, 15, 16, 17, 18, 19, 20, 21, 25, 26].map((line) => form[String(line)]), [5000, 5000, 13000, 5000, 60000, 45000, 5000, 5000, 5000, 0]);
  assert.deepEqual([27, 28, 29, 30, 31].map((line) => form[String(line)]), [6000, 5000, 1000, 8000, 1000]);
  assert.equal(form['3'], 1000);
  assert.equal(form['6'], 1000);
  assert.equal(form['8'], 0.2);
  assert.equal(form['11'], 200);
  assert.equal(data.lines['1e'], undefined);
  assert.equal(data.lines['1z'], 105000);
  assert.equal(data.schedules['3']['2'], 200);
  assert.equal(data.lines['19'], 4400);
});

test('benefits above the expenses are taxable on line 1e: $5,000 limit in 2025 and $7,500 from 2026', () => {
  const small = run('single', [w2(50000, { dependentCareBenefits: 5000 }), provider('Sunny Daycare', 3000)], { dependents: [child('Mia', '2021-03-01')] });
  assert.equal(small.schedules['2441']['25'], 3000);
  assert.equal(small.schedules['2441']['26'], 2000);
  assert.equal(small.lines['1e'], 2000);
  assert.equal(small.lines['1z'], 52000);
  assert.equal(small.schedules['2441']['29'], 0);
  assert.equal(small.schedules['2441']['11'], 0);
  const forms = [w2(50000, { dependentCareBenefits: 7500 }), provider('Sunny Daycare', 6000)];
  const y2025 = run('single', forms, { dependents: [child('Mia', '2021-03-01')] }, '2025');
  assert.deepEqual([17, 21, 25, 26].map((line) => y2025.schedules['2441'][String(line)]), [6000, 5000, 5000, 2500]);
  assert.equal(y2025.lines['1e'], 2500);
  const y2026 = run('single', forms, { dependents: [child('Mia', '2021-03-01')] }, '2026');
  assert.deepEqual([17, 21, 25, 26].map((line) => y2026.schedules['2441'][String(line)]), [6000, 7500, 6000, 1500]);
  assert.equal(y2026.lines['1e'], 1500);
  assert.equal(y2026.lines['11b'], 51500);
});

test('2026 enhanced percentage: AGI 40,000 is 37% (1,110 on 3,000); joint AGI 160,000 is 32% (1,920 on 6,000) against 20% in 2025', () => {
  const low = run('hoh', [w2(40000), provider('Sunny Daycare', 3000)], { dependents: [child('Mia', '2021-03-01')] }, '2026');
  assert.equal(low.schedules['2441']['8'], 0.37);
  assert.equal(low.schedules['2441']['9a'], 1110);
  assert.ok(low.lines['18'] > 1110);
  assert.equal(low.schedules['3']['2'], 1110);
  const family = (year) => run('mfj', [w2(100000), w2(60000, {}, 'spouse'), provider('Little Steps', 5000, 'Mia'), provider('After School Club', 3000, 'Leo')], { dependents: [child('Mia', '2022-05-01'), child('Leo', '2016-02-01')] }, year);
  const y2026 = family('2026');
  assert.equal(y2026.lines['11b'], 160000);
  assert.equal(y2026.schedules['2441']['3'], 6000);
  assert.equal(y2026.schedules['2441']['8'], 0.32);
  assert.equal(y2026.schedules['2441']['11'], 1920);
  assert.equal(family('2025').schedules['2441']['11'], 1200);
});

test('married filing separately gets no credit unless the lived-apart test is met', () => {
  const forms = [w2(40000), provider('Sunny Daycare', 3000, 'Mia')];
  const dependents = [child('Mia', '2021-03-01')];
  const blocked = run('mfs', forms, { dependents });
  assert.equal(blocked.schedules['2441']['11'], undefined);
  assert.equal(blocked.schedules['2441'].creditAllowed, false);
  assert.equal(blocked.lines['20'], 0);
  assert.equal(blocked.checks.find((item) => item.code === 'CARE_CREDIT_MFS').form, '2441');
  const apart = run('mfs', forms, { dependents, answers: { careMfsUnmarried: true } });
  assert.equal(apart.schedules['2441'].A, true);
  assert.equal(apart.schedules['2441']['5'], 40000);
  assert.equal(apart.schedules['2441']['11'], 660);
  assert.ok(!apart.checks.some((item) => item.code === 'CARE_CREDIT_MFS'));
});

test('a separate return without the lived-apart test still excludes benefits, up to $2,500 and the spouse\'s earned income', () => {
  const data = run('mfs', [w2(40000, { dependentCareBenefits: 5000 }), provider('Sunny Daycare', 6000, 'Mia')], { dependents: [child('Mia', '2021-03-01')], answers: { careSpouseEarnedIncome: 30000 } });
  const form = data.schedules['2441'];
  assert.deepEqual([17, 19, 20, 21, 25, 26].map((line) => form[String(line)]), [5000, 30000, 5000, 2500, 2500, 2500]);
  assert.equal(data.lines['1e'], 2500);
});

test('the lower-earning spouse limits the expenses: 1,800 x 20% = 360', () => {
  const data = run('mfj', [w2(70000), w2(1800, {}, 'spouse'), provider('Sunny Daycare', 3000, 'Mia')], { dependents: [child('Mia', '2021-03-01')] });
  assert.equal(data.schedules['2441']['5'], 1800);
  assert.equal(data.schedules['2441']['6'], 1800);
  assert.equal(data.schedules['2441']['11'], 360);
});

test('a full-time student spouse is deemed to earn $500 a month with two children (9 months = 4,500 x 20% = 900)', () => {
  const forms = [w2(50000), provider('Little Steps', 4000, 'Mia'), provider('After School Club', 3000, 'Leo')];
  const dependents = [child('Mia', '2022-05-01'), child('Leo', '2016-02-01')];
  const none = run('mfj', forms, { dependents });
  assert.equal(none.schedules['2441']['5'], 0);
  assert.equal(none.schedules['2441']['11'], 0);
  const student = run('mfj', forms, { dependents, answers: { careStudentOrDisabled: 'spouse', careStudentOrDisabledMonths: '9' } });
  assert.equal(student.schedules['2441']['5'], 4500);
  assert.equal(student.schedules['2441']['6'], 4500);
  assert.equal(student.schedules['2441']['11'], 900);
  assert.equal(student.schedules['2441'].B, true);
  const oneChild = run('mfj', [w2(50000), provider('Little Steps', 4000, 'Mia')], { dependents: [child('Mia', '2022-05-01')], answers: { careStudentOrDisabled: 'spouse', careStudentOrDisabledMonths: '9' } });
  assert.equal(oneChild.schedules['2441']['5'], 2250);
  assert.equal(oneChild.schedules['2441']['11'], 450);
});

test('the credit is limited by tax less the foreign tax credit, and comes before the education credit and the child tax credit', () => {
  const tuition = { kind: '1098-T', owner: 'taxpayer', payer: 'State College', fields: { tuitionPaid: 4000, graduate: true } };
  const data = run('hoh', [w2(26000), provider('Sunny Daycare', 3000, 'Mia'), tuition], { dependents: [child('Mia', '2021-03-01')] });
  const form = data.schedules['2441'];
  assert.equal(form['8'], 0.29);
  assert.equal(form['9a'], 870);
  const tax = Math.round(2387.5 * 0.1);
  assert.equal(data.lines['18'], tax);
  assert.equal(form['10'], tax);
  assert.equal(form['11'], tax);
  assert.equal(data.schedules['3']['3'], 0);
  assert.equal(data.lines['19'], 0);
  assert.equal(data.lines['22'], 0);
});

test('only qualifying persons count: under 13 for part of the year, or disabled; a dependent taxpayer has none', () => {
  const turned13 = run('single', [w2(50000), provider('Camp', 2000, 'Mia')], { dependents: [child('Mia', '2012-07-01')] });
  assert.equal(turned13.schedules['2441']['3'], 2000);
  const teen = run('single', [w2(50000), provider('Camp', 2000, 'Mia')], { dependents: [child('Mia', '2011-07-01')] });
  assert.equal(teen.schedules['2441']['11'], undefined);
  assert.equal(teen.schedules['2441'].creditAllowed, false);
  assert.ok(teen.checks.some((item) => item.code === 'CARE_PERSON_NOT_QUALIFYING') && teen.checks.some((item) => item.code === 'CARE_NO_QUALIFYING_PERSON'));
  const teenAndToddler = run('single', [w2(50000), provider('Camp', 2000, 'Mia'), provider('Little Steps', 1000, 'Leo')], { dependents: [child('Mia', '2011-07-01'), child('Leo', '2022-07-01')] });
  assert.equal(teenAndToddler.schedules['2441']['3'], 1000);
  const disabled = run('single', [w2(50000), provider('Care Home', 4000, 'Mia')], { dependents: [child('Mia', '2010-07-01', { disabled: true })] });
  assert.equal(disabled.schedules['2441']['3'], 3000);
  assert.equal(disabled.schedules['2441'].persons[0].disabledOver12, true);
  const unknown = run('single', [w2(50000), provider('Camp', 2000, 'Zed')], { dependents: [child('Mia', '2021-07-01')] });
  assert.equal(unknown.checks.find((item) => item.code === 'CARE_PERSON_UNKNOWN').level, 'error');
  const claimed = computeForm1040({ filingStatus: 'single', taxpayer: { ...adult, canBeClaimedAsDependent: true }, forms: [w2(20000), provider('Sunny Daycare', 3000, 'Mia')], dependents: [child('Mia', '2021-03-01')] }, '2025').data;
  assert.equal(claimed.schedules['2441']['11'], undefined);
  assert.equal(claimed.lines['20'], 0);
  assert.ok(claimed.checks.some((item) => item.code === 'CARE_NO_QUALIFYING_PERSON'));
  const twoKidsOneCost = run('single', [w2(50000), provider('Little Steps', 6000, 'Mia')], { dependents: [child('Mia', '2022-05-01'), child('Leo', '2016-02-01')] });
  assert.equal(twoKidsOneCost.schedules['2441']['3'], 6000);
});

test('a disabled spouse named as the cared-for person is a qualifying person on a joint return', () => {
  const data = run('mfj', [w2(60000), provider('Home Aide', 5000, 'spouse')], { answers: { careStudentOrDisabled: 'spouse', careStudentOrDisabledMonths: '12' } });
  assert.deepEqual(data.schedules['2441'].persons.map((item) => [item.kind, item.disabledOver12]), [['spouse', true]]);
  assert.equal(data.schedules['2441']['5'], 3000);
  assert.equal(data.schedules['2441']['6'], 3000);
  assert.equal(data.schedules['2441']['11'], 600);
});

test('provider checks: no TIN, a household employee, and the old interview amount without providers', () => {
  const data = run('single', [w2(50000), { kind: '2441-PROVIDER', owner: 'taxpayer', payer: 'Nanny Jo', fields: { amountPaid: 3000, householdEmployee: true } }], { dependents: [child('Mia', '2021-03-01')] });
  assert.ok(data.checks.some((item) => item.code === 'CARE_PROVIDER_TIN_MISSING'));
  assert.ok(data.checks.some((item) => item.code === 'CARE_HOUSEHOLD_EMPLOYEE'));
  assert.equal(data.schedules['2441']['11'], 600);
  const legacy = run('single', [w2(50000)], { dependents: [child('Mia', '2021-03-01')], answers: { childCareExpenses: 3000 } });
  assert.ok(legacy.checks.some((item) => item.code === 'CARE_PROVIDERS_NEEDED'));
  assert.equal(legacy.schedules['2441'], undefined);
});

test('the return flow adds a care provider, asks the care questions and shows Schedule 3 line 2 in the review', () => {
  const state = createState();
  const kinds = usFormKinds().data.kinds.map((item) => item.kind);
  assert.ok(kinds.includes('2441-PROVIDER'));
  assert.ok(usFormKinds().data.kinds.find((item) => item.kind === 'W-2').fields.some((item) => item.key === 'dependentCareBenefits' && item.box === '10'));
  assert.equal(setUsTaxpayer(state, { taxYear: '2025', filingStatus: 'mfj', taxpayer: { ...adult, ssn: '400-12-3456' }, spouse: { ...partner, ssn: '400-12-3457' }, dependents: [{ firstName: 'Mia', lastName: 'Diaz', relationship: 'daughter', dateOfBirth: '2021-03-01', ssn: '400-12-3458', months: 12 }] }).ok, true);
  assert.equal(addUsTaxForm(state, { taxYear: '2025', kind: 'W-2', payer: 'Acme Inc', fields: { wages: 50000, dependentCareBenefits: 1000 } }).ok, true);
  assert.equal(addUsTaxForm(state, { taxYear: '2025', kind: 'W-2', owner: 'spouse', payer: 'Beta LLC', fields: { wages: 30000 } }).ok, true);
  const missingName = addUsTaxForm(state, { taxYear: '2025', kind: '2441-provider', fields: { amountPaid: 3000 } });
  assert.deepEqual(missingName.problems, ['Care provider name is required.']);
  const added = addUsTaxForm(state, { taxYear: '2025', kind: '2441-provider', payer: 'Sunny Daycare', payerTin: '12-3456789', fields: { amountPaid: 4000, qualifyingPerson: 'Mia', householdEmployee: 'no' } });
  assert.equal(added.ok, true);
  assert.equal(added.data.amounts.householdEmployee, false);
  const ids = usInterview(state, { taxYear: '2025' }).data.questions.map((item) => item.id);
  assert.ok(ids.includes('careStudentOrDisabled') && ids.includes('careBenefitsForfeited') && !ids.includes('careMfsUnmarried') && !ids.includes('childCareExpenses'));
  assert.equal(answerUsInterview(state, { taxYear: '2025', id: 'careStudentOrDisabledMonths', answer: '13' }).error, 'US_ANSWER_INVALID');
  const review = usReturnReview(state, { taxYear: '2025' }).data;
  const line = (form, number) => review.lines.find((item) => item.form === form && item.line === number)?.amount;
  assert.equal(line('Form 2441', '3'), 2000);
  assert.equal(line('Schedule 3', '2'), 400);
  assert.equal(line('Form 2441', '11'), 400);
  assert.ok(review.schedules.includes('2441'));
  assert.ok(!review.checks.some((item) => item.code.startsWith('FORM_2441')));
});
