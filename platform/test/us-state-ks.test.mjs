import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';
import { kansasTax } from '../src/countries/united-states/states/ks.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' };
const kids = [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2019-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2025-03-05', months: 10 }];
const rule = { brackets: { other: [{ overCents: 0, rateBp: 520 }, { overCents: 2300000, rateBp: 558 }], mfj: [{ overCents: 0, rateBp: 520 }, { overCents: 4600000, rateBp: 558 }] }, tableLimit: 100000, tableZeroThrough: 25, tableFirstRowTo: 50, tableRowWidth: 50, overTable: { rateBp: 558, subtract: { other: 87, mfj: 175 } } };

test('Kansas tax table: tax at the midpoint of each $50 row, then the computation schedule above $100,000', () => {
  assert.equal(kansasTax(25, rule, 'single'), 0);
  assert.equal(kansasTax(40, rule, 'single'), 2);
  assert.equal(kansasTax(100, rule, 'single'), 4);
  assert.equal(kansasTax(23020, rule, 'single'), 1197);
  assert.equal(kansasTax(47735, rule, 'single'), 2576);
  assert.equal(kansasTax(47735, rule, 'mfj'), 2488);
  assert.equal(kansasTax(100000, rule, 'single'), 5491);
  assert.equal(kansasTax(100001, rule, 'single'), 5493);
  assert.equal(kansasTax(150000, rule, 'mfj'), 8195);
});

test('Kansas resident single: U.S. interest subtracted on Schedule S, standard deduction and $9,160 exemption', async () => {
  const state = await household({ state: 'KS', forms: [w2(60000, { state: 'KS', stateWithheld: 2500 }), { kind: '1099-INT', fields: { interest: 500, treasuryInterest: 300 } }] });
  await residency(state, '2025', [{ state: 'KS', residency: 'full-year' }]);
  const ks = await stateReturn(state, '2025', 'KS');
  assert.equal(ks.form, 'K-40');
  assert.equal(ks.lines['1'], 60800);
  assert.equal(ks.schedules['Schedule S Part A'].A12, 300);
  assert.equal(ks.lines['2'], -300);
  assert.equal(ks.lines['3'], 60500);
  assert.equal(ks.lines['4'], 3605);
  assert.equal(ks.lines['5'], 9160);
  assert.equal(ks.lines['7'], 47735);
  assert.equal(ks.lines['8'], 2576);
  assert.equal(ks.lines['12'], 2576);
  assert.equal(ks.lines['18'], 2576);
  assert.equal(ks.totalTax, 2576);
  assert.equal(ks.owed, 76);
  assert.equal(ks.due, '2026-04-15');
  assert.equal(ks.provisional, false);
});

test('Kansas resident joint with children: newborn exemption, 50% child care credit and refundable 17% earned income credit', async () => {
  const state = await household({ state: 'KS', filingStatus: 'mfj', spouse, dependents: kids, forms: [w2(30000, { state: 'KS', stateWithheld: 600 }), w2(15000, { state: 'KS', stateWithheld: 300, owner: 'spouse' }), { kind: '2441-PROVIDER', owner: 'taxpayer', payer: 'Little Steps', fields: { amountPaid: 6000, qualifyingPerson: 'Leo' } }] });
  await residency(state, '2025', [{ state: 'KS', residency: 'full-year' }]);
  const ks = await stateReturn(state, '2025', 'KS');
  assert.equal(ks.lines['4'], 8240);
  assert.equal(ks.schedules['K-40.exemptions'].dependents, 2);
  assert.equal(ks.schedules['K-40.exemptions'].newborns, 1);
  assert.equal(ks.lines['5'], 25280);
  assert.equal(ks.lines['7'], 11480);
  assert.equal(ks.lines['8'], 597);
  assert.equal(ks.lines['14'], 600);
  assert.equal(ks.lines['16'], 0);
  assert.equal(ks.schedules['EITC worksheet']['1'], 4087);
  assert.equal(ks.schedules['EITC worksheet']['2'], 695);
  assert.equal(ks.lines['17'], 0);
  assert.equal(ks.lines['22'], 695);
  assert.equal(ks.totalTax, 0);
  assert.equal(ks.refund, 1595);
});

test('Kansas part-year resident: Schedule S Part B percentage of Kansas-source income times the full-year tax', async () => {
  const state = await household({ state: 'KS', forms: [w2(30000, { state: 'MO', stateWithheld: 1000 }), w2(30000, { state: 'KS', stateWithheld: 1100 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'MO', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'KS', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', income: { taxableInterest: 400 } }]);
  const ks = await stateReturn(state, '2025', 'KS');
  const partB = ks.schedules['Schedule S Part B'];
  assert.equal(partB['B1.kansas'], 30000);
  assert.equal(partB['B2.kansas'], 400);
  assert.equal(partB.B21, 30400);
  assert.equal(partB.B22, 61000);
  assert.equal(partB.B23, 49.8361);
  assert.equal(ks.lines['7'], 48235);
  assert.equal(ks.lines['8'], 2604);
  assert.equal(ks.lines['9'], 49.8361);
  assert.equal(ks.lines['10'], 1298);
  assert.equal(ks.totalTax, 1298);
  assert.equal(ks.owed, 198);
  assert.ok(ks.checks.some((item) => item.code === 'KS_PART_YEAR_OTHER_STATE'));
});

test('Kansas nonresident from Missouri: Kansas wages over Kansas adjusted gross income, no residents-only credits', async () => {
  const state = await household({ state: 'MO', forms: [w2(40000, { state: 'KS', stateWithheld: 1500 }), w2(20000, { state: 'MO' })] });
  await residency(state, '2025', [{ state: 'MO', residency: 'full-year' }, { state: 'KS', residency: 'nonresident' }]);
  const ks = await stateReturn(state, '2025', 'KS');
  assert.equal(ks.lines['8'], 2548);
  assert.equal(ks.lines['9'], 66.6667);
  assert.equal(ks.lines['10'], 1699);
  assert.equal(ks.stateIncome, 40000);
  assert.equal(ks.totalTax, 1699);
  assert.equal(ks.owed, 199);
});

test('Kansas resident with Missouri wages: credit for taxes paid to Missouri limited by the Kansas income share', async () => {
  const state = await household({ state: 'KS', forms: [w2(50000, { state: 'KS', stateWithheld: 2000 }), w2(20000, { state: 'MO', stateWithheld: 600 })] });
  await residency(state, '2025', [{ state: 'KS', residency: 'full-year' }, { state: 'MO', residency: 'nonresident' }]);
  const mo = await stateReturn(state, '2025', 'MO');
  const ks = await stateReturn(state, '2025', 'KS');
  assert.equal(ks.lines['8'], 3106);
  const sheet = ks.schedules['Other state credit'][0];
  assert.equal(sheet['1'], mo.totalTax);
  assert.equal(sheet['6'], 887);
  assert.equal(ks.lines['13'], Math.min(mo.totalTax, 887));
  assert.equal(ks.lines['16'], 3106 - ks.lines['13']);
  assert.equal(ks.otherStateCredit, ks.lines['13']);
});

test('Kansas high-income senior itemizer: Kansas Schedule A without the SALT cap and the computation schedule above $100,000', async () => {
  const state = await household({ state: 'KS', dateOfBirth: '1955-01-10', forms: [w2(250000, { state: 'KS', stateWithheld: 13000 }), { kind: '1098', fields: { mortgageInterest: 20000, propertyTax: 12000 } }], answers: { charityCash: 5000 } });
  await residency(state, '2025', [{ state: 'KS', residency: 'full-year', answers: { nonKansasMunicipalInterest: 0 } }]);
  const ks = await stateReturn(state, '2025', 'KS');
  assert.equal(ks.schedules.standardDeduction.amount, 4455);
  assert.equal(ks.schedules['Schedule A']['7'], 12000);
  assert.equal(ks.schedules['Schedule A']['14'], 37000);
  assert.equal(ks.lines['4'], 37000);
  assert.equal(ks.lines['7'], 203840);
  assert.equal(ks.lines['8'], 11287);
  assert.equal(ks.totalTax, 11287);
  assert.equal(ks.refund, 1713);
});

test('Kansas 2026: statutory amounts carried, not provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'KS', forms: [w2(60000, { state: 'KS', stateWithheld: 2500 })] });
  await residency(state, '2026', [{ state: 'KS', residency: 'full-year', answers: { college529Contributions: 4000, college529Beneficiaries: 1 } }]);
  const ks = await stateReturn(state, '2026', 'KS');
  assert.equal(ks.schedules['Schedule S Part A'].A16, 3000);
  assert.equal(ks.lines['3'], 57000);
  assert.equal(ks.lines['7'], 44235);
  assert.equal(ks.lines['8'], 2380);
  assert.equal(ks.provisional, false);
  assert.deepEqual(ks.missingRules, []);
});

test('Kansas labels every line of a resident Form K-40', async () => {
  const state = await household({ state: 'KS', forms: [w2(60000, { state: 'KS', stateWithheld: 2500 })] });
  await residency(state, '2025', [{ state: 'KS', residency: 'full-year' }]);
  const ks = await stateReturn(state, '2025', 'KS');
  for (const key of Object.keys(ks.lines)) assert.ok(typeof ks.labels[key] === 'string' && ks.labels[key].length > 0, key);
});

test('Kansas asks the 529 beneficiary count only after a 529 contribution, and the Part B income question only of nonresidents', async () => {
  const state = await household({ state: 'KS', forms: [w2(60000, { state: 'KS' })] });
  const ids = async () => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: 'KS' })).data.states[0].questions.map((item) => item.id);
  const first = await ids();
  assert.equal(first.includes('college529Beneficiaries'), false);
  assert.equal(first.includes('kansasRentalIncome'), false);
  assert.ok(first.includes('college529Contributions'));
  await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'KS', answers: { college529Contributions: 2000 } });
  assert.ok((await ids()).includes('college529Beneficiaries'));
  await residency(state, '2025', [{ state: 'MO', residency: 'full-year' }, { state: 'KS', residency: 'nonresident' }]);
  assert.ok((await ids()).includes('kansasRentalIncome'));
});
