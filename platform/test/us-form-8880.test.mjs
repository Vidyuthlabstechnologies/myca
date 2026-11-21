import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040, US_FORMS_SUPPORTED } from '../src/us-1040.mjs';
import { saversRate, electiveDeferrals } from '../src/us-form-8880.mjs';
import { setUsTaxpayer, addUsTaxForm, answerUsInterview, usInterview, usReturnReview } from '../src/us-return.mjs';
import { rules } from '../src/sprint-load.mjs';
import { createState } from '../src/store.mjs';

const w2 = (wages, box12 = [], owner = 'taxpayer') => ({ kind: 'W-2', owner, payer: owner === 'spouse' ? 'Beta LLC' : 'Acme Inc', fields: { wages, federalWithheld: 0, socialSecurityWages: wages, medicareWages: wages, box12 } });
const adult = { firstName: 'Ana', lastName: 'Diaz', dateOfBirth: '1990-04-02' };
const partner = { firstName: 'Luis', lastName: 'Diaz', dateOfBirth: '1989-06-10' };
const run = (filingStatus, forms, answers = {}, taxYear = '2025', more = {}) => {
  const out = computeForm1040({ filingStatus, taxpayer: adult, spouse: ['mfj', 'mfs'].includes(filingStatus) ? partner : undefined, forms, answers, ...more }, taxYear);
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.data;
};
const rule = (taxYear) => rules.rule('us.federal.individual.savers-credit', `${taxYear}-12-31`).value;
const codes = (data) => data.checks.map((item) => item.code);

test('the 2025 rate bands are Notice 2024-80 and the 2026 bands Notice 2025-67, read as "over / but not over"', () => {
  const y2025 = rule('2025');
  assert.equal(y2025.contributionCapCents, 200000);
  for (const [agi, status, rate] of [[23750, 'single', 5000], [23751, 'single', 2000], [25500, 'mfs', 2000], [25501, 'mfs', 1000], [39500, 'qss', 1000], [39501, 'single', 0], [35625, 'hoh', 5000], [38250, 'hoh', 2000], [59250, 'hoh', 1000], [59251, 'hoh', 0], [47500, 'mfj', 5000], [51000, 'mfj', 2000], [79000, 'mfj', 1000], [79001, 'mfj', 0]]) assert.equal(saversRate(agi, status, y2025), rate, `2025 ${status} ${agi}`);
  const y2026 = rule('2026');
  for (const [agi, status, rate] of [[24250, 'single', 5000], [26250, 'single', 2000], [40250, 'single', 1000], [40251, 'single', 0], [36375, 'hoh', 5000], [39375, 'hoh', 2000], [60375, 'hoh', 1000], [60376, 'hoh', 0], [48500, 'mfj', 5000], [52500, 'mfj', 2000], [80500, 'mfj', 1000], [80501, 'mfj', 0]]) assert.equal(saversRate(agi, status, y2026), rate, `2026 ${status} ${agi}`);
  assert.equal(rules.rule('us.federal.individual.savers-credit', '2027-06-30').ok, false, 'the saver\'s match replaces it from 2027; no 2027 record');
  assert.ok(US_FORMS_SUPPORTED.includes('8880'));
});

test('elective deferrals come from W-2 box 12 codes D, E, F, G, H, S, AA, BB and EE only', () => {
  assert.equal(electiveDeferrals([{ code: 'D', amount: 1000 }, { code: 'AA', amount: 500 }, { code: 'W', amount: 3000 }, { code: 'DD', amount: 9000 }, { code: 'ee', amount: 25 }, { code: 'C', amount: 50 }]), 1525);
  assert.equal(electiveDeferrals(undefined), 0);
});

test('2025 single, AGI 30,000 (10% band): IRA 1,000 + 401(k) 1,500 - distributions 200 = 2,300, capped at 2,000, credit 200 on Schedule 3 line 4', () => {
  const data = run('single', [w2(30000, [{ code: 'D', amount: 1500 }])], { retirementSavings: true, saverIraContributions: 1000, saverDistributions: 200 });
  const form = data.schedules[8880];
  assert.deepEqual(form.a, { 1: 1000, 2: 1500, 3: 2500, 4: 200, 5: 2300, 6: 2000 });
  assert.equal(form.b, undefined);
  assert.equal(form[7], 2000);
  assert.equal(form[9], 0.1);
  assert.equal(form[10], 200);
  const taxOnTableMidpoint14275 = 1192.5 + 0.12 * (14275 - 11925);
  assert.equal(data.lines[18], Math.round(taxOnTableMidpoint14275));
  assert.equal(form[11], 1475);
  assert.equal(form[12], 200);
  assert.equal(data.schedules[3][4], 200);
  assert.equal(data.schedules[3][8], 200);
  assert.equal(data.lines[22], 1475 - 200);
});

