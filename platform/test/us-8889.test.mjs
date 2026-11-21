import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040, US_FORMS_SUPPORTED, US_FORMS_COMING, FORM_KINDS } from '../src/us-1040.mjs';
import { hsaContributionLimit } from '../src/us-form-8889.mjs';
import { addUsTaxForm, planUsTaxForm, setUsTaxpayer, usInterview, usReturnReview, answerUsInterview, planUsInterviewAnswer, FORM_SPECS } from '../src/us-return.mjs';
import { rules } from '../src/sprint-load.mjs';
import { createState } from '../src/store.mjs';
import { TOOL_ARG_SCHEMAS } from '../src/assistant-contract.mjs';

const w2 = (wages, extra = {}, owner = 'taxpayer') => ({ kind: 'W-2', owner, payer: 'Acme Inc', fields: { wages, federalWithheld: Math.round(wages * 0.2), socialSecurityWages: wages, socialSecurityTax: Math.round(wages * 6.2) / 100, medicareWages: wages, medicareTax: Math.round(wages * 1.45) / 100, ...extra } });
const sa = (grossDistribution, fields = {}, owner = 'taxpayer') => ({ kind: '1099-SA', owner, payer: 'HSA Bank', fields: { grossDistribution, distributionCode: '1', accountType: 'HSA', ...fields } });
const person = (firstName, dateOfBirth = '1985-03-10') => ({ firstName, lastName: 'Lee', dateOfBirth });
const run = (taxYear, filingStatus, forms, answers = {}, more = {}) => computeForm1040({ filingStatus, taxpayer: person('Kim'), ...(filingStatus === 'mfj' ? { spouse: person('Jo') } : {}), address: { line1: '1 Main St', city: 'Denver', state: 'CO', zip: '80202' }, forms, answers, ...more }, taxYear);
const form8889 = (out, owner = 'taxpayer') => out.data.schedules['8889'].find((item) => item.owner === owner).lines;
const codes = (out) => out.data.checks.map((item) => item.code);

test('the HSA limits are the Rev. Proc. 2024-25, 2025-19 and 2026-24 figures, with a fixed $1,000 catch-up at 55, a 20% and a 10% additional tax', () => {
  const at = (date) => rules.rule('us.federal.individual.hsa-limits', date).value;
  assert.deepEqual([at('2025-12-31'), at('2026-12-31'), at('2027-12-31')].map((value) => [value.selfOnlyCents / 100, value.familyCents / 100, value.catchUpCents / 100, value.catchUpAge]), [[4300, 8550, 1000, 55], [4400, 8750, 1000, 55], [4500, 9000, 1000, 55]]);
  assert.deepEqual(rules.rule('us.federal.individual.hsa-additional-taxes', '2026-06-30').value, { nonQualifiedDistributionBasisPoints: 2000, exceptionAge: 65, testingPeriodBasisPoints: 1000 });
  assert.ok(US_FORMS_SUPPORTED.includes('8889'));
  assert.ok(!US_FORMS_COMING.includes('8889'));
  for (const kind of ['1099-SA', '5498-SA']) {
    assert.ok(FORM_KINDS.includes(kind));
    assert.ok(FORM_SPECS[kind]);
    assert.ok(TOOL_ARG_SCHEMAS.add_us_tax_form.properties.kind.enum.includes(kind));
  }
  assert.ok(FORM_SPECS['W-2'].fields.some((item) => item.key === 'hsaEmployerContributions' && item.box === '12W'));
});

test('2025 self-only under the limit: contributions 3,000 below 4,300 are deducted in full on line 13 and Schedule 1 line 13', () => {
  const out = run('2025', 'single', [w2(60000)], { hsaCoverage: 'self-only', hsaOwnContributions: 3000 });
  assert.equal(out.ok, true);
  const f = form8889(out);
  assert.equal(f['1'], 'self-only');
  assert.deepEqual([f['2'], f['3'], f['5'], f['6'], f['7'], f['8'], f['9'], f['11'], f['12'], f['13']], [3000, 4300, 4300, 4300, 0, 4300, 0, 0, 4300, 3000]);
  assert.equal(out.data.schedules['1']['13'], 3000);
  assert.equal(out.data.lines['10'], 3000);
  assert.equal(out.data.lines['11b'], 60000 - 3000);
  assert.ok(!codes(out).some((code) => code.startsWith('HSA_')));
  assert.deepEqual(out.data.unsupported, []);
  assert.ok(!out.data.notCovered.some((item) => /taken as entered/.test(item) && /HSA/.test(item)));
});

