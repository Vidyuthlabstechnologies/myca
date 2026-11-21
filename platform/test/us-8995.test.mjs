import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040 } from '../src/us-1040.mjs';
import { allocateQbiAdjustments, computeForm8995 } from '../src/us-form-8995.mjs';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';

const adult = { firstName: 'Ana', lastName: 'Diaz', dateOfBirth: '1980-04-02' };
const spouse = { firstName: 'Ben', lastName: 'Diaz', dateOfBirth: '1981-01-01' };
const w2 = (wages, owner = 'taxpayer') => ({ kind: 'W-2', owner, payer: 'Acme Inc', fields: { wages, federalWithheld: 0, socialSecurityWages: wages, medicareWages: wages } });
const div = (ordinary, reit) => ({ kind: '1099-DIV', owner: 'taxpayer', payer: 'Fund Co', fields: { ordinaryDividends: ordinary, qualifiedDividends: 0, section199aDividends: reit } });
const business = (id, name, grossReceipts, totalExpenses, extra = {}) => ({ id, name, owner: 'taxpayer', grossReceipts, totalExpenses, ...extra });
const run = (status, forms, more = {}, year = '2025') => computeForm1040({ filingStatus: status, taxpayer: adult, ...(status === 'mfj' ? { spouse } : {}), forms, ...more }, year);
const codes = (out) => out.data.checks.map((item) => item.code);

const profitAndLoss = [business('design', 'Design', 30000, 10000), business('bakery', 'Bakery', 2000, 8000)];

test('one profitable and one loss business: SE deduction 989 on the profit of 14000; 1i = 20000 - 989 = 19011, 1ii = -6000, line 2 = 13011, line 5 = 2602', () => {
  const out = run('single', [w2(50000)], { businesses: profitAndLoss });
  assert.equal(out.data.schedules.SE[0].lines['12'], 1978);
  assert.equal(out.data.schedules.SE[0].lines['13'], 989);
  const form = out.data.schedules['8995'];
  assert.equal(form['1i'], 19011);
  assert.equal(form['1ii'], -6000);
  assert.equal(form['2'], 13011);
  assert.equal(form['3'], 0);
  assert.equal(form['4'], 13011);
  assert.equal(form['5'], 2602);
  assert.equal(form['10'], 2602);
  assert.equal(form['11'], 63011 - 15750);
  assert.equal(form['14'], 9452);
  assert.equal(form['15'], 2602);
  assert.equal(form['16'], undefined);
  assert.equal(out.data.lines['13a'], 2602);
  assert.deepEqual(out.data.qbiBusinesses.map((row) => [row.id, row.qbi]), [['design', 19011], ['bakery', -6000]]);
  assert.deepEqual(out.data.qbiCarryforward, { qbiLoss: 0, reitPtpLoss: 0 });
});

test('a net QBI loss is not floored on line 2: profit 2000 and loss 6000 (no SE tax on a net loss) give line 2 = -4000, line 4 = 0, carried forward on line 16', () => {
  const out = run('single', [w2(50000)], { businesses: [business('a', 'Design', 2000, 0), business('b', 'Bakery', 0, 6000)] });
  const form = out.data.schedules['8995'];
  assert.equal(form['1i'], 2000);
  assert.equal(form['2'], -4000);
  assert.equal(form['4'], 0);
  assert.equal(form['15'], 0);
  assert.equal(form['16'], -4000);
  assert.equal(out.data.qbiCarryforward.qbiLoss, 4000);
});

