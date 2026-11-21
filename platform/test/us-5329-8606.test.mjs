import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040, US_FORMS_SUPPORTED, US_FORMS_COMING } from '../src/us-1040.mjs';
import { computeForm5329 } from '../src/us-form-5329.mjs';
import { computeForm8606, proRataRatio } from '../src/us-form-8606.mjs';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { importUsPriorYear } from '../src/us-prior-year.mjs';
import { planUsTaxForm, usInterview } from '../src/us-return.mjs';

const adult = { firstName: 'Maya', lastName: 'Shah', dateOfBirth: '1985-06-01' };
const spouse = { firstName: 'Ravi', lastName: 'Shah', dateOfBirth: '1984-03-03' };
const w2 = (wages) => ({ kind: 'W-2', owner: 'taxpayer', payer: 'Acme Inc', fields: { wages, socialSecurityWages: wages, socialSecurityTax: Math.round(wages * 6.2) / 100, medicareWages: wages, medicareTax: Math.round(wages * 1.45) / 100 } });
const r = (fields, owner = 'taxpayer') => ({ kind: '1099-R', owner, payer: 'Vanguard', fields });
const ira = (gross, code, extra = {}) => r({ grossDistribution: gross, taxableAmount: gross, iraSepSimple: true, distributionCode: code, ...extra });
const run = (forms, answers = {}, year = '2025', status = 'single') => {
  const out = computeForm1040({ filingStatus: status, taxpayer: adult, ...(status === 'mfj' ? { spouse } : {}), forms: [w2(60000), ...forms], answers }, year);
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.data;
};
const form5329 = (data, owner = 'taxpayer') => data.form5329.find((item) => item.owner === owner);
const codes = (data) => data.checks.map((item) => item.code);
const required = (data) => data.unsupported.filter((item) => item.required !== false).map((item) => item.form);

test('Form 5329 and 8606 are supported, no longer coming', () => {
  assert.ok(US_FORMS_SUPPORTED.includes('5329'));
  assert.ok(US_FORMS_SUPPORTED.includes('8606'));
  assert.ok(!US_FORMS_COMING.includes('5329'));
});

for (const year of ['2025', '2026']) {
  test(`${year} Part I: code 1 early IRA distribution of 10,000 with no exception: line 3 10,000, line 4 10% = 1,000 to Schedule 2 line 8 (line 5 from 2026), Form 5329 not required`, () => {
    const data = run([ira(10000, '1')], {}, year);
    const f = form5329(data);
    assert.deepEqual([f.lines['1'], f.lines['2'], f.lines['3'], f.lines['4']], [10000, 0, 10000, 1000]);
    assert.equal(f.fileRequired, false);
    assert.equal(data.schedules['5329'], undefined, 'the tax goes straight to Schedule 2 line 8 without Form 5329');
    assert.equal(data.schedules['2'][year === '2025' ? '8' : '5'], 1000);
    assert.equal(data.lines['23'], 1000);
    assert.ok(codes(data).includes('EARLY_DISTRIBUTION'));
    assert.deepEqual(required(data), []);
  });

  test(`${year} Part I: exception 08 (higher education) covering 12,000 of a 20,000 code 1 distribution: line 2 12,000, line 3 8,000, tax 800, exception number 08`, () => {
    const data = run([ira(20000, '1', { exceptionCode: '08', exceptionAmount: 12000 })], {}, year);
    const f = form5329(data);
    assert.deepEqual([f.lines['1'], f.lines['2'], f.lines['3'], f.lines['4']], [20000, 12000, 8000, 800]);
    assert.equal(f.exceptionNumber, '08');
    assert.equal(f.fileRequired, true);
    assert.deepEqual(data.schedules['5329'].map((item) => item.owner), ['taxpayer']);
    assert.equal(data.schedules['2'][year === '2025' ? '8' : '5'], 800);
  });

  test(`${year} Part I: exception with no amount covers the whole taxable distribution, so no additional tax`, () => {
    const data = run([ira(15000, '1', { exceptionCode: '03' })], {}, year);
    assert.deepEqual([form5329(data).lines['2'], form5329(data).lines['4']], [15000, 0]);
    assert.equal(data.schedules['2'], undefined);
  });

  test(`${year} Part I: SIMPLE IRA code S within two years is taxed 25%; with a code 1 distribution of 4,000: 10% x 4,000 + 25% x 8,000 = 2,400`, () => {
    const alone = run([ira(8000, 'S')], {}, year);
    assert.equal(form5329(alone).lines['4'], 2000);
    assert.equal(form5329(alone).fileRequired, true);
    const both = run([ira(8000, 'S'), ira(4000, '1')], {}, year);
    assert.deepEqual([form5329(both).lines['1'], form5329(both).lines['3'], form5329(both).lines['4']], [12000, 12000, 2400]);
  });

  test(`${year} Part I: SECURE 2.0 caps: emergency 23 covers 1,000 of 3,000 (tax 200), birth or adoption 19 covers 5,000 of 6,000 (tax 100)`, () => {
    const emergency = run([ira(3000, '1', { exceptionCode: '23' })], {}, year);
    assert.deepEqual([form5329(emergency).lines['2'], form5329(emergency).lines['4']], [1000, 200]);
    assert.ok(codes(emergency).includes('EARLY_DISTRIBUTION_EXCEPTION_CAPPED'));
    assert.ok(codes(emergency).includes('EMERGENCY_DISTRIBUTION_REPEAT'));
    const birth = run([ira(6000, '1', { exceptionCode: '19' })], {}, year);
    assert.deepEqual([form5329(birth).lines['2'], form5329(birth).lines['4']], [5000, 100]);
  });

  test(`${year} Part I: terminal illness 20 has no dollar cap`, () => {
    const data = run([ira(40000, '1', { exceptionCode: '20' })], {}, year);
    assert.deepEqual([form5329(data).lines['2'], form5329(data).lines['4']], [40000, 0]);
  });
}

