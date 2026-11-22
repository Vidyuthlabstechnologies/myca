import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { runTool } from '../src/tools.mjs';
import { coloradoTableTax } from '../src/countries/united-states/states/co.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-06-01' };
const table = { firstRows: [0, 10, 30, 50, 75, 100], rowWidth: 100, tableUpTo: 50000 };

test('the Colorado tax table taxes the midpoint of each row below $50,000 and the exact amount above it', () => {
  assert.equal(coloradoTableTax(43800, table, 440), 1925);
  assert.equal(coloradoTableTax(43801, table, 440), 1929);
  assert.equal(coloradoTableTax(43900, table, 440), 1929);
  assert.equal(coloradoTableTax(27450, table, 440), 1208);
  assert.equal(coloradoTableTax(60000, table, 440), 2640);
  assert.equal(coloradoTableTax(0, table, 440), 0);
});

test('Colorado resident single: federal taxable income less U.S. interest, tax from the table, and the TABOR refund', async () => {
  const state = await household({ state: 'CO', forms: [w2(60000, { state: 'CO', stateWithheld: 2000 }), { kind: '1099-INT', fields: { interest: 500, treasuryInterest: 400 } }] });
  await residency(state, '2025', [{ state: 'CO', residency: 'full-year' }]);
  const co = await stateReturn(state, '2025', 'CO');
  assert.equal(co.form, 'DR 0104');
  assert.equal(co.lines['1'], 45150);
  assert.equal(co.schedules['DR 0104AD']['2'], 400);
  assert.equal(co.lines['11'], 400);
  assert.equal(co.lines['12'], 44750);
  assert.equal(co.lines['13'], 1969);
  assert.equal(co.lines['23'], 1969);
  assert.equal(co.lines['38'], 25);
  assert.equal(co.totalTax, 1969);
  assert.equal(co.refund, 56);
});

test('Colorado resident joint with children: child tax credit, family affordability tax credit and the 50% earned income credit are refundable', async () => {
  const state = await household({
    state: 'CO', filingStatus: 'mfj', spouse,
    dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2021-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2014-05-05', months: 12 }],
    forms: [w2(38000, { state: 'CO', stateWithheld: 900 })],
  });
  await residency(state, '2025', [{ state: 'CO', residency: 'full-year' }]);
  const co = await stateReturn(state, '2025', 'CO');
  assert.equal(co.lines['1'], 6500);
  assert.equal(co.lines['13'], 284);
  const cn = co.schedules['DR 0104CN'];
  assert.equal(cn['2'], 1);
  assert.equal(cn['3'], 600);
  assert.equal(cn['6'], 2598);
  assert.equal(cn['8'], 1);
  assert.equal(cn['9'], 1949);
  assert.equal(cn['11'], 5147);
  assert.equal(co.schedules['DR 0104CR']['4'], 5561);
  assert.equal(co.schedules['DR 0104CR']['5'], 2781);
  assert.equal(co.lines['31'], 7928);
  assert.equal(co.lines['38'], 38);
  assert.equal(co.totalTax, 284);
  assert.equal(co.refund, 900 - 284 + 7928 + 38);
});

test('Colorado resident aged 55 to 64: Social Security is subtracted in full under the AGI limit and the pension subtraction takes the rest of $20,000', async () => {
  const state = await household({ state: 'CO', dateOfBirth: '1968-03-01', forms: [{ kind: 'SSA-1099', fields: { netBenefits: 24000 } }, { kind: '1099-R', fields: { grossDistribution: 30000, taxableAmount: 30000, federalWithheld: 3000 } }] });
  await residency(state, '2025', [{ state: 'CO', residency: 'full-year' }]);
  const co = await stateReturn(state, '2025', 'CO');
  assert.equal(co.lines['1'], 25550);
  assert.equal(co.schedules['DR 0104AD']['3'], 11300);
  assert.equal(co.schedules['DR 0104AD']['4'], 8700);
  assert.equal(co.lines['11'], 20000);
  assert.equal(co.lines['12'], 5550);
  assert.equal(co.lines['13'], 244);
});