test('2025 joint, AGI 40,000 (50% band): both spouses\' distributions reduce both columns, and the 1,550 credit is limited to the 853 of tax', () => {
  const data = run('mfj', [w2(25000, [{ code: 'D', amount: 3000 }]), w2(15000, [{ code: 'AA', amount: 1000 }], 'spouse')], { retirementSavings: true, spouseSaverIraContributions: 500, saverDistributions: 400 });
  const form = data.schedules[8880];
  assert.deepEqual(form.a, { 1: 0, 2: 3000, 3: 3000, 4: 400, 5: 2600, 6: 2000 });
  assert.deepEqual(form.b, { 1: 500, 2: 1000, 3: 1500, 4: 400, 5: 1100, 6: 1100 });
  assert.equal(form[7], 2000 + 1100);
  assert.equal(form[9], 0.5);
  assert.equal(form[10], 1550);
  const taxOnTableMidpoint8525 = 0.1 * 8525;
  assert.equal(data.lines[18], Math.round(taxOnTableMidpoint8525));
  assert.equal(form[12], 853);
  assert.equal(data.schedules[3][4], 853);
  assert.equal(data.lines[22], 0);
  assert.ok(codes(data).includes('SAVERS_CREDIT_LIMITED_BY_TAX'));
});

test('someone under 18, claimed as a dependent or a full-time student is left out; born on January 1, 2008 counts as 18 for 2025', () => {
  const forms = [w2(30000, [{ code: 'D', amount: 2000 }])];
  const minor = computeForm1040({ filingStatus: 'single', taxpayer: { ...adult, dateOfBirth: '2008-01-02' }, forms, answers: {} }, '2025').data;
  assert.equal(minor.schedules[8880][12], 0);
  assert.deepEqual(minor.schedules[8880].a, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });
  assert.ok(codes(minor).includes('SAVERS_CREDIT_PERSON_EXCLUDED'));
  const newYear = computeForm1040({ filingStatus: 'single', taxpayer: { ...adult, dateOfBirth: '2008-01-01' }, forms, answers: {} }, '2025').data;
  assert.equal(newYear.schedules[8880][12], 200);
  const dependent = computeForm1040({ filingStatus: 'single', taxpayer: { ...adult, canBeClaimedAsDependent: true }, forms, answers: {} }, '2025').data;
  assert.equal(dependent.schedules[8880][12], 0);
  assert.match(dependent.checks.find((item) => item.code === 'SAVERS_CREDIT_PERSON_EXCLUDED').message, /dependent/);
  const student = run('single', forms, { saverStudent: true });
  assert.equal(student.schedules[8880][12], 0);
  const jointStudent = run('mfj', [w2(20000, [{ code: 'D', amount: 2000 }]), w2(10000, [{ code: 'D', amount: 2000 }], 'spouse')], { spouseSaverStudent: true });
  assert.equal(jointStudent.schedules[8880].b[6], 0);
  assert.equal(jointStudent.schedules[8880][7], 2000);
  assert.equal(jointStudent.schedules[8880][10], 1000);
});

test('married filing separately uses the "all other" bands and has no spouse column', () => {
  const data = run('mfs', [w2(30000, [{ code: 'E', amount: 1000 }])], { saverAbleContributions: 300 });
  const form = data.schedules[8880];
  assert.equal(form.b, undefined);
  assert.equal(form[9], 0.1);
  assert.equal(form[7], 1300);
  assert.equal(form[10], 130);
  assert.equal(form[12], 130);
  const above = run('mfs', [w2(39501, [{ code: 'E', amount: 1000 }])]);
  assert.equal(above.schedules[8880][12], 0);
  assert.ok(codes(above).includes('SAVERS_CREDIT_AGI_TOO_HIGH'));
});