test('domestic abuse exception 22 is capped at 10,300 in 2025 (12,000 - 10,300 = 1,700, tax 170) and 10,500 in 2026 (1,500, tax 150)', () => {
  const y2025 = run([ira(12000, '1', { exceptionCode: '22' })], {}, '2025');
  assert.deepEqual([form5329(y2025).lines['2'], form5329(y2025).lines['4']], [10300, 170]);
  assert.ok(codes(y2025).includes('DOMESTIC_ABUSE_ACCOUNT_LIMIT'));
  const y2026 = run([ira(12000, '1', { exceptionCode: '22' })], {}, '2026');
  assert.deepEqual([form5329(y2026).lines['2'], form5329(y2026).lines['4']], [10500, 150]);
});

test('exception 24 (long-term care) is new for 2026 and capped at 2,600; in 2025 it is not a valid number', () => {
  const y2026 = run([r({ grossDistribution: 3000, taxableAmount: 3000, distributionCode: '1', exceptionCode: '24' })], {}, '2026');
  assert.deepEqual([form5329(y2026).lines['2'], form5329(y2026).lines['4']], [2600, 40]);
  const y2025 = run([r({ grossDistribution: 3000, taxableAmount: 3000, distributionCode: '1', exceptionCode: '24' })], {}, '2025');
  assert.equal(form5329(y2025).lines['4'], 300);
  assert.ok(y2025.checks.some((item) => item.code === 'EARLY_DISTRIBUTION_EXCEPTION_INVALID' && item.level === 'error'));
});

test('exception 01 (separation from service at 55) does not apply to an IRA; exception 09 (first home) only to an IRA', () => {
  const iraSeparation = run([ira(10000, '1', { exceptionCode: '01' })]);
  assert.equal(form5329(iraSeparation).lines['4'], 1000);
  assert.ok(codes(iraSeparation).includes('EARLY_DISTRIBUTION_EXCEPTION_INVALID'));
  const plan = run([r({ grossDistribution: 10000, taxableAmount: 10000, distributionCode: '1', exceptionCode: '01' })]);
  assert.equal(form5329(plan).lines['4'], 0);
  const planHome = run([r({ grossDistribution: 10000, taxableAmount: 10000, distributionCode: '1', exceptionCode: '09' })]);
  assert.equal(form5329(planHome).lines['4'], 1000);
  const iraHome = run([ira(12000, '1', { exceptionCode: '09' })]);
  assert.deepEqual([form5329(iraHome).lines['2'], form5329(iraHome).lines['4']], [10000, 200]);
});

