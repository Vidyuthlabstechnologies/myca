import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTool } from '../src/tools.mjs';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { californiaTax, tableIncome } from '../src/countries/united-states/states/ca.mjs';
import { stateRuleReader } from '../src/countries/united-states/state-kit.mjs';

const covered = { fullYearCoverage: true, useTax: 0 };
const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1986-06-01' };

test('California tax table: rows are taxed at their midpoint and match the published 2025 table', () => {
  const reader = stateRuleReader('CA', '2025');
  const rates = reader.read('tax-rates');
  const table = reader.read('tax-table');
  assert.equal(tableIncome(1, table), 25);
  assert.equal(tableIncome(50, table), 25);
  assert.equal(tableIncome(51, table), 100);
  assert.equal(tableIncome(13100, table), 13100);
  assert.equal(tableIncome(99999, table), 99975);
  assert.equal(californiaTax(13100, 'single', rates, table).tax, 151);
  assert.equal(californiaTax(13100, 'mfj', rates, table).tax, 131);
  assert.equal(californiaTax(13100, 'hoh', rates, table).tax, 131);
  assert.equal(californiaTax(99999, 'single', rates, table).tax, 5736);
  assert.equal(californiaTax(99999, 'mfj', rates, table).tax, 3068);
  assert.equal(californiaTax(99999, 'hoh', rates, table).tax, 3708);
  assert.equal(californiaTax(125000, 'mfj', rates, table).method, 'schedule');
  assert.equal(californiaTax(0, 'single', rates, table).tax, 0);
});

test('California resident single: Schedule CA removes Treasury interest and unemployment, adds back the HSA deduction and out-of-state muni interest', async () => {
  const state = await household({
    state: 'CA',
    forms: [w2(60000, { state: 'CA', stateWithheld: 2000 }), { kind: '1099-INT', fields: { interest: 500, treasuryInterest: 300, taxExemptInterest: 400 } }, { kind: '1099-G', fields: { unemployment: 4000 } }],
    answers: { hsaCoverage: 'self-only', hsaMonths: 12, hsaEligibleDecember: true, hsaOwnContributions: 2000 },
  });
  await residency(state, '2025', [{ state: 'CA', residency: 'full-year', answers: { fullYearCoverage: true, useTax: 25, nonCaliforniaExemptInterest: 400, hsaEarnings: 50, renterQualifies: true } }]);
  const ca = await stateReturn(state, '2025', 'CA');
  assert.equal(ca.form, '540');
  assert.equal(ca.lines['13'], 62800);
  assert.equal(ca.schedules['CA-I']['A2.B'], 300);
  assert.equal(ca.schedules['CA-I']['A2.C'], 450);
  assert.equal(ca.schedules['CA-I']['B7.B'], 4000);
  assert.equal(ca.schedules['CA-I']['C13.B'], 2000);
  assert.equal(ca.lines['14'], 2300);
  assert.equal(ca.lines['15'], 60500);
  assert.equal(ca.lines['16'], 450);
  assert.equal(ca.lines['17'], 60950);
  assert.equal(ca.lines['18'], 5706);
  assert.equal(ca.lines['19'], 55244);
  assert.equal(ca.lines['31'], 1847);
  assert.equal(ca.lines['32'], 153);
  assert.equal(ca.lines['46'], 0);
  assert.equal(ca.lines['48'], 1694);
  assert.equal(ca.lines['64'], 1694);
  assert.equal(ca.lines['91'], 25);
  assert.equal(ca.lines['93'], 1975);
  assert.equal(ca.lines['97'], 281);
  assert.equal(ca.totalTax, 1719);
  assert.equal(ca.refund, 281);
  assert.ok(ca.checks.some((item) => item.code === 'CA_RENTER_AGI'));
  assert.ok(!ca.checks.some((item) => item.level === 'error'), JSON.stringify(ca.checks));
});

test('California resident joint with two children: exemption credits wipe out the tax, and CalEITC, YCTC and the renter\'s credit follow FTB 3514 and the qualification record', async () => {
  const state = await household({
    state: 'CA', filingStatus: 'mfj', spouse,
    dependents: [{ firstName: 'Leo', lastName: 'Diaz', ssn: '400-12-9876', relationship: 'son', dateOfBirth: '2022-02-02', months: 12 }, { firstName: 'Mia', lastName: 'Diaz', ssn: '400-12-9877', relationship: 'daughter', dateOfBirth: '2017-05-05', months: 12 }],
    forms: [w2(24000, { state: 'CA', stateWithheld: 100 })],
  });
  await residency(state, '2025', [{ state: 'CA', residency: 'full-year', answers: { ...covered, renterQualifies: true, californiaQualifyingChildren: 2 } }]);
  const ca = await stateReturn(state, '2025', 'CA');
  assert.equal(ca.lines['7'], 306);
  assert.equal(ca.lines['10'], 950);
  assert.equal(ca.lines['11'], 1256);
  assert.equal(ca.lines['18'], 11412);
  assert.equal(ca.lines['19'], 12588);
  assert.equal(ca.lines['31'], 126);
  assert.equal(ca.lines['33'], 0);
  assert.equal(ca.lines['46'], 120);
  assert.equal(ca.lines['48'], 0);
  assert.equal(ca.lines['75'], 375);
  assert.equal(ca.lines['76'], 1189);
  assert.equal(ca.lines['77'], 0);
  assert.equal(ca.schedules['FTB-3514']['19'], 24000);
  assert.equal(ca.totalTax, 0);
  assert.equal(ca.refund, 100 + 375 + 1189);
  assert.deepEqual(ca.refundableCredits.map((item) => item.code), ['CA_EITC', 'CA_YCTC']);
});