test('2026 family coverage with employer contributions: 8,750 - W-2 code W 2,500 = 6,250 line 12; own 5,000 is deducted in full', () => {
  const out = run('2026', 'mfj', [w2(90000, { box12: [{ code: 'D', amount: 4000 }, { code: 'W', amount: 2500 }] })], { hsaCoverage: 'family', hsaOwnContributions: 5000 });
  const f = form8889(out);
  assert.deepEqual([f['3'], f['6'], f['8'], f['9'], f['11'], f['12'], f['13']], [8750, 8750, 8750, 2500, 2500, 6250, 5000]);
  assert.equal(out.data.schedules['1']['13'], 5000);
  assert.equal(out.data.schedules['8889'].length, 1);
});

test('the W-2 code W amount can be entered as its own field when box 12 is not itemized', () => {
  const out = run('2026', 'single', [w2(50000, { hsaEmployerContributions: 1200 })], { hsaCoverage: 'self-only', hsaOwnContributions: 4000 });
  const f = form8889(out);
  assert.deepEqual([f['9'], f['12'], f['13']], [1200, 4400 - 1200, 3200]);
  assert.ok(codes(out).includes('HSA_EXCESS_CONTRIBUTION'));
});

test('catch-up at 55: 2025 single age 57 self-only 4,300 + 1,000 = 5,300 on line 3; 2026 age 60 4,400 + 1,000 = 5,400', () => {
  const y2025 = run('2025', 'single', [w2(70000)], { hsaCoverage: 'self-only', hsaOwnContributions: 5300 }, { taxpayer: person('Kim', '1968-05-01') });
  assert.deepEqual([form8889(y2025)['3'], form8889(y2025)['7'], form8889(y2025)['13']], [5300, 0, 5300]);
  const y2026 = run('2026', 'single', [w2(70000)], { hsaCoverage: 'self-only', hsaOwnContributions: 6000 }, { taxpayer: person('Kim', '1966-02-02') });
  assert.deepEqual([form8889(y2026)['3'], form8889(y2026)['13']], [5400, 5400]);
  const unmarriedFamily = run('2025', 'hoh', [w2(70000)], { hsaCoverage: 'family', hsaOwnContributions: 9550 }, { taxpayer: person('Kim', '1968-05-01'), dependents: [{ firstName: 'Ari', lastName: 'Lee', relationship: 'son', dateOfBirth: '2012-01-01', months: 12 }] });
  assert.deepEqual([form8889(unmarriedFamily)['3'], form8889(unmarriedFamily)['7'], form8889(unmarriedFamily)['13']], [8550 + 1000, 0, 9550]);
});

test('married with family coverage and separate HSAs: 2025 limit 8,550 split by the agreed share 6,000 / 2,550, each spouse 56 adds 1,000 on line 7; spouse 4,000 over 3,550 is excess', () => {
  const out = run('2025', 'mfj', [w2(80000), w2(40000, {}, 'spouse')], { hsaCoverage: 'family', hsaOwnContributions: 7000, spouseHsaCoverage: 'self-only', spouseHsaOwnContributions: 4000, hsaFamilyShare: 6000 }, { taxpayer: person('Kim', '1969-01-15'), spouse: person('Jo', '1969-07-20') });
  const tp = form8889(out, 'taxpayer');
  const sp = form8889(out, 'spouse');
  assert.equal(sp['1'], 'family');
  assert.deepEqual([tp['3'], tp['5'], tp['6'], tp['7'], tp['8'], tp['13']], [8550, 8550, 6000, 1000, 7000, 7000]);
  assert.deepEqual([sp['3'], sp['6'], sp['7'], sp['8'], sp['13']], [8550, 2550, 1000, 3550, 3550]);
  assert.equal(out.data.schedules['1']['13'], 7000 + 3550);
  const excess = out.data.checks.find((item) => item.code === 'HSA_EXCESS_CONTRIBUTION');
  assert.match(excess.message, /^Spouse: HSA excess contributions of 450/);
  assert.equal(excess.level, 'warning');
  assert.deepEqual(out.data.unsupported.filter((item) => item.form === '5329').map((item) => item.required), [false]);
  const even = run('2025', 'mfj', [w2(80000)], { hsaCoverage: 'family', hsaOwnContributions: 4275, spouseHsaCoverage: 'family', spouseHsaOwnContributions: 4275 });
  assert.deepEqual([form8889(even)['6'], form8889(even, 'spouse')['6'], even.data.schedules['1']['13']], [4275, 4275, 8550]);
});

