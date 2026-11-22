import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };
const kids = [
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2019-02-02', months: 12 },
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2021-05-05', months: 12 },
];

test('Nebraska resident single: $8,600 standard deduction, the 2025 rate schedule and the $171 personal exemption credit', async () => {
  const state = await household({ state: 'NE', forms: [w2(50000, { state: 'NE', stateWithheld: 1500 })], answers: {} });
  await residency(state, '2025', [{ state: 'NE', residency: 'full-year', answers: { highSchoolDistrictCode: '28-0001', useTax: 0 } }]);
  const ne = await stateReturn(state, '2025', 'NE');
  assert.equal(ne.form, '1040N');
  assert.equal(ne.lines['3'], 1);
  assert.equal(ne.lines['5'], 50000);
  assert.equal(ne.lines['6'], 8600);
  assert.equal(ne.lines['14'], 41400);
  assert.equal(ne.lines['15'], 1675);
  assert.equal(ne.lines['18'], 171);
  assert.equal(ne.lines['35'], 1504);
  assert.equal(ne.owed, 4);
  assert.ok(!ne.checks.some((item) => item.code === 'NE_SCHOOL_DISTRICT_CODE' || item.code === 'NE_USE_TAX'));
});

test('Nebraska joint return with two children and low income: Form 2441N refundable child care credit and the 10% earned income credit', async () => {
  const state = await household({
    state: 'NE', filingStatus: 'mfj', spouse, dependents: kids,
    forms: [w2(18000, { state: 'NE', stateWithheld: 200 }), w2(8000, { state: 'NE', owner: 'spouse' }), { kind: '2441-PROVIDER', payer: 'Little Steps', fields: { amountPaid: 4000, qualifyingPerson: 'Leo' } }],
  });
  await residency(state, '2025', [{ state: 'NE', residency: 'full-year' }]);
  const ne = await stateReturn(state, '2025', 'NE');
  assert.equal(ne.lines['4'], 4);
  assert.equal(ne.lines['6'], 17200);
  assert.equal(ne.lines['14'], 8800);
  assert.equal(ne.lines['15'], 224);
  assert.equal(ne.lines['18'], 684);
  assert.equal(ne.lines['35'], 0);
  const care = ne.schedules['2441N'];
  assert.equal(care['6'], 4000);
  assert.equal(care['8'], 0.29);
  assert.equal(care['9'], 0.6);
  assert.equal(care['10'], 1160);
  assert.equal(care['11'], 696);
  assert.equal(ne.lines['42'], 696);
  assert.equal(ne.lines['44'], 715);
  assert.equal(ne.lines['23'], 0);
  assert.equal(ne.refund, 1611);
  assert.equal(ne.provisional, false);
});

test('Nebraska joint seniors: the additional $1,650 standard deduction for each spouse 65 or older and Social Security left out', async () => {
  const state = await household({
    state: 'NE', filingStatus: 'mfj', dateOfBirth: '1956-01-10', spouse: { ...spouse, dateOfBirth: '1955-06-01' },
    forms: [{ kind: '1099-R', fields: { grossDistribution: 9000, taxableAmount: 9000 } }, { kind: 'SSA-1099', fields: { netBenefits: 4000 } }],
  });
  await residency(state, '2025', [{ state: 'NE', residency: 'full-year' }]);
  const ne = await stateReturn(state, '2025', 'NE');
  assert.equal(ne.lines['5'], 9000);
  assert.equal(ne.lines['6'], 20500);
  assert.equal(ne.lines['14'], 0);
  assert.equal(ne.totalTax, 0);
});