test('medical exception 05 covers only medical expenses above 7.5% of AGI: AGI 60,000 + 10,000 = 70,000, floor 5,250, expenses 9,000 leave 3,750; tax 10% x 6,250 = 625', () => {
  const data = run([ira(10000, '1', { exceptionCode: '05' })], { medicalExpenses: 9000 });
  assert.equal(data.lines['11b'], 70000);
  assert.deepEqual([form5329(data).lines['2'], form5329(data).lines['3'], form5329(data).lines['4']], [3750, 6250, 625]);
});

test('two different exceptions give exception number 99; the old yes answer with no number is an error to fix on the 1099-R', () => {
  const data = run([ira(5000, '1', { exceptionCode: '08' }), ira(5000, '1', { exceptionCode: '03' })]);
  assert.equal(form5329(data).exceptionNumber, '99');
  assert.equal(form5329(data).lines['4'], 0);
  const legacy = run([ira(5000, '1')], { earlyDistributionException: true });
  assert.ok(legacy.checks.some((item) => item.code === 'EARLY_DISTRIBUTION_EXCEPTION_CODE' && item.level === 'error'));
});

test('a qualified disaster recovery distribution is left out of Form 5329 line 1 up to 22,000, and Form 8915-F is flagged as not prepared', () => {
  const data = run([ira(25000, '1', { qualifiedDisasterDistribution: true })]);
  assert.deepEqual([form5329(data).lines['1'], form5329(data).lines['4']], [3000, 300]);
  assert.equal(data.lines['4b'], 25000);
  assert.ok(data.unsupported.some((item) => item.form === '8915-F' && item.required === false));
});

test('joint return: the spouse\'s early distribution is on the spouse\'s own Form 5329', () => {
  const data = run([ira(4000, '1'), ira(6000, '1', {}), r({ grossDistribution: 2000, taxableAmount: 2000, iraSepSimple: true, distributionCode: '1' }, 'spouse')], {}, '2025', 'mfj');
  assert.equal(form5329(data).lines['4'], 1000);
  assert.equal(form5329(data, 'spouse').lines['4'], 200);
  assert.equal(data.schedules['2']['8'], 1200);
});

test('Part III: traditional IRA excess of 1,000 for the year, account worth 50,000: 6% = 60; carried forward as line 16', () => {
  const data = run([], { iraExcessContributions: true, iraExcessCurrent: 1000, iraYearEndValue: 50000 });
  const f = form5329(data);
  assert.deepEqual([f.lines['15'], f.lines['16'], f.lines['17']], [1000, 1000, 60]);
  assert.equal(f.fileRequired, true);
  assert.equal(data.schedules['2']['8'], 60);
  assert.equal(data.retirementCarryforward.iraExcess, 1000);
});

test('Part III: prior excess 2,000 less room 500 and 300 withdrawn leaves 1,200: tax 72', () => {
  const f = form5329(run([], { iraExcessContributions: true, iraExcessPrior: 2000, iraExcessApplied: 500, iraExcessWithdrawn: 300, iraYearEndValue: 40000 }, '2026'));
  assert.deepEqual([f.lines['9'], f.lines['13'], f.lines['14'], f.lines['16'], f.lines['17']], [2000, 800, 1200, 1200, 72]);
});

test('Part IV: Roth IRA excess 3,000 with the Roth worth only 1,500 on December 31: 6% of the smaller = 90', () => {
  const f = form5329(run([], { iraExcessContributions: true, rothExcessCurrent: 3000, rothYearEndValue: 1500 }));
  assert.deepEqual([f.lines['23'], f.lines['24'], f.lines['25']], [3000, 3000, 90]);
});

test('Parts III and IV without a year-end value tax the whole excess and warn; other account excess is not covered', () => {
  const data = run([], { iraExcessContributions: true, rothExcessCurrent: 1000, otherAccountExcess: true });
  assert.equal(form5329(data).lines['25'], 60);
  assert.ok(codes(data).includes('IRA_VALUE_FOR_EXCESS'));
  assert.deepEqual(required(data), ['5329']);
});

