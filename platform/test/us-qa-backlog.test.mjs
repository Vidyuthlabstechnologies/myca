import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040 } from '../src/us-1040.mjs';
import { addUsTaxForm, setUsTaxpayer, usInterview, answerUsInterview, engineInput, FORM_SPECS } from '../src/us-return.mjs';
import { createState } from '../src/store.mjs';

const w2 = (wages) => ({ kind: 'W-2', owner: 'taxpayer', payer: 'Acme Inc', fields: { wages, federalWithheld: 0, socialSecurityWages: wages, socialSecurityTax: Math.round(wages * 6.2) / 100, medicareWages: wages, medicareTax: Math.round(wages * 1.45) / 100 } });
const person = (firstName, dateOfBirth) => ({ firstName, lastName: 'Lee', dateOfBirth });
const tuition = (fields) => ({ kind: '1098-T', owner: 'taxpayer', payer: 'State University', fields: { tuitionPaid: 4000, atLeastHalfTime: true, ...fields } });
const mortgage = (fields) => ({ kind: '1098', owner: 'taxpayer', payer: 'Bank', fields: { mortgageInterest: 20000, outstandingPrincipal: 300000, ...fields } });
const run = (filingStatus, forms, { year = '2025', dob = '1985-03-10', answers = {} } = {}) => computeForm1040({ filingStatus, taxpayer: person('Jo', dob), ...(filingStatus === 'mfj' || filingStatus === 'mfs' ? { spouse: person('Kim', '1984-02-02') } : {}), forms, answers }, year);
const codes = (out) => out.data.checks.map((item) => item.code);
const address = { line1: '1 Main St', city: 'Denver', state: 'CO', zip: '80202' };

test('Form 8863 lines 23, 25 and 26 from the 1098-T: AOTC claimed 4 earlier years, first 4 years completed, or a felony drug conviction moves the student to the lifetime learning credit (20% of $5,000 = $1,000)', () => {
  for (const bar of [{ aotcClaimedFourYears: true }, { firstFourYearsCompleted: true }, { felonyDrugConviction: true }, { graduate: true }]) {
    const out = run('single', [w2(40000), tuition({ tuitionPaid: 5000, ...bar })]);
    const f = out.data.schedules['8863'];
    assert.equal(f['1'], 0, JSON.stringify(bar));
    assert.equal(f['8'], 0);
    assert.equal(f['10'], 5000);
    assert.equal(f['12'], 1000);
    assert.equal(out.data.schedules['3']['3'], 1000);
    assert.ok(codes(out).includes('AOTC_NOT_ALLOWED'));
  }
  const ok = run('single', [w2(40000), tuition({ tuitionPaid: 5000, graduate: true, firstFourYearsCompleted: false, aotcClaimedFourYears: false, felonyDrugConviction: false })]);
  assert.equal(ok.data.schedules['8863']['1'], 2500, '$2,000 + 25% of the next $2,000');
  assert.equal(ok.data.schedules['8863']['8'], 1000, '40% of $2,500');
  assert.equal(ok.data.lines['29'], 1000);
  assert.ok(!codes(ok).includes('AOTC_NOT_ALLOWED'));
});

test('Form 8863 line 7: a 21-year-old full-time student whose earned income was under half of support, with a living parent, not filing jointly, gets no refundable AOTC (line 9 = line 7 = $2,500)', () => {
  const yes = { aotcFullTimeStudent: true, aotcEarnedUnderHalfSupport: true, aotcParentAlive: true };
  const blocked = run('single', [w2(20000), tuition()], { dob: '2004-06-01', answers: yes });
  const f = blocked.data.schedules['8863'];
  assert.equal(f.line7Under24, true);
  assert.equal(f['7'], 2500);
  assert.equal(f['8'], 0);
  assert.equal(f['9'], 2500);
  assert.equal(blocked.data.lines['29'], 0);
  assert.equal(blocked.data.schedules['3']['3'], 428, 'tax on $20,000 - $15,750 = $4,250 is the $4,250 to $4,300 Tax Table row, 10% of $4,275, which limits the nonrefundable credit');
  const noParent = run('single', [w2(20000), tuition()], { dob: '2004-06-01', answers: { ...yes, aotcParentAlive: false } });
  assert.equal(noParent.data.schedules['8863']['8'], 1000);
  assert.equal(noParent.data.lines['29'], 1000);
  const partTime = run('single', [w2(20000), tuition()], { dob: '2004-06-01', answers: { ...yes, aotcFullTimeStudent: false } });
  assert.equal(partTime.data.lines['29'], 1000);
  const selfSupporting = run('single', [w2(20000), tuition()], { dob: '2004-06-01', answers: { ...yes, aotcEarnedUnderHalfSupport: false } });
  assert.equal(selfSupporting.data.lines['29'], 1000);
  const joint = run('mfj', [w2(20000), tuition()], { dob: '2004-06-01', answers: yes });
  assert.equal(joint.data.schedules['8863'].line7Under24, false);
  assert.equal(joint.data.lines['29'], 1000);
  const older = run('single', [w2(20000), tuition()], { dob: '2001-07-01', answers: yes });
  assert.equal(older.data.lines['29'], 1000, 'age 24 at the end of 2025');
  assert.ok(!codes(older).includes('AOTC_REFUNDABLE_QUESTIONS'));
});