test('prior-year QBI loss carryforward: line 3 = -15000 against line 2 = 13011 leaves line 4 = 0 and line 16 = -1989; a 5000 carryforward leaves 20% of 8011 = 1602', () => {
  const big = run('single', [w2(50000)], { businesses: profitAndLoss, answers: { qbiLossCarryforward: 15000 } });
  const form = big.data.schedules['8995'];
  assert.equal(form['2'], 13011);
  assert.equal(form['3'], -15000);
  assert.equal(form['4'], 0);
  assert.equal(form['5'], 0);
  assert.equal(form['15'], 0);
  assert.equal(form['16'], -1989);
  assert.equal(big.data.lines['13a'], 0);
  assert.equal(big.data.qbiCarryforward.qbiLoss, 1989);
  const small = run('single', [w2(50000)], { businesses: profitAndLoss, answers: { qbiLossCarryforward: 5000 } });
  assert.equal(small.data.schedules['8995']['4'], 8011);
  assert.equal(small.data.schedules['8995']['5'], 1602);
  assert.equal(small.data.lines['13a'], 1602);
  assert.equal(small.data.schedules['8995']['16'], undefined);
  assert.equal(small.data.qbiCarryforward.qbiLoss, 0);
});

test('a carryforward with no business this year passes through: line 16 = -3000', () => {
  const out = run('single', [w2(50000)], { answers: { qbiLossCarryforward: 3000 } });
  assert.equal(out.data.schedules['8995']['2'], 0);
  assert.equal(out.data.schedules['8995']['16'], -3000);
  assert.equal(out.data.lines['13a'], 0);
  assert.equal(out.data.qbiCarryforward.qbiLoss, 3000);
});

test('REIT dividends with a REIT/PTP loss carryforward: line 6 = 3000, line 7 = -1000, line 8 = 2000, line 9 = 400; a 5000 carryforward leaves line 17 = -2000', () => {
  const out = run('single', [w2(60000), div(3000, 3000)], { answers: { qbiReitPtpLossCarryforward: 1000 } });
  const form = out.data.schedules['8995'];
  assert.equal(form['6'], 3000);
  assert.equal(form['7'], -1000);
  assert.equal(form['8'], 2000);
  assert.equal(form['9'], 400);
  assert.equal(form['10'], 400);
  assert.equal(form['11'], 63000 - 15750);
  assert.equal(form['14'], 9450);
  assert.equal(form['15'], 400);
  assert.equal(out.data.lines['13a'], 400);
  const carried = run('single', [w2(60000), div(3000, 3000)], { answers: { qbiReitPtpLossCarryforward: 5000 } });
  assert.equal(carried.data.schedules['8995']['8'], 0);
  assert.equal(carried.data.schedules['8995']['17'], -2000);
  assert.equal(carried.data.lines['13a'], 0);
  assert.equal(carried.data.qbiCarryforward.reitPtpLoss, 2000);
});

test('2026 layout: REIT/PTP carryforward out is line 19 and QBI carryforward out is line 18', () => {
  const out = run('single', [w2(60000), div(3000, 3000)], { answers: { qbiReitPtpLossCarryforward: 5000, qbiLossCarryforward: 700 } }, '2026');
  const form = out.data.schedules['8995'];
  assert.equal(form['18'], -700);
  assert.equal(form['19'], -2000);
  assert.equal(form['17'], 0);
  assert.deepEqual(out.data.qbiCarryforward, { qbiLoss: 700, reitPtpLoss: 2000 });
});

const activeAndNot = (studio, shop) => [business('studio', 'Studio', 2000, 0, studio === undefined ? {} : { materialParticipation: studio }), business('shop', 'Shop', 0, 1500, shop === undefined ? {} : { materialParticipation: shop })];

test('2026 minimum, two businesses, one active: Studio 2000 - 35 SE deduction = 1965 active QBI >= 1000 gives line 16 = 400 though line 2 = 1965 - 1500 = 465', () => {
  const out = run('single', [w2(30000)], { businesses: activeAndNot('yes', 'no') }, '2026');
  assert.equal(out.data.schedules.SE[0].lines['13'], 35);
  const form = out.data.schedules['8995'];
  assert.equal(form['1i'], 1965);
  assert.equal(form['1ii'], -1500);
  assert.equal(form['2'], 465);
  assert.equal(form['5'], 93);
  assert.equal(form['11'], 30465 - 16100);
  assert.equal(form['14'], 2873);
  assert.equal(form['15'], 93);
  assert.equal(form['16'], 400);
  assert.equal(form['17'], 400);
  assert.equal(out.data.lines['13b'], 400);
  assert.ok(!codes(out).includes('QBI_MINIMUM_NEEDS_ANSWER'));
});