for (const year of ['2025', '2026']) {
  test(`${year} Part IX: RMD 20,000, distributed 12,000: shortfall 8,000 x 25% = 2,000 (line 54b); corrected in the window 10% = 800 (line 54a); waiver of 3,000 leaves 5,000 x 25% = 1,250`, () => {
    const base = { rmdShortfall: true, rmdRequired: 20000, rmdDistributed: 12000 };
    const f = form5329(run([], base, year));
    assert.deepEqual([f.lines['52b'], f.lines['53b'], f.lines['54b'], f.lines['55']], [20000, 12000, 2000, 2000]);
    const corrected = form5329(run([], { ...base, rmdCorrected: true }, year));
    assert.deepEqual([corrected.lines['52a'], corrected.lines['54a'], corrected.lines['54b'], corrected.lines['55']], [20000, 800, 0, 800]);
    const waived = run([], { ...base, rmdWaiverAmount: 3000 }, year);
    assert.equal(form5329(waived).lines['55'], 1250);
    assert.ok(codes(waived).includes('RMD_WAIVER_REQUESTED'));
    assert.equal(waived.schedules['2'][year === '2025' ? '8' : '18'], 1250);
  });
}

for (const year of ['2025', '2026']) {
  test(`${year} backdoor Roth: 7,000 nondeductible, converted in full, no other IRA: ratio 1.000, line 11 7,000, line 18 0, nothing taxable, basis 0 left`, () => {
    const data = run([r({ grossDistribution: 7000, iraSepSimple: true, taxableNotDetermined: true, distributionCode: '2' })], { iraNondeductibleContributions: 7000, priorIraBasis: 0, rothConversionAmount: 7000, iraYearEndValue: 0 }, year);
    const f = data.schedules['8606'][0];
    assert.deepEqual([f.lines['3'], f.lines['5'], f.lines['6'], f.lines['7'], f.lines['8'], f.lines['9'], f.lines['10'], f.lines['11'], f.lines['14'], f.lines['16'], f.lines['17'], f.lines['18']], [7000, 7000, 0, 0, 7000, 7000, 1, 7000, 0, 7000, 7000, 0]);
    assert.equal(data.lines['4a'], 7000);
    assert.equal(data.lines['4b'], 0);
    assert.deepEqual(data.form5329, []);
    assert.equal(data.retirementCarryforward.iraBasis, 0);
  });
}

test('pro-rata rule: 7,000 nondeductible converted with 63,000 of pre-tax IRAs at year end: 7,000 / 70,000 = 0.100, 700 tax-free, 6,300 taxable, basis 6,300 carried', () => {
  const data = run([r({ grossDistribution: 7000, iraSepSimple: true, taxableNotDetermined: true, distributionCode: '2' })], { iraNondeductibleContributions: 7000, rothConversionAmount: 7000, iraYearEndValue: 63000 });
  const f = data.schedules['8606'][0];
  assert.deepEqual([f.lines['9'], f.lines['10'], f.lines['11'], f.lines['13'], f.lines['14'], f.lines['18']], [70000, 0.1, 700, 700, 6300, 6300]);
  assert.equal(data.lines['4b'], 6300);
  assert.equal(f.basisCarryforward, 6300);
});

test('pro-rata on a distribution: basis 5,000, 3,000 taken, 9,000 left: 5,000 / 12,000 = 0.417, line 12 1,251, line 15c 1,749, basis 3,749', () => {
  const data = run([r({ grossDistribution: 3000, iraSepSimple: true, taxableNotDetermined: true, distributionCode: '7' })], { priorIraBasis: 5000, iraYearEndValue: 9000 });
  const f = data.schedules['8606'][0];
  assert.deepEqual([f.lines['10'], f.lines['12'], f.lines['15c'], f.lines['14']], [0.417, 1251, 1749, 3749]);
  assert.equal(data.lines['4b'], 1749);
});

test('an early traditional IRA distribution with basis: only the taxable part (8,000 of 10,000) is on Form 5329 line 1', () => {
  const data = run([r({ grossDistribution: 10000, iraSepSimple: true, taxableNotDetermined: true, distributionCode: '1' })], { priorIraBasis: 9000, iraYearEndValue: 35000 });
  assert.equal(data.schedules['8606'][0].lines['10'], 0.2);
  assert.equal(data.lines['4b'], 8000);
  assert.deepEqual([form5329(data).lines['1'], form5329(data).lines['4']], [8000, 800]);
});