test('Form 8863 line 7 ages: under 18 needs only a living parent, age 18 needs earned income under half of support but not full-time study; unanswered questions warn and keep the refundable 40%', () => {
  assert.equal(run('single', [w2(20000), tuition()], { year: '2026', dob: '2009-03-01', answers: { aotcParentAlive: true } }).data.lines['29'], 0);
  assert.equal(run('single', [w2(20000), tuition()], { dob: '2007-05-05', answers: { aotcEarnedUnderHalfSupport: true, aotcParentAlive: true } }).data.lines['29'], 0);
  assert.equal(run('single', [w2(20000), tuition()], { dob: '2007-05-05', answers: { aotcEarnedUnderHalfSupport: false, aotcParentAlive: true } }).data.lines['29'], 1000);
  const open = run('single', [w2(20000), tuition()], { dob: '2004-06-01' });
  assert.equal(open.data.lines['29'], 1000);
  assert.ok(codes(open).includes('AOTC_REFUNDABLE_QUESTIONS'));
});

test('Schedule A line 8d (2026, IRC 163(h)(3)(E)): 1098 box 5 premiums cut 10% for each $1,000 or part of it that AGI exceeds $100,000', () => {
  const at = (status, wages) => run(status, [w2(wages), mortgage({ mortgageInsurancePremiums: 2000 })], { year: '2026', answers: { itemize: 'yes' } }).data.schedules.A;
  const full = at('single', 90000);
  assert.equal(full['8a'], 20000);
  assert.equal(full['8d'], 2000);
  assert.equal(full['8e'], 22000);
  assert.equal(full['10'], 22000);
  assert.equal(at('single', 100000)['8d'], 2000);
  assert.equal(at('single', 101000)['8d'], 1800, 'one step of $1,000');
  assert.equal(at('single', 101001)['8d'], 1600, 'a fraction of $1,000 counts as a full step');
  assert.equal(at('single', 104500)['8d'], 1000, '$4,500 is 5 steps, 50%');
  assert.equal(at('mfj', 109999)['8d'], 0);
  assert.equal(at('single', 109000)['8d'], 200, '$9,000 over is 9 steps, 10% left');
  assert.equal(at('single', 109001)['8d'], 0, 'nothing is left above $109,000');
  assert.equal(at('mfs', 54500)['8d'], 200, 'separate: $4,500 over is 9 steps of $500');
  assert.equal(at('mfs', 54501)['8d'], 0, 'nothing is left above $54,500 on a separate return');
  assert.equal(at('mfs', 51200)['8d'], 1400, 'separate: $1,200 over $50,000 is 3 steps of $500, 30%');
});

test('Schedule A line 8d is reserved for 2025: box 5 premiums are not deducted and a warning says so; line 8b carries interest not on a 1098', () => {
  const out = run('single', [w2(90000), mortgage({ mortgageInsurancePremiums: 2000 })], { answers: { itemize: 'yes', otherMortgageInterest: 1500 } });
  const a = out.data.schedules.A;
  assert.equal(a['8d'], 0);
  assert.equal(a['8b'], 1500);
  assert.equal(a['10'], 21500);
  assert.ok(codes(out).includes('MORTGAGE_INSURANCE_NOT_DEDUCTIBLE'));
  assert.ok(FORM_SPECS['1098'].fields.some((item) => item.key === 'mortgageInsurancePremiums' && item.box === '5'));
});