test('2026 minimum: when only the loss business is active, active QBI is -1500 and line 17 = line 15 = 93', () => {
  const out = run('single', [w2(30000)], { businesses: activeAndNot('no', 'yes') }, '2026');
  assert.equal(out.data.schedules['8995']['16'], 0);
  assert.equal(out.data.lines['13b'], 93);
  assert.ok(!codes(out).includes('QBI_MINIMUM_NEEDS_ANSWER'));
});

test('2026 minimum: the single answer does not cover two businesses, so it warns naming the unanswered ones', () => {
  const out = run('single', [w2(30000)], { businesses: activeAndNot(), answers: { qbiMaterialParticipation: 'yes' } }, '2026');
  assert.equal(out.data.lines['13b'], 93);
  const warning = out.data.checks.find((item) => item.code === 'QBI_MINIMUM_NEEDS_ANSWER');
  assert.equal(warning.level, 'warning');
  assert.match(warning.message, /Studio, Shop/);
  const partly = run('single', [w2(30000)], { businesses: activeAndNot(undefined, 'no') }, '2026');
  assert.match(partly.data.checks.find((item) => item.code === 'QBI_MINIMUM_NEEDS_ANSWER').message, /in Studio\./);
});

test('2026 minimum: one business keeps the single answer working', () => {
  const out = run('single', [w2(30000)], { businesses: [business('studio', 'Studio', 2000, 0)], answers: { qbiMaterialParticipation: 'yes' } }, '2026');
  assert.equal(out.data.lines['13b'], 400);
});

test('2026 minimum: the spouse answer covers the spouse 1099-NEC business; spouse 3000 - 212 = 2788 active, taxpayer 1500 - 106 = 1394 not active', () => {
  const nec = { kind: '1099-NEC', owner: 'spouse', payer: 'Client LLC', fields: { nonemployeeCompensation: 3000 } };
  const out = run('mfj', [w2(60000), nec], { businesses: [business('studio', 'Studio', 1500, 0)], answers: { qbiMaterialParticipation: 'no', spouseQbiMaterialParticipation: 'yes' } }, '2026');
  const rows = Object.fromEntries(out.data.qbiBusinesses.map((row) => [row.id, row]));
  assert.equal(rows.studio.qbi, 1394);
  assert.equal(rows.studio.active, false);
  assert.equal(rows['business-1099-nec-spouse'].qbi, 2788);
  assert.equal(rows['business-1099-nec-spouse'].active, true);
  assert.equal(out.data.schedules['8995']['2'], 4182);
  assert.equal(out.data.schedules['8995']['16'], 400);
  assert.equal(out.data.lines['13b'], 836);
});

test('2026 minimum: safe-harbor rental QBI is passive and never counts as active (draft 2026 Form 8995 instructions, line 16)', () => {
  const rental = { id: 'r1', kind: 'Rental property', owner: 'taxpayer', payer: '1 Main St, Austin, TX 78701', fields: { propertyType: 1, fairRentalDays: 365, activeParticipation: true, rents: 6500, repairs: 5000 } };
  const out = run('single', [w2(30000), rental], { answers: { rentalQbiSafeHarbor: true, qbiMaterialParticipation: 'yes' } }, '2026');
  assert.equal(out.data.schedules['8995']['2'], 1500);
  assert.equal(out.data.schedules['8995']['16'], 0);
  assert.equal(out.data.lines['13b'], 300);
  assert.ok(!codes(out).includes('QBI_MINIMUM_NEEDS_ANSWER'));
});