test('mid-year eligibility: eligible from June (7 months) and on December 1 uses the last-month rule for the full 4,300 with a testing-period warning; 5 months without December is 4,300 x 5 / 12 = 1,792', () => {
  const lastMonth = run('2025', 'single', [w2(60000)], { hsaCoverage: 'self-only', hsaMonths: 7, hsaEligibleDecember: true, hsaOwnContributions: 4300 });
  assert.deepEqual([form8889(lastMonth)['3'], form8889(lastMonth)['13']], [4300, 4300]);
  assert.match(lastMonth.data.checks.find((item) => item.code === 'HSA_TESTING_PERIOD').message, /December 31, 2026/);
  const prorated = run('2025', 'single', [w2(60000)], { hsaCoverage: 'self-only', hsaMonths: 5, hsaEligibleDecember: false, hsaOwnContributions: 2500 });
  assert.deepEqual([form8889(prorated)['3'], form8889(prorated)['13']], [1792, 1792]);
  assert.match(prorated.data.checks.find((item) => item.code === 'HSA_EXCESS_CONTRIBUTION').message, /contributions of 708 above/);
  assert.ok(!codes(prorated).includes('HSA_TESTING_PERIOD'));
  const limits = rules.rule('us.federal.individual.hsa-limits', '2026-12-31').value;
  assert.equal(hsaContributionLimit({ coverage: 'family', months: 6, age: 58, married: true, limits }).line7, 500);
  assert.equal(hsaContributionLimit({ coverage: 'family', months: 6, age: 58, married: true, limits }).line3, 4375);
});

test('failing the testing period: 2026 line 18 2,000 is income on Schedule 1 line 8f and 10% = 200 on Schedule 2 line 17d', () => {
  const out = run('2026', 'single', [w2(60000)], { hsaCoverage: 'none', hsaTestingPeriodIncome: 2000 });
  const f = form8889(out);
  assert.deepEqual([f['18'], f['19'], f['20'], f['21']], [2000, 0, 2000, 200]);
  assert.equal(out.data.schedules['1']['8f'], 2000);
  assert.equal(out.data.schedules['1']['9'], 2000);
  assert.equal(out.data.schedules['2']['13d'], 200);
  assert.equal(out.data.schedules['2']['14'], 200);
  assert.equal(out.data.schedules['2']['21'], 200);
  assert.equal(out.data.lines['23'], 200);
});

test('a taxable non-qualified distribution: 2025 age 45, 1099-SA 3,000 with 1,800 of medical expenses makes 1,200 taxable on line 8f and 20% = 240 on Schedule 2 line 17c', () => {
  const out = run('2025', 'single', [w2(60000), sa(3000)], { hsaQualifiedExpenses: 1800 });
  const f = form8889(out);
  assert.deepEqual([f['14a'], f['14b'], f['14c'], f['15'], f['16'], f['17a'], f['17b']], [3000, 0, 3000, 1800, 1200, false, 240]);
  assert.equal(out.data.schedules['1']['8f'], 1200);
  assert.equal(out.data.lines['8'], 1200);
  assert.equal(out.data.lines['9'], 61200);
  assert.equal(out.data.schedules['2']['17c'], 240);
  assert.equal(out.data.schedules['2']['21'], 240);
  assert.ok(!codes(out).includes('HSA_COVERAGE_NEEDED'));
  const unanswered = run('2025', 'single', [w2(60000), sa(3000)]);
  assert.equal(unanswered.data.checks.find((item) => item.code === 'HSA_QUALIFIED_EXPENSES_NEEDED').level, 'error');
  assert.equal(form8889(unanswered)['16'], 0);
});