test('California resident seniors: taxable Social Security is subtracted and the senior exemption credits are claimed', async () => {
  const state = await household({
    state: 'CA', filingStatus: 'mfj', dateOfBirth: '1955-01-15', spouse: { ...spouse, dateOfBirth: '1956-03-03' },
    forms: [{ kind: '1099-R', fields: { grossDistribution: 40000, taxableAmount: 40000, federalWithheld: 4000 } }, { kind: 'SSA-1099', fields: { netBenefits: 30000 } }],
  });
  await residency(state, '2025', [{ state: 'CA', residency: 'full-year', answers: covered }]);
  const ca = await stateReturn(state, '2025', 'CA');
  assert.equal(ca.lines['13'], 55350);
  assert.equal(ca.schedules['CA-I']['A6.B'], 15350);
  assert.equal(ca.lines['17'], 40000);
  assert.equal(ca.lines['19'], 28588);
  assert.equal(ca.lines['31'], 350);
  assert.equal(ca.lines['9'], 306);
  assert.equal(ca.lines['32'], 612);
  assert.equal(ca.lines['64'], 0);
});

test('California part-year resident: Form 540NR taxes the California share at the rate on all income and prorates the exemption credit', async () => {
  const state = await household({ state: 'CA', forms: [w2(50000, { state: 'CA', stateWithheld: 1500 }), w2(40000, { state: 'TX' })] });
  await residency(state, '2025', [{ state: 'TX', residency: 'part-year', from: '2025-01-01', to: '2025-06-30' }, { state: 'CA', residency: 'part-year', from: '2025-07-01', to: '2025-12-31', answers: { fullYearCoverage: true, renterQualifies: true, renterMonths: 6 } }]);
  const ca = await stateReturn(state, '2025', 'CA');
  assert.equal(ca.form, '540NR');
  assert.equal(ca.lines['17'], 90000);
  assert.equal(ca.lines['19'], 84294);
  assert.equal(ca.lines['31'], 4279);
  assert.equal(ca.lines['32'], 50000);
  assert.equal(ca.schedules['CA-NR-IV']['IV-3'], 0.5556);
  assert.equal(ca.schedules['CA-NR-IV']['IV-4'], 3170);
  assert.equal(ca.lines['35'], 46830);
  assert.equal(ca.lines['36'], 0.0508);
  assert.equal(ca.lines['37'], 2379);
  assert.equal(ca.lines['38'], 0.5556);
  assert.equal(ca.lines['39'], 85);
  assert.equal(ca.lines['40'], 2294);
  assert.equal(ca.lines['61'], 0);
  assert.equal(ca.lines['74'], 2294);
  assert.equal(ca.owed, 794);
});

test('California part-year renter: the credit is $5 a month for six to eleven months', async () => {
  const state = await household({ state: 'CA', forms: [w2(30000, { state: 'CA', stateWithheld: 500 }), w2(10000, { state: 'TX' })] });
  await residency(state, '2025', [{ state: 'TX', residency: 'part-year', from: '2025-01-01', to: '2025-03-31' }, { state: 'CA', residency: 'part-year', from: '2025-04-01', to: '2025-12-31', answers: { fullYearCoverage: true, renterQualifies: true, renterMonths: 9 } }]);
  const ca = await stateReturn(state, '2025', 'CA');
  assert.equal(ca.lines['61'], 45);
  assert.equal(ca.lines['63'], Math.max(0, ca.lines['42'] - 45));
});

test('California nonresident: only California wages are California income, and the tax rate comes from total income', async () => {
  const state = await household({ state: 'NV', forms: [w2(50000, { state: 'NV' }), w2(30000, { state: 'CA', stateWithheld: 800 }), { kind: '1099-INT', fields: { interest: 1000 } }] });
  await residency(state, '2025', [{ state: 'NV', residency: 'full-year' }, { state: 'CA', residency: 'nonresident', answers: { fullYearCoverage: true } }]);
  const ca = await stateReturn(state, '2025', 'CA');
  assert.equal(ca.form, '540NR');
  assert.equal(ca.residency, 'nonresident');
  assert.equal(ca.lines['17'], 81000);
  assert.equal(ca.lines['19'], 75294);
  assert.equal(ca.lines['31'], 3442);
  assert.equal(ca.lines['32'], 30000);
  assert.equal(ca.schedules['CA-NR-IV']['IV-3'], 0.3704);
  assert.equal(ca.lines['35'], 27886);
  assert.equal(ca.lines['36'], 0.0457);
  assert.equal(ca.lines['37'], 1274);
  assert.equal(ca.lines['39'], 57);
  assert.equal(ca.lines['74'], 1217);
  assert.equal(ca.owed, 417);
  assert.equal(ca.lines['85'], 0);
});