test('Colorado part-year resident: DR 0104PN applies the Colorado share of federal AGI to the tax on all income', async () => {
  const state = await household({ state: 'CO', forms: [w2(30000, { state: 'CO', stateWithheld: 1000 }), w2(30000, { state: 'UT', stateWithheld: 900 })] });
  await residency(state, '2025', [{ state: 'UT', residency: 'part-year', from: '2025-01-01', to: '2025-06-30', answers: { useTax: 0 } }, { state: 'CO', residency: 'part-year', from: '2025-07-01', to: '2025-12-31' }]);
  const co = await stateReturn(state, '2025', 'CO');
  const pn = co.schedules['DR 0104PN'];
  assert.equal(pn['33'], 30000);
  assert.equal(pn['32F'], 60000);
  assert.equal(pn['34'], 0.5);
  assert.equal(pn['35'], 1947);
  assert.equal(pn['36'], 974);
  assert.equal(co.lines['13'], 974);
  assert.equal(co.lines['38'], 0);
  assert.equal(co.totalTax, 974);
  assert.equal(co.refund, 26);
});

test('Colorado nonresident: the ratio is carried to six places', async () => {
  const state = await household({ state: 'UT', forms: [w2(70000, { state: 'UT', stateWithheld: 2000 }), w2(20000, { state: 'CO', stateWithheld: 800 })] });
  await residency(state, '2025', [{ state: 'UT', residency: 'full-year', answers: { useTax: 0 } }, { state: 'CO', residency: 'nonresident', income: { wages: 20000 } }]);
  const co = await stateReturn(state, '2025', 'CO');
  const pn = co.schedules['DR 0104PN'];
  assert.equal(pn['34'], 0.222222);
  assert.equal(pn['35'], 3267);
  assert.equal(pn['36'], 726);
  assert.equal(co.totalTax, 726);
  assert.equal(co.refund, 74);
});

test('Colorado high income: deductions over the allowance are added back above $300,000 of AGI and the top TABOR tier applies', async () => {
  const state = await household({ state: 'CO', filingStatus: 'mfj', spouse, forms: [w2(420000, { state: 'CO', stateWithheld: 18000 })] });
  await residency(state, '2025', [{ state: 'CO', residency: 'full-year' }]);
  const co = await stateReturn(state, '2025', 'CO');
  assert.equal(co.lines['1'], 388500);
  assert.equal(co.lines['4'], 15500);
  assert.equal(co.lines['10'], 404000);
  assert.equal(co.lines['13'], 17776);
  assert.equal(co.lines['38'], 118);
  assert.equal(co.totalTax, 17776);
  assert.equal(co.refund, 18000 - 17776 + 118);
});

test('Colorado 2026: the 4.4% rate holds, there is no TABOR refund, and the return is marked provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'CO', forms: [w2(60000, { state: 'CO', stateWithheld: 2000 })] });
  await residency(state, '2026', [{ state: 'CO', residency: 'full-year' }]);
  const co = await stateReturn(state, '2026', 'CO');
  assert.equal(co.lines['1'], 43900);
  assert.equal(co.lines['13'], 1929);
  assert.equal(co.lines['38'], 0);
  assert.equal(co.totalTax, 1929);
  assert.equal(co.provisional, true);
});

test('Colorado: every line of a resident return has a label in the words of Form DR 0104', async () => {
  const state = await household({ state: 'CO', forms: [w2(50000, { state: 'CO', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'CO', residency: 'full-year' }]);
  const found = await stateReturn(state, '2025', 'CO');
  assert.ok(Object.keys(found.lines).length > 0);
  for (const key of Object.keys(found.lines)) assert.ok(typeof found.labels[key] === 'string' && found.labels[key].length > 0, `line ${key} has no label`);
});

const questionIds = async (state, code) => (await runTool(state, 'us_state_questions', { taxYear: '2025', state: code })).data.states[0].questions.map((item) => item.id);

test('Colorado asks for CollegeInvest beneficiaries only after contributions are given', async () => {
  const state = await household({ state: 'CO', forms: [w2(50000, { state: 'CO' })] });
  assert.equal((await questionIds(state, 'CO')).includes('collegeInvestBeneficiaries'), false);
  const saved = await runTool(state, 'set_us_state_answers', { taxYear: '2025', state: 'CO', answers: { collegeInvestContributions: 3000 } });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.ok((await questionIds(state, 'CO')).includes('collegeInvestBeneficiaries'));
});
