import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';
import { STATE, ohioNonbusinessTax } from '../src/countries/united-states/states/oh.mjs';

const spouse = { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1984-01-01' };
const child = (firstName, dateOfBirth, ssn) => ({ firstName, lastName: 'Diaz', ssn, relationship: 'son', dateOfBirth, months: 12 });
const home = { schoolDistrictNumber: '2502', useTax: 0 };

test('Ohio resident, single: exemption by MAGI and the 2025 bracket base plus 2.75% over $26,050', async () => {
  const state = await household({ state: 'OH', forms: [w2(68000, { state: 'OH', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'OH', residency: 'full-year', answers: home }]);
  const oh = await stateReturn(state, '2025', 'OH');
  assert.equal(oh.status, 'computed');
  assert.equal(oh.form, 'IT 1040');
  assert.equal(oh.lines['1'], 68000);
  assert.equal(oh.lines['3'], 68000);
  assert.equal(oh.lines['4'], 2150);
  assert.equal(oh.lines['5'], 65850);
  assert.equal(oh.lines['8a'], 1437);
  assert.equal(oh.lines['10'], 1437);
  assert.equal(oh.lines['14'], 1500);
  assert.equal(oh.lines['23'], 63);
  assert.equal(oh.refund, 63);
  assert.equal(oh.provisional, false);
  assert.deepEqual(oh.schedules.SchoolDistrict, { number: '2502' });
  assert.ok(oh.checks.some((item) => item.code === 'OH_SD100_AND_MUNICIPAL'));
});

test('Ohio joint return with two children: 529 limit, campaign, joint filing and earned income credits', async () => {
  const state = await household({ state: 'OH', filingStatus: 'mfj', spouse, dependents: [child('Leo', '2016-05-01', '400-12-0001'), child('Mia', '2018-05-01', '400-12-0002')], forms: [w2(30000, { state: 'OH', stateWithheld: 400 }), w2(18000, { state: 'OH', stateWithheld: 200, owner: 'spouse' })] });
  await residency(state, '2025', [{ state: 'OH', residency: 'full-year', answers: { ...home, campaignContributions: 150, contributions529: 5000, beneficiaries529: 1 } }]);
  const oh = await stateReturn(state, '2025', 'OH');
  assert.equal(oh.schedules.Adjustments['37'], 4000);
  assert.equal(oh.schedules.Adjustments['47'], 4000);
  assert.equal(oh.lines['3'], 44000);
  assert.equal(oh.lines.exemptions, 4);
  assert.equal(oh.lines['4'], 8600);
  assert.equal(oh.lines['5'], 35400);
  assert.equal(oh.lines['8a'], 599);
  const credits = oh.schedules.Credits;
  assert.equal(credits['8'], 100);
  assert.equal(credits['9'], 0);
  assert.equal(credits['11'], 499);
  assert.equal(credits['12'], 75);
  assert.equal(credits['13'], 1037);
  assert.equal(credits['36'], 1112);
  assert.equal(credits['37'], 0);
  assert.equal(credits['40'], 1212);
  assert.equal(oh.lines['10'], 0);
  assert.equal(oh.refund, 600);
  assert.ok(oh.checks.some((item) => item.code === 'OH_529_LIMIT'));
  assert.ok(oh.checks.some((item) => item.code === 'OH_JOINT_FILING_STATEMENT'));
});

test('Ohio part-year resident: the whole year is taxed and the IT NRC removes the non-Ohio share', async () => {
  const state = await household({ state: 'OH', forms: [w2(30000, { state: 'IN', stateWithheld: 900 }), w2(45000, { state: 'OH', stateWithheld: 1100 })] });
  await residency(state, '2025', [{ state: 'IN', residency: 'part-year', from: '2025-01-01', to: '2025-04-30' }, { state: 'OH', residency: 'part-year', from: '2025-05-01', to: '2025-12-31', answers: home }]);
  const oh = await stateReturn(state, '2025', 'OH');
  assert.equal(oh.lines['3'], 75000);
  assert.equal(oh.lines['5'], 72850);
  assert.equal(oh.lines['8c'], 1629);
  const nrc = oh.schedules['IT NRC'];
  assert.equal(nrc['1B'], 45000);
  assert.equal(nrc['16'], 75000);
  assert.equal(nrc['17'], 45000);
  assert.equal(nrc['18'], 30000);
  assert.equal(nrc['19'], 0.4);
  assert.equal(nrc['20'], 652);
  assert.equal(oh.schedules.Credits['38'], 652);
  assert.equal(oh.lines['10'], 977);
  assert.equal(oh.refund, 123);
  assert.equal(oh.stateIncome, 45000);
});

test('Ohio nonresident: tax above $100,000 at 3.125% and the IT NRC ratio truncated to four places', async () => {
  const state = await household({ state: 'TX', forms: [w2(90000, { state: 'TX' }), w2(20000, { state: 'OH', stateWithheld: 300 })] });
  await residency(state, '2025', [{ state: 'TX', residency: 'full-year' }, { state: 'OH', residency: 'nonresident', answers: { useTax: 0 } }]);
  const oh = await stateReturn(state, '2025', 'OH');
  assert.equal(oh.lines['4'], 1900);
  assert.equal(oh.lines['5'], 108100);
  assert.equal(oh.lines['8a'], 2647);
  assert.equal(oh.schedules['IT NRC']['19'], 0.8181);
  assert.equal(oh.schedules['IT NRC']['20'], 2166);
  assert.equal(oh.lines['10'], 481);
  assert.equal(oh.owed, 181);
  assert.ok(!oh.checks.some((item) => item.code === 'OH_SCHOOL_DISTRICT_NUMBER'));
});

test('Ohio high income: business income deduction, 3% business rate and no exemption at $750,000 MAGI', async () => {
  const state = await household({ state: 'OH', forms: [w2(500000, { state: 'OH', stateWithheld: 15000 }), { kind: '1099-NEC', payer: 'Client', fields: { nonemployeeCompensation: 400000 } }] });
  await residency(state, '2025', [{ state: 'OH', residency: 'full-year', answers: home }]);
  const oh = await stateReturn(state, '2025', 'OH');
  assert.equal(oh.lines['1'], 894643);
  assert.deepEqual(oh.schedules.BUS, { 2: 400000, 10: 400000, 11: 400000, 12: 250000, 13: 250000, 14: 150000, 15: 150000, 16: 4500 });
  assert.equal(oh.schedules.Adjustments['13'], 250000);
  assert.equal(oh.lines['3'], 644643);
  assert.equal(oh.schedules.MAGI['3'], 894643);
  assert.equal(oh.lines['4'], 0);
  assert.equal(oh.lines['6'], 150000);
  assert.equal(oh.lines['7'], 494643);
  assert.equal(oh.lines['8a'], 14727);
  assert.equal(oh.lines['8b'], 4500);
  assert.equal(oh.lines['8c'], 19227);
  assert.equal(oh.owed, 4227);
  assert.ok(oh.checks.some((item) => item.code === 'OH_NO_EXEMPTION_ABOVE_LIMIT'));
});

test('Ohio retiree: Social Security deducted, retirement income and senior credits', async () => {
  const state = await household({ state: 'OH', dateOfBirth: '1955-03-01', forms: [w2(20000, { state: 'OH', stateWithheld: 100 }), { kind: '1099-R', payer: 'Pension', fields: { grossDistribution: 12000, taxableAmount: 12000, distributionCode: '7' } }, { kind: 'SSA-1099', fields: { netBenefits: 24000 } }, w2(40000, { state: 'MI', stateWithheld: 1700 })] });
  await residency(state, '2025', [{ state: 'OH', residency: 'full-year', answers: home }, { state: 'MI', residency: 'nonresident' }]);
  const oh = await stateReturn(state, '2025', 'OH');
  assert.equal(oh.lines['1'], 92400);
  assert.equal(oh.schedules.Adjustments['16'], 20400);
  assert.equal(oh.lines['3'], 72000);
  assert.equal(oh.lines['5'], 69850);
  assert.equal(oh.lines['8a'], 1547);
  assert.equal(oh.schedules.Credits['2'], 200);
  assert.equal(oh.schedules.Credits['4'], 50);
  assert.equal(oh.schedules.Credits['39'], 0);
  assert.equal(oh.lines['10'], 1297);
  assert.equal(oh.owed, 1197);
});

test('Ohio resident taxed by Illinois: IT RC is the lesser of the Illinois tax and the Ohio tax on that income', async () => {
  const state = await household({ state: 'OH', forms: [w2(30000, { state: 'OH', stateWithheld: 400 }), w2(40000, { state: 'IL', stateWithheld: 1500 })] });
  await residency(state, '2025', [{ state: 'OH', residency: 'full-year', answers: home }, { state: 'IL', residency: 'nonresident' }]);
  const il = await stateReturn(state, '2025', 'IL');
  assert.equal(il.totalTax, 1899);
  const oh = await stateReturn(state, '2025', 'OH');
  assert.equal(oh.lines['8c'], 1492);
  assert.deepEqual(oh.schedules['IT RC'], { ILA: 40000, ILB: 1899, 1: 40000, 2: 1899, 3: 70000, 4: 0.5714, 5: 1492, 6: 853, 7: 853 });
  assert.equal(oh.schedules.Credits['39'], 853);
  assert.equal(oh.otherStateCredit, 853);
  assert.equal(oh.lines['10'], 639);
});

test('a Michigan resident working in Ohio files only to get the Ohio withholding back', async () => {
  const state = await household({ state: 'MI', forms: [w2(50000, { state: 'OH', stateWithheld: 800 })] });
  await residency(state, '2025', [{ state: 'MI', residency: 'full-year', answers: { schoolDistrictCode: '33020', useTax: 0 } }, { state: 'OH', residency: 'nonresident', answers: { useTax: 0 } }]);
  const oh = await stateReturn(state, '2025', 'OH');
  assert.equal(oh.status, 'reciprocal');
  assert.equal(oh.withheld, 800);
});

test('Ohio 2026: $332 plus 2.75% over $26,050 by H.B. 96, renumbered schedules, exemptions provisional', async () => {
  const state = await household({ taxYear: '2026', state: 'OH', forms: [w2(68000, { state: 'OH', stateWithheld: 1500 })] });
  await residency(state, '2026', [{ state: 'OH', residency: 'full-year', answers: home }]);
  const oh = await stateReturn(state, '2026', 'OH');
  assert.equal(oh.lines['4'], 2150);
  assert.equal(oh.lines['5'], 65850);
  assert.equal(oh.lines['8a'], 1427);
  assert.equal(oh.schedules.Credits['36'], 1427);
  assert.equal(oh.schedules.Credits['8'], 0);
  assert.equal(oh.schedules.Adjustments['50'], 0);
  assert.equal(oh.refund, 73);
  assert.equal(oh.provisional, true);
  assert.equal(ohioNonbusinessTax(500000, [{ overCents: 0, baseCents: 0, rateBp: 0 }, { overCents: 2605000, baseCents: 33200, rateBp: 275 }]), 13366);
  assert.equal(ohioNonbusinessTax(26050, [{ overCents: 0, baseCents: 0, rateBp: 0 }, { overCents: 2605000, baseCents: 33200, rateBp: 275 }]), 0);
});

test('Ohio asks for the school district number and lists SD 100 and city taxes as not covered', () => {
  assert.equal(STATE.built, true);
  assert.ok(STATE.questions.some((item) => item.id === 'schoolDistrictNumber'));
  assert.ok(STATE.questions.some((item) => item.id === 'contributions529'));
  assert.ok(STATE.notCovered.some((item) => /SD 100/.test(item)));
  assert.ok(STATE.notCovered.some((item) => /municipal|city/i.test(item)));
});