test('Form 5498 box 5 values feed line 6 when the interview value is empty, and the basis without any distribution goes straight to line 14', () => {
  const data = run([r({ grossDistribution: 7000, iraSepSimple: true, distributionCode: '2' }), { kind: '5498', owner: 'taxpayer', payer: 'Vanguard', fields: { accountType: 'traditional', fairMarketValue: 63000 } }], { iraNondeductibleContributions: 7000, rothConversionAmount: 7000 });
  assert.equal(data.schedules['8606'][0].lines['6'], 63000);
  assert.equal(data.lines['4b'], 6300);
  const quiet = run([], { iraNondeductibleContributions: 7000, priorIraBasis: 3000 });
  assert.deepEqual(quiet.schedules['8606'][0].lines, { 1: 7000, 2: 3000, 3: 10000, 14: 10000 });
  assert.equal(quiet.retirementCarryforward.iraBasis, 10000);
});

test('Roth IRA distribution under 59 1/2 (code J) of 5,000 from 12,000 of contributions: line 23 0, not taxable, no additional tax, 7,000 basis left', () => {
  const data = run([r({ grossDistribution: 5000, distributionCode: 'J' })], { rothContributionBasis: 12000 });
  const f = data.schedules['8606'][0];
  assert.deepEqual([f.lines['19'], f.lines['21'], f.lines['22'], f.lines['23']], [5000, 5000, 12000, 0]);
  assert.equal(data.lines['4a'], 5000);
  assert.equal(data.lines['4b'], 0);
  assert.equal(data.lines['5a'], 0);
  assert.deepEqual(data.form5329, []);
  assert.equal(data.retirementCarryforward.rothContributionBasis, 7000);
});

test('Roth ordering: 10,000 code J, 4,000 contributions then 3,000 conversions: 3,000 of earnings taxable with 10% (300); the conversion part is flagged for the five-year recapture', () => {
  const data = run([r({ grossDistribution: 10000, distributionCode: 'J' })], { rothContributionBasis: 4000, rothConversionBasis: 3000 });
  const f = data.schedules['8606'][0];
  assert.deepEqual([f.lines['23'], f.lines['24'], f.lines['25a'], f.lines['25c']], [6000, 3000, 3000, 3000]);
  assert.equal(data.lines['4b'], 3000);
  assert.deepEqual([form5329(data).lines['1'], form5329(data).lines['4']], [3000, 300]);
  assert.equal(form5329(data).fileRequired, true);
  assert.ok(data.unsupported.some((item) => item.code === 'ROTH_CONVERSION_RECAPTURE' && item.required === false));
});

test('Roth code J without the basis answer is all taxable and warns; code T is tax free once the five-year rule is met', () => {
  const noBasis = run([r({ grossDistribution: 2000, distributionCode: 'J' })]);
  assert.equal(noBasis.lines['4b'], 2000);
  assert.ok(codes(noBasis).includes('ROTH_BASIS_NEEDED'));
  const met = run([r({ grossDistribution: 9000, distributionCode: 'T' })], { rothFiveYearMet: true });
  assert.equal(met.lines['4b'], 0);
  assert.equal(met.schedules['8606'], undefined);
  const notMet = run([r({ grossDistribution: 9000, distributionCode: 'T' })], { rothFiveYearMet: false, rothContributionBasis: 6000 });
  assert.equal(notMet.lines['4b'], 3000);
  assert.deepEqual(notMet.form5329, []);
  const unanswered = run([r({ grossDistribution: 9000, distributionCode: 'T' })], { rothContributionBasis: 9000 });
  assert.ok(codes(unanswered).includes('ROTH_FIVE_YEAR_RULE'));
});

test('a spouse\'s Roth distribution keeps box 2a and is flagged as needing the spouse\'s own Form 8606', () => {
  const data = run([r({ grossDistribution: 4000, taxableAmount: 500, distributionCode: 'J' }, 'spouse')], {}, '2025', 'mfj');
  assert.equal(data.lines['4b'], 500);
  assert.ok(data.unsupported.some((item) => item.form === '8606' && item.required === false));
});

test('pure Form 5329 and Form 8606 functions', () => {
  assert.equal(proRataRatio(5000, 12000), 0.417);
  assert.equal(proRataRatio(9000, 7000), 1);
  assert.equal(computeForm5329({ early: [{ amount: 1000, exception: 0 }], rates: { earlyBasisPoints: 1000 } }).total, 100);
  assert.equal(computeForm8606({}).required, false);
});