test('the 20% tax exceptions: age 65 or older, disability, and death or disability codes; reaching 65 in the year warns', () => {
  const senior = run('2025', 'single', [w2(30000), sa(3000)], { hsaQualifiedExpenses: 1800 }, { taxpayer: person('Kim', '1958-03-01') });
  assert.deepEqual([form8889(senior)['16'], form8889(senior)['17a'], form8889(senior)['17b']], [1200, true, 0]);
  assert.equal(senior.data.schedules['1']['8f'], 1200);
  assert.equal(senior.data.schedules['2'], undefined);
  const turned = run('2026', 'single', [w2(30000), sa(1000)], { hsaQualifiedExpenses: 0 }, { taxpayer: person('Kim', '1961-06-01') });
  assert.equal(form8889(turned)['17b'], 0);
  assert.ok(codes(turned).includes('HSA_TURNED_65_IN_YEAR'));
  const disabled = run('2025', 'single', [w2(30000), sa(1000)], { hsaQualifiedExpenses: 0, hsaDisabled: true });
  assert.deepEqual([form8889(disabled)['16'], form8889(disabled)['17b']], [1000, 0]);
  const coded = run('2025', 'single', [w2(30000), sa(1000, { distributionCode: '3' }), sa(500)], { hsaQualifiedExpenses: 0 });
  assert.deepEqual([form8889(coded)['16'], form8889(coded)['17a'], form8889(coded)['17b']], [1500, true, 100]);
});

test('rollovers and withdrawn excess contributions come off line 14a; the earnings on the excess are other income', () => {
  const out = run('2026', 'single', [w2(50000), sa(5000), sa(600, { distributionCode: '2', earningsOnExcess: 25 })], { hsaRollover: 5000, hsaQualifiedExpenses: 0 });
  const f = form8889(out);
  assert.deepEqual([f['14a'], f['14b'], f['14c'], f['16']], [5600, 5600, 0, 0]);
  assert.equal(out.data.schedules['1']['8z'], 25);
  assert.equal(out.data.schedules['1']['8f'], 0);
});

test('excess contributions are flagged for Form 5329 Part VII as a warning; employer contributions without HDHP coverage are added to income', () => {
  const out = run('2026', 'single', [w2(50000)], { hsaCoverage: 'self-only', hsaOwnContributions: 5000 });
  assert.equal(form8889(out)['13'], 4400);
  const excess = out.data.checks.find((item) => item.code === 'HSA_EXCESS_CONTRIBUTION');
  assert.equal(excess.level, 'warning');
  assert.match(excess.message, /contributions of 600 above the deductible amount/);
  assert.match(excess.message, /Form 5329 Part VII/);
  assert.deepEqual(out.data.unsupported, [{ form: '5329', reason: out.data.unsupported[0].reason, code: 'HSA_EXCESS_CONTRIBUTION', required: false }]);
  const noHdhp = run('2025', 'single', [w2(50000, { box12: [{ code: 'W', amount: 1000 }] })], { hsaCoverage: 'none' });
  assert.equal(form8889(noHdhp)['13'], 0);
  assert.equal(noHdhp.data.schedules['1']['8z'], 1000);
  assert.ok(codes(noHdhp).includes('HSA_EXCESS_CONTRIBUTION'));
});

test('contributions without the coverage answer are an error and give no deduction; an older hsaDeduction answer is read as the own contributions', () => {
  const missing = run('2025', 'single', [w2(50000)], { hsaOwnContributions: 2000 });
  assert.equal(missing.data.checks.find((item) => item.code === 'HSA_COVERAGE_NEEDED').level, 'error');
  assert.equal(missing.data.schedules['1']['13'], 0);
  const legacy = run('2025', 'single', [w2(50000)], { hsaDeduction: 2000, hsaCoverage: 'self-only' });
  assert.equal(legacy.data.schedules['1']['13'], 2000);
  const dependent = run('2025', 'single', [w2(20000)], { hsaCoverage: 'self-only', hsaOwnContributions: 1000 }, { taxpayer: { ...person('Kim'), canBeClaimedAsDependent: true } });
  assert.equal(dependent.data.schedules['1']['13'], 0);
  assert.ok(codes(dependent).includes('HSA_DEPENDENT_NO_DEDUCTION'));
});

test('each account holder gets a separate Form 8889: a spouse distribution on a joint return is the spouse\'s Part II', () => {
  const out = run('2025', 'mfj', [w2(80000), sa(2000, {}, 'spouse')], { hsaCoverage: 'self-only', hsaOwnContributions: 1000, spouseHsaQualifiedExpenses: 2000 });
  assert.deepEqual(out.data.schedules['8889'].map((item) => item.owner), ['taxpayer', 'spouse']);
  assert.equal(form8889(out, 'taxpayer')['14a'], 0);
  assert.deepEqual([form8889(out, 'spouse')['14a'], form8889(out, 'spouse')['16'], form8889(out, 'spouse')['13']], [2000, 0, 0]);
  assert.equal(out.data.schedules['1']['13'], 1000);
  const archer = run('2025', 'single', [w2(50000), sa(800, { accountType: 'ARCHER' })]);
  assert.ok(codes(archer).includes('FORM_8853_NOT_COVERED'));
  assert.equal(archer.data.schedules['8889'], undefined);
});