test('California high income: itemized deductions without the SALT cap are limited, exemption credits phase out and the Behavioral Health Services Tax applies', async () => {
  const state = await household({
    state: 'CA', filingStatus: 'mfj', spouse,
    forms: [w2(1400000, { state: 'CA', stateWithheld: 120000 }), { kind: '1098', fields: { mortgageInterest: 30000, propertyTax: 20000, outstandingPrincipal: 900000 } }],
    answers: { charityCash: 20000 },
  });
  await residency(state, '2025', [{ state: 'CA', residency: 'full-year', answers: covered }]);
  const ca = await stateReturn(state, '2025', 'CA');
  const partII = ca.schedules['CA-II'];
  assert.equal(partII['5a'], 0);
  assert.equal(partII['5e'], 20000);
  assert.equal(partII['10'], 30000);
  assert.equal(partII['14'], 20000);
  assert.equal(partII['28'], 70000);
  assert.equal(ca.schedules['CA-II-29']['8'], 53735);
  assert.equal(partII['29'], 16265);
  assert.equal(ca.lines['18'], 16265);
  assert.equal(ca.lines['19'], 1383735);
  assert.equal(ca.lines['31'], 132894);
  assert.equal(ca.schedules['AGI-LIMIT'].d, 359);
  assert.equal(ca.lines['32'], 0);
  assert.equal(ca.lines['62'], 3837);
  assert.equal(ca.lines['64'], 136731);
  assert.equal(ca.owed, 16731);
});

test('California resident with Illinois wages: Schedule S credit is the smaller of the California tax on that income and the Illinois tax', async () => {
  const state = await household({ state: 'CA', forms: [w2(70000, { state: 'CA', stateWithheld: 3000 }), w2(30000, { state: 'IL', stateWithheld: 1400 })] });
  await residency(state, '2025', [{ state: 'CA', residency: 'full-year', answers: covered }, { state: 'IL', residency: 'nonresident', answers: { useTax: 0 } }]);
  const all = await runTool(state, 'us_state_returns', { taxYear: '2025' });
  const ca = all.data.returns.find((item) => item.state === 'CA');
  const il = all.data.returns.find((item) => item.state === 'IL');
  assert.equal(il.totalTax, 1443);
  assert.equal(ca.lines['31'], 5209);
  assert.equal(ca.schedules.S.IL['2'], 5056);
  assert.equal(ca.schedules.S.IL['5'], 0.3);
  assert.equal(ca.schedules.S.IL['6'], 1517);
  assert.equal(ca.schedules.S.IL['12'], 1443);
  assert.equal(ca.lines['43'], 1443);
  assert.equal(ca.lines['48'], 3613);
  assert.equal(ca.otherStateCredit, 1443);
});

test('California questions block filing when health coverage or out-of-state muni interest is not answered, and a coverage gap is not guessed', async () => {
  const state = await household({ state: 'CA', forms: [w2(40000, { state: 'CA', stateWithheld: 900 }), { kind: '1099-INT', fields: { interest: 10, taxExemptInterest: 200 } }] });
  const first = await stateReturn(state, '2025', 'CA');
  assert.ok(first.checks.some((item) => item.code === 'CA_HEALTH_COVERAGE' && item.level === 'error'));
  assert.ok(first.checks.some((item) => item.code === 'CA_OUT_OF_STATE_MUNI' && item.level === 'error'));
  await residency(state, '2025', [{ state: 'CA', residency: 'full-year', answers: { fullYearCoverage: false, nonCaliforniaExemptInterest: 0, useTax: 0 } }]);
  const second = await stateReturn(state, '2025', 'CA');
  assert.ok(second.checks.some((item) => item.code === 'CA_ISR_PENALTY_NOT_COMPUTED' && item.level === 'error'));
  const pack = await runTool(state, 'us_state_filing_package', { taxYear: '2025', state: 'CA' });
  assert.ok(pack.data.packages[0].blockers.includes('CA_ISR_PENALTY_NOT_COMPUTED'));
});

test('California 2026 uses the published 2026 rate schedules, standard deduction and exemption credits, and the package stays blocked on provisional figures', async () => {
  const state = await household({ taxYear: '2026', state: 'CA', forms: [w2(120000, { state: 'CA', stateWithheld: 6000 })] });
  await residency(state, '2026', [{ state: 'CA', residency: 'full-year', answers: covered }]);
  const ca = await stateReturn(state, '2026', 'CA');
  assert.equal(ca.lines['18'], 5900);
  assert.equal(ca.lines['19'], 114100);
  assert.equal(ca.lines['31'], 6929);
  assert.equal(ca.lines['32'], 158);
  assert.equal(ca.lines['64'], 6771);
  assert.equal(ca.provisional, true);
  const pack = await runTool(state, 'us_state_filing_package', { taxYear: '2026', state: 'CA' });
  assert.ok(pack.data.packages[0].blockers.includes('STATE_FIGURES_PROVISIONAL'));
});