test('allocation keeps the totals: 671 split by profit 1500 and 8000 is 106 and 565', () => {
  const rows = allocateQbiAdjustments([{ id: 'a', owner: 'taxpayer', profit: 1500 }, { id: 'b', owner: 'taxpayer', profit: 8000 }], { byOwner: { taxpayer: 671 } });
  assert.deepEqual(rows.map((row) => row.qbi), [1394, 7435]);
});

test('Form 8995 module: active QBI exactly at the 1000 floor qualifies, 999 does not', () => {
  const minimum = { amount: 400, activeFloor: 1000 };
  const at = computeForm8995({ businesses: [{ id: 'a', name: 'A', qbi: 1000, active: true }], taxableIncome: 50000, basisPoints: 2000, minimum });
  assert.equal(at.lines['15'], 200);
  assert.equal(at.deduction, 400);
  const below = computeForm8995({ businesses: [{ id: 'a', name: 'A', qbi: 999, active: true }], taxableIncome: 50000, basisPoints: 2000, minimum });
  assert.equal(below.deduction, 200);
});

test('interview: carryforward questions and the spouse participation question appear when they apply', async () => {
  const state = createState();
  state.company = { name: 'Diaz household', country: 'US', entityType: 'household' };
  const people = { filingStatus: 'mfj', taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400-12-3456', dateOfBirth: '1980-04-02' }, spouse: { firstName: 'Ben', lastName: 'Diaz', ssn: '400-12-3457', dateOfBirth: '1981-01-01' }, address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' } };
  assert.equal((await runTool(state, 'set_us_taxpayer', { taxYear: '2026', ...people })).ok, true);
  const ids = async () => (await runTool(state, 'us_interview', { taxYear: '2026' })).data.questions.map((item) => item.id);
  const before = await ids();
  assert.ok(!before.includes('qbiLossCarryforward'));
  assert.ok(!before.includes('spouseQbiMaterialParticipation'));
  assert.equal((await runTool(state, 'add_us_tax_form', { taxYear: '2026', kind: '1099-NEC', owner: 'spouse', payer: 'Client LLC', payerTin: '98-7654321', fields: { nonemployeeCompensation: 3000 } })).ok, true);
  assert.equal((await runTool(state, 'add_us_tax_form', { taxYear: '2026', kind: '1099-DIV', payer: 'Fund Co', payerTin: '12-3456789', fields: { ordinaryDividends: 100 } })).ok, true);
  const after = await ids();
  assert.ok(after.includes('qbiLossCarryforward'));
  assert.ok(after.includes('qbiReitPtpLossCarryforward'));
  assert.ok(after.includes('spouseQbiMaterialParticipation'));
  assert.ok(!after.includes('qbiMaterialParticipation'));
});

test('import_us_prior_year carries the 2025 QBI loss carryforward out into 2026: 5000 - (1500 - 106) = 3606', async () => {
  const state = createState();
  state.company = { name: 'Diaz household', country: 'US', entityType: 'household' };
  const people = { filingStatus: 'single', taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400-12-3456', dateOfBirth: '1980-04-02' }, address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' } };
  assert.equal((await runTool(state, 'set_us_taxpayer', { taxYear: '2025', ...people })).ok, true);
  assert.equal((await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: '1099-NEC', payer: 'Agency', payerTin: '98-7654321', fields: { nonemployeeCompensation: 1500 } })).ok, true);
  assert.equal((await runTool(state, 'answer_us_interview', { taxYear: '2025', id: 'qbiLossCarryforward', answer: 5000 })).ok, true);
  const imported = await runTool(state, 'import_us_prior_year', { taxYear: '2026' });
  assert.equal(imported.ok, true);
  assert.equal(imported.data.answers.qbiLossCarryforward, 3606);
  assert.equal(imported.data.answers.qbiReitPtpLossCarryforward, undefined);
});