test('1099-SA and 5498-SA are validated, and the interview asks for coverage, months and medical expenses only when they apply', async () => {
  const state = createState();
  state.company = { name: 'Lee household', country: 'US', entityType: 'household' };
  assert.equal(setUsTaxpayer(state, { taxYear: '2026', filingStatus: 'single', taxpayer: { ...person('Kim'), ssn: '400-12-3456' }, address: { line1: '1 Main St', city: 'Denver', state: 'CO', zip: '80202' } }).ok, true);
  assert.equal(planUsTaxForm(state, { taxYear: '2026', kind: '1099-SA', payer: 'HSA Bank', fields: { grossDistribution: 100, distributionCode: '7' } }).error, 'US_TAX_FORM_INVALID');
  assert.equal(planUsTaxForm(state, { taxYear: '2026', kind: '1099-SA', payer: 'HSA Bank', fields: { grossDistribution: 100, accountType: 'Pension' } }).error, 'US_TAX_FORM_INVALID');
  assert.equal(planUsTaxForm(state, { taxYear: '2026', kind: '1099-SA', payer: 'HSA Bank', fields: { grossDistribution: 100, earningsOnExcess: 150, distributionCode: '2' } }).error, 'US_TAX_FORM_INVALID');
  assert.equal(planUsTaxForm(state, { taxYear: '2026', kind: '1099-SA', payer: 'HSA Bank', fields: { grossDistribution: 100, accountType: 'Archer MSA' } }).form.fields.accountType, 'ARCHER');
  assert.equal(planUsInterviewAnswer(state, { taxYear: '2026', id: 'hsaMonths', answer: 13 }).error, 'US_ANSWER_INVALID');
  assert.equal(planUsInterviewAnswer(state, { taxYear: '2026', id: 'hsaMonths', answer: 6.5 }).error, 'US_ANSWER_INVALID');
  assert.equal(planUsInterviewAnswer(state, { taxYear: '2026', id: 'hsaCoverage', answer: 'both' }).error, 'US_ANSWER_INVALID');
  const ids = () => usInterview(state, { taxYear: '2026' }).data.questions.map((item) => item.id);
  assert.ok(ids().includes('hsaCoverage'));
  assert.ok(!ids().includes('hsaMonths'));
  assert.ok(!ids().includes('hsaQualifiedExpenses'));
  assert.ok(!ids().includes('hsaDeduction'));
  assert.match(usInterview(state, { taxYear: '2026' }).data.questions.find((item) => item.id === 'hsaCoverage').help, /bronze or catastrophic/);
  answerUsInterview(state, { taxYear: '2026', id: 'hsaCoverage', answer: 'self-only' });
  assert.ok(ids().includes('hsaMonths'));
  assert.ok(ids().includes('hsaOwnContributions'));
  assert.ok(!ids().includes('hsaEligibleDecember'));
  answerUsInterview(state, { taxYear: '2026', id: 'hsaMonths', answer: 4 });
  assert.ok(ids().includes('hsaEligibleDecember'));
  assert.equal(addUsTaxForm(state, { taxYear: '2026', kind: 'W-2', payer: 'Acme Inc', payerTin: '12-3456789', fields: { wages: 50000, federalWithheld: 4000 } }).ok, true);
  assert.equal(addUsTaxForm(state, { taxYear: '2026', kind: '1099-SA', payer: 'HSA Bank', fields: { grossDistribution: 900, distributionCode: '1' } }).ok, true);
  assert.ok(ids().includes('hsaQualifiedExpenses'));
  assert.ok(ids().includes('hsaDisabled'));
  answerUsInterview(state, { taxYear: '2026', id: 'hsaQualifiedExpenses', answer: 400 });
  const review = usReturnReview(state, { taxYear: '2026' }).data;
  assert.ok(review.schedules.includes('8889'));
  assert.deepEqual(review.lines.filter((row) => row.form === 'Schedule 1' && row.line === '8f').map((row) => row.amount), [500]);
  assert.deepEqual(review.lines.filter((row) => row.form === 'Schedule 2' && row.line === '13c').map((row) => row.amount), [100]);
  assert.equal(review.checks.find((item) => item.code === 'HSA_TESTING_PERIOD'), undefined);
});