test('1099-R form: exception number is padded and checked, codes and the percentage are validated, and yes or no answers typed as text are read', () => {
  const ok = planUsTaxForm(createState(), { taxYear: '2025', kind: '1099-R', payer: 'Fidelity', fields: { grossDistribution: 5000, distributionCode: 'j', exceptionCode: '8', percentOfTotal: '50%', iraSepSimple: 'no', taxableNotDetermined: 'yes', state: 'ny', stateWithheld: 100 } });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual([ok.form.fields.distributionCode, ok.form.fields.exceptionCode, ok.form.fields.percentOfTotal, ok.form.fields.iraSepSimple, ok.form.fields.taxableNotDetermined, ok.form.fields.state], ['J', '08', 50, false, true, 'NY']);
  const bad = planUsTaxForm(createState(), { taxYear: '2025', kind: '1099-R', payer: 'Fidelity', fields: { grossDistribution: 5000, distributionCode: 'X', exceptionCode: '25', percentOfTotal: 120 } });
  assert.equal(bad.ok, false);
  assert.equal(bad.problems.length, 3);
  const account = planUsTaxForm(createState(), { taxYear: '2025', kind: '5498', payer: 'Vanguard', fields: { accountType: 'Roth', fairMarketValue: 20000 } });
  assert.equal(account.form.fields.accountType, 'roth');
  assert.equal(planUsTaxForm(createState(), { taxYear: '2025', kind: '5498', payer: 'Vanguard', fields: { accountType: 'brokerage', fairMarketValue: 1 } }).ok, false);
});

async function startedReturn(year) {
  const state = createState();
  state.company = { name: 'Shah household', country: 'US', entityType: 'household' };
  const set = await runTool(state, 'set_us_taxpayer', { taxYear: year, filingStatus: 'single', taxpayer: { firstName: 'Maya', lastName: 'Shah', ssn: '400-12-3456', dateOfBirth: '1985-06-01' }, address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' } });
  assert.equal(set.ok, true, JSON.stringify(set));
  return state;
}

test('interview: the IRA questions appear for a traditional IRA 1099-R, the excess and RMD follow-ups only after a yes, and the old exception question is gone', async () => {
  const state = await startedReturn('2025');
  const ids = () => usInterview(state, { taxYear: '2025' }).data.questions.map((question) => question.id);
  assert.ok(!ids().includes('earlyDistributionException'));
  assert.ok(!ids().includes('priorIraBasis'));
  assert.ok(ids().includes('iraExcessContributions'));
  await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: '1099-R', payer: 'Vanguard', fields: { grossDistribution: 7000, iraSepSimple: true, distributionCode: '2' } });
  assert.ok(ids().includes('priorIraBasis'));
  assert.ok(ids().includes('rothConversionAmount'));
  assert.ok(ids().includes('rmdShortfall'));
  assert.ok(!ids().includes('rmdRequired'));
  await runTool(state, 'answer_us_interview', { taxYear: '2025', id: 'rmdShortfall', answer: 'yes' });
  await runTool(state, 'answer_us_interview', { taxYear: '2025', id: 'iraExcessContributions', answer: 'yes' });
  assert.ok(ids().includes('rmdRequired'));
  assert.ok(ids().includes('rothExcessCurrent'));
});

test('prior-year import carries the Form 8606 line 14 basis into next year\'s priorIraBasis, or takes it as a typed figure', async () => {
  const state = await startedReturn('2025');
  await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: 'W-2', payer: 'Acme', fields: { wages: 90000 } });
  await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: '1099-R', payer: 'Vanguard', fields: { grossDistribution: 7000, iraSepSimple: true, taxableNotDetermined: true, distributionCode: '2' } });
  for (const [id, answer] of [['iraNondeductibleContributions', 7000], ['rothConversionAmount', 7000], ['iraYearEndValue', 63000]]) await runTool(state, 'answer_us_interview', { taxYear: '2025', id, answer });
  const result = importUsPriorYear(state, { taxYear: '2026' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.answers.priorIraBasis, 6300);
  const typed = importUsPriorYear(createState(), { taxYear: '2026', figures: { iraBasis: 4200 } });
  assert.equal(typed.data.answers.priorIraBasis, 4200);
});
