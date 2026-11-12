import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from '../src/index.mjs';

const MID_2027 = '2027-06-30';
const valueOf = (id, onDate = MID_2027) => {
  const found = rule(id, onDate);
  assert.equal(found.ok, true, `${id} on ${onDate}: ${JSON.stringify(found)}`);
  return found.value;
};
const dollars = (cents) => cents / 100;

const REV_PROC_2026_35_TABLES = {
  mfj: { tops: [25600, 104050, 218250, 416650, 529100, 793650], plus: [2560, 11974, 37098, 84714, 120698, 213290.5] },
  hoh: { tops: [18250, 69650, 109100, 208300, 264550, 661350], plus: [1825, 7993, 16672, 40480, 58480, 197360] },
  single: { tops: [12800, 52025, 109125, 208325, 264550, 661375], plus: [1280, 5987, 18549, 42357, 60349, 199237.75] },
  mfs: { tops: [12800, 52025, 109125, 208325, 264550, 396825], plus: [1280, 5987, 18549, 42357, 60349, 106645.25] },
};

function taxAtEachTop(bands) {
  let tax = 0;
  return bands.filter((band) => band.toCents !== null).map((band) => {
    tax += ((band.toCents - band.fromCents) * band.basisPoints) / 10000;
    return dollars(tax);
  });
}

test('2027 brackets are Rev. Proc. 2026-35 Tables 1 to 4, and every "plus" amount in those tables follows from them', () => {
  const brackets = valueOf('us.federal.individual.brackets');
  for (const [status, table] of Object.entries(REV_PROC_2026_35_TABLES)) {
    assert.deepEqual(brackets[status].filter((band) => band.toCents !== null).map((band) => dollars(band.toCents)), table.tops, status);
    assert.deepEqual(brackets[status].map((band) => band.basisPoints), [1000, 1200, 2200, 2400, 3200, 3500, 3700], status);
    assert.deepEqual(taxAtEachTop(brackets[status]), table.plus, `${status}: tax at each bracket top`);
  }
});

test('2027 standard deduction, capital gains bands, child tax credit, student loan interest, QBI and educator amounts are Rev. Proc. 2026-35', () => {
  const standard = valueOf('us.federal.individual.standard-deduction');
  assert.deepEqual(Object.fromEntries(Object.entries(standard.basicCents).map(([k, v]) => [k, dollars(v)])), { single: 16600, mfj: 33200, mfs: 16600, hoh: 24925, qss: 33200 });
  assert.deepEqual([standard.additionalMarriedCents, standard.additionalUnmarriedCents, standard.dependentMinimumCents, standard.dependentEarnedIncomeAddCents].map(dollars), [1700, 2100, 1400, 500]);

  const gains = valueOf('us.federal.individual.capital-gains-rates');
  assert.deepEqual(Object.fromEntries(Object.entries(gains.zeroRateMaxCents).map(([k, v]) => [k, dollars(v)])), { single: 51050, mfj: 102100, mfs: 51050, hoh: 68350, qss: 102100 });
  assert.deepEqual(Object.fromEntries(Object.entries(gains.fifteenRateMaxCents).map(([k, v]) => [k, dollars(v)])), { single: 563200, mfj: 633600, mfs: 316800, hoh: 598400, qss: 633600 });

  const ctc = valueOf('us.federal.individual.child-tax-credit');
  assert.equal(dollars(ctc.perChildCents), 2300);
  assert.equal(dollars(ctc.refundablePerChildCents), 1800);

  const loans = valueOf('us.federal.individual.student-loan-interest');
  assert.deepEqual(loans.phaseOutCents, { mfj: { from: 18000000, to: 21000000 }, other: { from: 9000000, to: 10500000 } });
  assert.equal(dollars(loans.maxCents), 2500);

  const qbi = valueOf('us.federal.individual.qbi');
  assert.deepEqual(Object.fromEntries(Object.entries(qbi.thresholdCents).map(([k, v]) => [k, dollars(v)])), { mfj: 416600, qss: 416600, mfs: 208325, single: 208300, hoh: 208300 });

  assert.equal(dollars(valueOf('us.federal.individual.educator-expenses').maxPerEducatorCents), 350);
});