test('Nebraska part-year resident: Schedule III ratio to five decimals applied after the exemption credit', async () => {
  const state = await household({ state: 'NE', forms: [w2(30000, { state: 'NE' }), w2(30000, { state: 'IA' })] });
  await residency(state, '2025', [
    { state: 'NE', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', income: { wages: 30000 } },
    { state: 'IA', residency: 'part-year', from: '2025-01-01', to: '2025-06-30', income: { wages: 30000 } },
  ]);
  const ne = await stateReturn(state, '2025', 'NE');
  assert.equal(ne.form, '1040N with Schedule III');
  assert.equal(ne.lines['3'], 2);
  const s3 = ne.schedules.III;
  assert.equal(s3['3'], 30000);
  assert.equal(s3['4'], 0.5);
  assert.equal(s3['5'], 51400);
  assert.equal(s3['6'], 2195);
  assert.equal(s3['7'], 171);
  assert.equal(s3['8'], 2024);
  assert.equal(s3['9'], 1012);
  assert.equal(ne.lines['15'], 1012);
  assert.equal(ne.lines['18'], 0);
  assert.equal(ne.owed, 1012);
});

test('Nebraska nonresident: Schedule III with Nebraska wages over federal AGI', async () => {
  const state = await household({ state: 'IA', forms: [w2(40000, { state: 'NE', stateWithheld: 1200 }), w2(20000, { state: 'IA' })] });
  await residency(state, '2025', [{ state: 'IA', residency: 'full-year' }, { state: 'NE', residency: 'nonresident', income: { wages: 40000 } }]);
  const ne = await stateReturn(state, '2025', 'NE');
  assert.equal(ne.lines['3'], 3);
  assert.equal(ne.schedules.III['4'], 0.66667);
  assert.equal(ne.schedules.III['9'], 1349);
  assert.equal(ne.lines['35'], 1349);
  assert.equal(ne.owed, 149);
  assert.ok(!ne.checks.some((item) => item.code === 'NE_SCHOOL_DISTRICT_CODE'));
});

test('Nebraska high-income joint resident: U.S. interest on Schedule I line 15, the 5.20% top rate and Schedule II for Iowa tax', async () => {
  const state = await household({
    state: 'NE', filingStatus: 'mfj', spouse,
    forms: [w2(250000, { state: 'NE', stateWithheld: 10000 }), w2(150000, { state: 'IA', owner: 'spouse', stateWithheld: 5000 }), { kind: '1099-INT', fields: { interest: 3000, treasuryInterest: 1000 } }],
  });
  await residency(state, '2025', [{ state: 'NE', residency: 'full-year' }, { state: 'IA', residency: 'nonresident', income: { wages: 150000 } }]);
  const ne = await stateReturn(state, '2025', 'NE');
  assert.equal(ne.lines['5'], 404000);
  assert.equal(ne.schedules.I['15'], 1000);
  assert.equal(ne.lines['13'], 1000);
  assert.equal(ne.lines['14'], 385800);
  assert.equal(ne.lines['15'], 19106);
  const credit = ne.schedules.II[0];
  assert.equal(credit.state, 'IA');
  assert.equal(credit.lines['2'], 150000);
  assert.equal(credit.lines['3'], 0.37221);
  assert.equal(credit.lines['4'], 7111);
  assert.equal(credit.lines['6'], credit.lines['5']);
  assert.equal(ne.lines['19'], credit.lines['6']);
  assert.equal(ne.lines['35'], 19106 - 342 - credit.lines['6']);
});

test('Nebraska 2026: the published schedule with the third and fourth brackets both at 4.55%, an $8,850 standard deduction and a $176 credit', async () => {
  const state = await household({ taxYear: '2026', state: 'NE', forms: [w2(50000, { state: 'NE', stateWithheld: 1500 })] });
  await residency(state, '2026', [{ state: 'NE', residency: 'full-year' }]);
  const ne = await stateReturn(state, '2026', 'NE');
  assert.equal(ne.lines['6'], 8850);
  assert.equal(ne.lines['14'], 41150);
  assert.equal(ne.lines['15'], 1571);
  assert.equal(ne.lines['18'], 176);
  assert.equal(ne.lines['35'], 1395);
  assert.equal(ne.refund, 105);
  assert.equal(ne.provisional, false);
});