test('head of household 2025 at AGI 38,000 is in the 20% band: 2,000 deferral gives 400', () => {
  const data = computeForm1040({ filingStatus: 'hoh', taxpayer: adult, dependents: [{ firstName: 'Mia', lastName: 'Diaz', relationship: 'daughter', dateOfBirth: '2005-03-01', months: 12, student: true }], forms: [w2(38000, [{ code: 'G', amount: 2500 }])], answers: {} }, '2025').data;
  assert.equal(data.schedules[8880][9], 0.2);
  assert.equal(data.schedules[8880][10], 400);
  assert.equal(data.schedules[3][4], 400);
});

test('2026 single, AGI 24,000 (50% band): 2,500 deferral capped at 2,000 gives 1,000, limited to the 793 of tax on the 2026 table', () => {
  const data = run('single', [w2(24000, [{ code: 'E', amount: 2500 }])], {}, '2026');
  const form = data.schedules[8880];
  assert.equal(form[9], 0.5);
  assert.equal(form[10], 1000);
  const standard2026 = 16100;
  const taxOnTableMidpoint7925 = 0.1 * (24000 - standard2026 + 25);
  assert.equal(data.lines[18], Math.round(taxOnTableMidpoint7925));
  assert.equal(form[12], 793);
  assert.equal(data.schedules[3][4], 793);
});

test('the saver\'s credit comes after the foreign, care and education credits and before the child tax credit', () => {
  const dependents = [{ firstName: 'Mia', lastName: 'Diaz', relationship: 'daughter', dateOfBirth: '2018-03-01', months: 12 }];
  const forms = [w2(30000, [{ code: 'D', amount: 2000 }]), { kind: '1099-DIV', owner: 'taxpayer', payer: 'Fund', fields: { ordinaryDividends: 100, foreignTaxPaid: 100 } }];
  const data = computeForm1040({ filingStatus: 'hoh', taxpayer: adult, dependents, forms, answers: {} }, '2025').data;
  assert.equal(data.schedules[3][1], 100);
  assert.equal(data.schedules[8880][11], data.lines[18] - 100);
  assert.equal(data.schedules[8880][10], 1000);
  assert.equal(data.schedules[3][4], Math.min(1000, data.lines[18] - 100));
  assert.equal(data.schedules[8812][13], Math.max(0, data.lines[18] - 100 - data.schedules[3][4]));
  assert.equal(data.lines[19], Math.min(2200, data.schedules[8812][13]));
});

test('the interview asks the saver\'s credit questions after a yes or a W-2 deferral, and the review shows Schedule 3 line 4', () => {
  const state = createState();
  assert.equal(setUsTaxpayer(state, { taxYear: '2025', filingStatus: 'mfj', taxpayer: { ...adult, ssn: '400-12-3456' }, spouse: { ...partner, ssn: '400-12-3457' } }).ok, true);
  const first = usInterview(state, { taxYear: '2025' }).data.questions.map((item) => item.id);
  assert.ok(first.includes('retirementSavings'));
  assert.ok(!first.includes('saverIraContributions') && !first.includes('saverDistributions'));
  assert.equal(addUsTaxForm(state, { taxYear: '2025', kind: 'W-2', payer: 'Acme Inc', fields: { wages: 50000, box12: [{ code: 'd', amount: 2000 }] } }).ok, true);
  const second = usInterview(state, { taxYear: '2025' }).data.questions.map((item) => item.id);
  assert.ok(second.includes('saverDistributions') && second.includes('spouseSaverStudent') && !second.includes('saverIraContributions'));
  assert.equal(answerUsInterview(state, { taxYear: '2025', id: 'retirementSavings', answer: 'yes' }).ok, true);
  assert.equal(answerUsInterview(state, { taxYear: '2025', id: 'spouseSaverIraContributions', answer: 1000 }).ok, true);
  const third = usInterview(state, { taxYear: '2025' }).data.questions.map((item) => item.id);
  assert.ok(third.includes('saverIraContributions') && third.includes('spouseSaverAbleContributions'));
  const review = usReturnReview(state, { taxYear: '2025' }).data;
  assert.ok(review.schedules.includes('8880'));
  const line = review.lines.find((item) => item.form === 'Schedule 3' && item.line === '4');
  assert.equal(line.label, 'Retirement savings contributions credit (Form 8880)');
  assert.equal(line.amount, 600);
  assert.equal(review.lines.find((item) => item.form === 'Form 8880' && item.line === '7').amount, 3000);
});