test('2027 earned income credit is Rev. Proc. 2026-35 section 3.06, and its maximum credits and completed phase-outs follow from the table', () => {
  const eitc = valueOf('us.federal.individual.eitc');
  const printed = [
    { maximum: 685, completedOther: 20164, completedJoint: 27684 },
    { maximum: 4573, completedOther: 53277, completedJoint: 60787 },
    { maximum: 7552, completedOther: 60519, completedJoint: 68029 },
    { maximum: 8496, completedOther: 65002, completedJoint: 72512 },
  ];
  assert.deepEqual(eitc.byChildren.map((row) => dollars(row.earnedIncomeAmountCents)), [8960, 13450, 18880, 18880]);
  eitc.byChildren.forEach((row, children) => {
    const maximum = Math.round((dollars(row.earnedIncomeAmountCents) * row.creditBasisPoints) / 10000);
    assert.equal(maximum, printed[children].maximum, `${children} children: maximum credit`);
    const completed = (start) => Math.round(dollars(start) + (printed[children].maximum * 10000) / row.phaseOutBasisPoints);
    assert.ok(Math.abs(completed(row.phaseOutStartCents.other) - printed[children].completedOther) <= 1, `${children} children: completed phase-out, other`);
    assert.ok(Math.abs(completed(row.phaseOutStartCents.joint) - printed[children].completedJoint) <= 1, `${children} children: completed phase-out, joint`);
  });
  assert.equal(dollars(eitc.investmentIncomeLimitCents), 12600);
});

test('2027 SALT cap and threshold are 101 per cent of 2026, half for married filing separately (IRC 164(b)(7))', () => {
  const salt2026 = valueOf('us.federal.individual.salt-cap', '2026-06-30');
  const salt2027 = valueOf('us.federal.individual.salt-cap');
  assert.equal(salt2027.capCents, (salt2026.capCents * 101) / 100);
  assert.equal(salt2027.phaseDownStartCents, (salt2026.phaseDownStartCents * 101) / 100);
  assert.equal(salt2027.mfsCapCents * 2, salt2027.capCents);
  assert.equal(salt2027.mfsPhaseDownStartCents * 2, salt2027.phaseDownStartCents);
  assert.deepEqual([dollars(salt2027.capCents), dollars(salt2027.phaseDownStartCents)], [40804, 510050]);
  assert.equal(salt2027.floorCents, salt2026.floorCents);
});

test('2027 Social Security wage base is the SSA notice of 26 October 2026, and the maximum tax each side is $11,922.60', () => {
  const fica = valueOf('us.federal.fica.social-security');
  assert.equal(dollars(fica.wageBaseCents), 192300);
  assert.equal((fica.wageBaseCents * fica.employeeBasisPoints) / 10000 / 100, 11922.6);
});

test('each 2027 record takes over on 1 January 2027 and ends on 31 December 2027', () => {
  const ids = ['us.federal.individual.brackets', 'us.federal.individual.standard-deduction', 'us.federal.individual.capital-gains-rates', 'us.federal.individual.child-tax-credit', 'us.federal.individual.eitc', 'us.federal.individual.salt-cap', 'us.federal.individual.student-loan-interest', 'us.federal.individual.qbi', 'us.federal.individual.educator-expenses', 'us.federal.fica.social-security'];
  for (const id of ids) {
    assert.equal(rule(id, '2026-12-31').record.effectiveFrom, '2026-01-01', id);
    assert.equal(rule(id, '2027-01-01').record.effectiveFrom, '2027-01-01', id);
    assert.equal(rule(id, '2027-12-31').record.effectiveTo, '2027-12-31', id);
    assert.equal(rule(id, '2028-01-01').error, 'RULE_NOT_IN_FORCE', id);
  }
});