test('interview asks the itemized, investment, Form 2555 and spouse questions the engine reads, each only when it matters, and the answers reach the engine with the right type', () => {
  const state = createState();
  assert.equal(setUsTaxpayer(state, { taxYear: '2025', filingStatus: 'mfs', taxpayer: person('Jo', '1960-03-10'), spouse: person('Kim', '1955-02-02'), address }).ok, true);
  const ids = () => usInterview(state, { taxYear: '2025' }).data.questions.map((item) => item.id);
  const first = ids();
  for (const id of ['stateEstimatedPayments', 'priorYearStateTaxPaid', 'useSalesTax', 'otherMortgageInterest', 'otherItemizedDeductions', 'spouseHasNoIncome']) assert.ok(first.includes(id), id);
  for (const id of ['generalSalesTax', 'otherNetInvestmentIncome', 'foreignEarnedIncomeExclusion', 'aotcParentAlive']) assert.ok(!first.includes(id), id);
  answerUsInterview(state, { taxYear: '2025', id: 'useSalesTax', answer: 'yes' });
  assert.ok(ids().includes('generalSalesTax'));
  answerUsInterview(state, { taxYear: '2025', id: 'itemize', answer: 'no' });
  assert.ok(!ids().includes('stateEstimatedPayments'));
  answerUsInterview(state, { taxYear: '2025', id: 'spouseItemizes', answer: 'yes' });
  assert.ok(ids().includes('stateEstimatedPayments'), 'a separate filer whose spouse itemizes must itemize');
  answerUsInterview(state, { taxYear: '2025', id: 'spouseItemizes', answer: 'no' });
  addUsTaxForm(state, { taxYear: '2025', kind: '1099-INT', payer: 'Bank', fields: { interest: 100 } });
  assert.ok(ids().includes('otherNetInvestmentIncome'));
  assert.equal(answerUsInterview(state, { taxYear: '2025', id: 'spouseHasNoIncome', answer: 'yes' }).data.answer, true);
  addUsTaxForm(state, { taxYear: '2025', kind: 'W-2', payer: 'Acme Inc', fields: { wages: 40000 } });
  const out = computeForm1040(engineInput(state, state.usReturns['2025']), '2025');
  assert.equal(out.data.lines['12'], 15750 + 2 * 1600, 'separate return: basic $15,750 plus $1,600 each for you and a 65+ spouse with no income');

  setUsTaxpayer(state, { taxYear: '2025', filingStatus: 'single', taxpayer: person('Jo', '2004-06-01'), address });
  assert.ok(!ids().includes('spouseHasNoIncome'));
  addUsTaxForm(state, { taxYear: '2025', kind: '1098-T', payer: 'State University', fields: { tuitionPaid: 4000, atLeastHalfTime: true, aotcClaimedFourYears: false } });
  for (const id of ['aotcFullTimeStudent', 'aotcEarnedUnderHalfSupport', 'aotcParentAlive']) assert.ok(ids().includes(id), id);
  setUsTaxpayer(state, { taxYear: '2025', filingStatus: 'single', taxpayer: person('Jo', '1990-06-01'), address });
  assert.ok(!ids().includes('aotcParentAlive'));
});

test('Schedule 8812: a Form 2555 filer gets no additional child tax credit; the yes/no question shows only with dependents', () => {
  const kid = { firstName: 'Max', lastName: 'Lee', relationship: 'son', dateOfBirth: '2016-04-04', months: 12 };
  const base = { filingStatus: 'single', taxpayer: person('Jo', '1985-03-10'), dependents: [kid], forms: [w2(10000)] };
  assert.ok(computeForm1040({ ...base, answers: {} }, '2025').data.lines['28'] > 0);
  assert.equal(computeForm1040({ ...base, answers: { foreignEarnedIncomeExclusion: true } }, '2025').data.lines['28'], 0);
  const state = createState();
  setUsTaxpayer(state, { taxYear: '2025', filingStatus: 'hoh', taxpayer: person('Jo', '1985-03-10'), dependents: [kid], address });
  assert.ok(usInterview(state, { taxYear: '2025' }).data.questions.some((item) => item.id === 'foreignEarnedIncomeExclusion' && item.kind === 'yesno'));
});
