import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES as DUE_DATE_RULES } from '../src/rules/due-dates.mjs';
import { RULES as AUDIT_THRESHOLD_RULES } from '../src/rules/audit-thresholds.mjs';
import { RULES as HOLIDAY_RULES } from '../src/rules/holidays.mjs';
import { createRuleBook, isIsoDate, rule, runGolden, validateRules } from '../src/index.mjs';

globalThis.fetch = () => {
  throw new Error('network is not allowed in statutory-rules');
};

const EXTENSION_PREFIX = 'due-date.extension.';
const RUPEE = 100;
const LAKH = 100000 * RUPEE;
const CRORE = 100 * LAKH;

const BASE_DUE_DATE_IDS = [
  'due-date.gst.gstr-1.monthly',
  'due-date.gst.gstr-1.quarterly',
  'due-date.gst.iff',
  'due-date.gst.gstr-3b.monthly',
  'due-date.gst.gstr-3b.quarterly',
  'due-date.gst.pmt-06',
  'due-date.gst.gstr-7',
  'due-date.gst.gstr-9',
  'due-date.tds.deposit',
  'due-date.tds.statement',
  'due-date.income-tax.advance-tax',
  'due-date.income-tax.advance-tax.presumptive',
  'due-date.income-tax.return.transfer-pricing',
  'due-date.income-tax.return.audit',
  'due-date.income-tax.return.non-audit-business',
  'due-date.income-tax.return.other',
  'due-date.pf.contribution',
  'due-date.esi.contribution',
  'due-date.rollover'
].sort();

const CATEGORY_X = [
  ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['27', 'Maharashtra'], ['29', 'Karnataka'],
  ['30', 'Goa'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'],
  ['25', 'Daman and Diu'], ['26', 'Dadra and Nagar Haveli'], ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'], ['31', 'Lakshadweep']
];

const CATEGORY_Y = [
  ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['05', 'Uttarakhand'], ['06', 'Haryana'], ['08', 'Rajasthan'],
  ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'],
  ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'],
  ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'], ['01', 'Jammu and Kashmir'], ['38', 'Ladakh'],
  ['04', 'Chandigarh'], ['07', 'Delhi']
];

function states(pairs) {
  return pairs.map(([code, name]) => ({ code, name }));
}

function valueOn(id, onDate) {
  const found = rule(id, onDate);
  assert.equal(found.ok, true, `${id} on ${onDate}: ${JSON.stringify(found)}`);
  return found;
}

test('the due-date module holds exactly the sourced rules plus extension records, all well formed and unattested', () => {
  assert.deepEqual(validateRules(DUE_DATE_RULES).problems, []);
  const baseIds = [...new Set(DUE_DATE_RULES.map((record) => record.id).filter((id) => !id.startsWith(EXTENSION_PREFIX)))].sort();
  assert.deepEqual(baseIds, BASE_DUE_DATE_IDS);
  for (const record of DUE_DATE_RULES) {
    assert.deepEqual(record.attestations, [], `${record.id} must wait for the advisor CA`);
    assert.ok(record.source.trim().length > 20, `${record.id} needs a real source`);
  }
});

test('GST monthly and quarterly GSTR-1, IFF and GSTR-3B days follow Notification 83/2020-CT and rules 59 and 61', () => {
  const gstr1Monthly = valueOn('due-date.gst.gstr-1.monthly', '2026-04-30');
  assert.deepEqual(gstr1Monthly.value, { period: 'month', monthsAfterPeriodEnd: 1, day: 11 });
  assert.equal(gstr1Monthly.record.act, 'CGST');
  assert.match(gstr1Monthly.record.source, /83\/2020-Central Tax/);
  assert.equal(gstr1Monthly.record.effectiveFrom, '2021-01-01');

  assert.deepEqual(valueOn('due-date.gst.gstr-1.quarterly', '2026-06-30').value, { period: 'quarter', monthsAfterPeriodEnd: 1, day: 13 });
  assert.deepEqual(valueOn('due-date.gst.iff', '2026-04-30').value, { period: 'month', onlyQuarterMonths: [1, 2], optional: true, monthsAfterPeriodEnd: 1, day: 13 });
  assert.deepEqual(valueOn('due-date.gst.gstr-3b.monthly', '2026-04-30').value, { period: 'month', monthsAfterPeriodEnd: 1, day: 20 });
  assert.deepEqual(valueOn('due-date.gst.pmt-06', '2026-04-30').value, { period: 'month', onlyQuarterMonths: [1, 2], monthsAfterPeriodEnd: 1, day: 25 });
  assert.match(valueOn('due-date.gst.pmt-06', '2026-04-30').record.source, /61\(3\)/);
});

test('GSTR-3B quarterly is the 22nd or 24th by the two rule 61 state lists, which never overlap', () => {
  const found = valueOn('due-date.gst.gstr-3b.quarterly', '2026-06-30');
  assert.deepEqual(found.value, {
    period: 'quarter',
    monthsAfterPeriodEnd: 1,
    dayByState: [
      { day: 22, states: states(CATEGORY_X) },
      { day: 24, states: states(CATEGORY_Y) }
    ]
  });
  const codes = found.value.dayByState.flatMap((group) => group.states.map((state) => state.code));
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) assert.match(code, /^\d{2}$/);
  for (const unlisted of ['97', '99', '28']) assert.equal(codes.includes(unlisted), false, `${unlisted} is not named in rule 61`);
  assert.match(found.record.source, /82\/2020-Central Tax/);
});

test('GSTR-7 is due on the 10th under rule 66(1) from 1 November 2024 and GSTR-9 on 31 December after the year', () => {
  const gstr7 = valueOn('due-date.gst.gstr-7', '2026-04-30');
  assert.deepEqual(gstr7.value, { period: 'month', monthsAfterPeriodEnd: 1, day: 10 });
  assert.equal(gstr7.record.effectiveFrom, '2024-11-01');
  assert.match(gstr7.record.source, /20\/2024-Central Tax/);
  const gstr9 = valueOn('due-date.gst.gstr-9', '2027-03-31');
  assert.deepEqual(gstr9.value, { period: 'year', monthsAfterPeriodEnd: 9, day: 31 });
  assert.equal(gstr9.record.section, '44');
});

test('TDS deposit is the 7th, or 30 April for March, under rule 30 (1961) and rule 218 (2026)', () => {
  const expected = { period: 'month', monthsAfterPeriodEnd: 1, day: 7, overrides: [{ periodEndMonth: 3, monthsAfterPeriodEnd: 1, day: 30 }], appliesTo: 'non-government deductors' };
  const old = valueOn('due-date.tds.deposit', '2026-03-31');
  assert.deepEqual(old.value, expected);
  assert.equal(old.record.act, 'IT-1961');
  assert.equal(old.record.effectiveTo, '2026-03-31');
  const current = valueOn('due-date.tds.deposit', '2026-04-30');
  assert.deepEqual(current.value, expected);
  assert.equal(current.record.act, 'IT-2025');
  assert.equal(current.record.section, '397(3)(a)');
  assert.match(current.record.source, /rule 218/);
});

test('quarterly TDS statements (Forms 138 and 140) are due 31 July, 31 October, 31 January and 31 May', () => {
  const found = valueOn('due-date.tds.statement', '2026-06-30');
  assert.deepEqual(found.value, { period: 'quarter', monthsAfterPeriodEnd: 1, day: 31, overrides: [{ periodEndMonth: 3, monthsAfterPeriodEnd: 2, day: 31 }], forms: ['138', '140'] });
  assert.equal(found.record.act, 'IT-2025');
  assert.equal(found.record.section, '397(3)(b)');
  assert.equal(rule('due-date.tds.statement', '2026-03-31').error, 'RULE_NOT_IN_FORCE');
});

test('advance tax instalments follow section 408 of the Income-tax Act 2025', () => {
  const found = valueOn('due-date.income-tax.advance-tax', '2027-03-31');
  assert.deepEqual(found.value, {
    period: 'year',
    instalments: [
      { month: 6, day: 15, cumulativePercent: 15 },
      { month: 9, day: 15, cumulativePercent: 45 },
      { month: 12, day: 15, cumulativePercent: 75 },
      { month: 3, day: 15, cumulativePercent: 100 }
    ]
  });
  assert.equal(found.record.section, '408(1)');
  const presumptive = valueOn('due-date.income-tax.advance-tax.presumptive', '2027-03-31');
  assert.deepEqual(presumptive.value, { period: 'year', instalments: [{ month: 3, day: 15, cumulativePercent: 100 }] });
  assert.equal(presumptive.record.section, '408(2)');
});

test('return-of-income due dates carry the Finance Act 2026 31 August row for FY 2025-26 and tax year 2026-27', () => {
  const expected = {
    'due-date.income-tax.return.transfer-pricing': { monthsAfterPeriodEnd: 8, day: 30 },
    'due-date.income-tax.return.audit': { monthsAfterPeriodEnd: 7, day: 31 },
    'due-date.income-tax.return.non-audit-business': { monthsAfterPeriodEnd: 5, day: 31 },
    'due-date.income-tax.return.other': { monthsAfterPeriodEnd: 4, day: 31 }
  };
  for (const [id, days] of Object.entries(expected)) {
    const old = valueOn(id, '2026-03-31');
    assert.equal(old.record.act, 'IT-1961', id);
    assert.equal(old.record.section, '139(1) Explanation 2', id);
    assert.equal(old.record.effectiveFrom, '2026-03-01', id);
    assert.match(old.record.source, /Finance Act, 2026/, id);
    const current = valueOn(id, '2027-03-31');
    assert.equal(current.record.act, 'IT-2025', id);
    assert.equal(current.record.section, '263(1)(c)', id);
    for (const found of [old, current]) {
      assert.equal(found.value.period, 'year', id);
      assert.equal(found.value.monthsAfterPeriodEnd, days.monthsAfterPeriodEnd, id);
      assert.equal(found.value.day, days.day, id);
      assert.equal(typeof found.value.appliesTo, 'string', id);
    }
    assert.equal(rule(id, '2025-03-31').error, 'RULE_NOT_IN_FORCE', `${id} is not recorded for FY 2024-25`);
  }
});

test('PF contributions are due within fifteen days of the close of the month', () => {
  const found = valueOn('due-date.pf.contribution', '2026-04-30');
  assert.deepEqual(found.value, { period: 'month', monthsAfterPeriodEnd: 1, day: 15 });
  assert.equal(found.record.act, 'EPF-1952');
});

test('there is no general weekend or holiday rollover: only a notified extension moves a due date', () => {
  const found = valueOn('due-date.rollover', '2026-09-21');
  assert.deepEqual(found.value, { weekend: false, holiday: false, movedOnlyBy: 'notified-extension' });
});

test('every extension record names its due-date rule and period end in its id and applies to that period alone', () => {
  const extensions = DUE_DATE_RULES.filter((record) => record.id.startsWith(EXTENSION_PREFIX));
  assert.ok(extensions.length >= 1);
  for (const record of extensions) {
    const { dueRule, periodEnd, dueDates } = record.value;
    assert.deepEqual(Object.keys(record.value).sort(), ['dueDates', 'dueRule', 'periodEnd']);
    assert.ok(BASE_DUE_DATE_IDS.includes(dueRule), record.id);
    assert.equal(record.id, `${EXTENSION_PREFIX}${dueRule.slice('due-date.'.length)}.${periodEnd}`);
    assert.equal(record.effectiveFrom, periodEnd);
    assert.equal(record.effectiveTo, periodEnd);
    assert.equal(rule(dueRule, periodEnd).ok, true, `${dueRule} must be in force for ${periodEnd}`);
    assert.ok(Array.isArray(dueDates) && dueDates.length >= 1);
    for (const entry of dueDates) {
      assert.deepEqual(Object.keys(entry).sort(), ['dueDate', 'stateCodes']);
      assert.ok(entry.stateCodes === null || (Array.isArray(entry.stateCodes) && entry.stateCodes.length > 0));
      assert.ok(entry.dueDate > periodEnd);
    }
  }
});

test('Notification 01/2026-CT moved GSTR-3B for March 2026 to 21 April 2026 for monthly filers only', () => {
  const found = valueOn('due-date.extension.gst.gstr-3b.monthly.2026-03-31', '2026-03-31');
  assert.deepEqual(found.value, { dueRule: 'due-date.gst.gstr-3b.monthly', periodEnd: '2026-03-31', dueDates: [{ dueDate: '2026-04-21', stateCodes: null }] });
  assert.match(found.record.source, /01\/2026-Central Tax/);
  assert.equal(rule('due-date.extension.gst.gstr-3b.monthly.2026-02-28', '2026-02-28').error, 'RULE_UNKNOWN');
  assert.equal(rule('due-date.extension.gst.gstr-3b.quarterly.2026-03-31', '2026-03-31').error, 'RULE_UNKNOWN');
});

test('a state-specific extension such as Notification 02/2025-CT fits the extension record type', () => {
  const book = createRuleBook([{
    id: 'due-date.extension.gst.gstr-3b.quarterly.2024-12-31',
    value: {
      dueRule: 'due-date.gst.gstr-3b.quarterly',
      periodEnd: '2024-12-31',
      dueDates: [
        { dueDate: '2025-01-24', stateCodes: CATEGORY_X.map(([code]) => code) },
        { dueDate: '2025-01-26', stateCodes: CATEGORY_Y.map(([code]) => code) }
      ]
    },
    effectiveFrom: '2024-12-31',
    effectiveTo: '2024-12-31',
    act: 'CGST',
    section: '39(6)',
    source: 'Test fixture shaped on Notification No. 02/2025-Central Tax dated 10.01.2025; not a registered rule',
    attestations: []
  }]);
  assert.deepEqual(book.integrity, { ok: true, problems: [] });
  const found = book.rule('due-date.extension.gst.gstr-3b.quarterly.2024-12-31', '2024-12-31');
  assert.equal(found.value.dueDates.find((entry) => entry.stateCodes.includes('29')).dueDate, '2025-01-24');
  assert.equal(found.value.dueDates.find((entry) => entry.stateCodes.includes('07')).dueDate, '2025-01-26');
});

test('the audit-threshold module holds the tax-audit limits and the presumptive exemption, split at 1 April 2026', () => {
  assert.deepEqual(validateRules(AUDIT_THRESHOLD_RULES).problems, []);
  assert.deepEqual([...new Set(AUDIT_THRESHOLD_RULES.map((record) => record.id))].sort(), ['audit-threshold.tax-audit', 'audit-threshold.tax-audit.presumptive-exemption']);
  for (const record of AUDIT_THRESHOLD_RULES) {
    assert.deepEqual(record.attestations, []);
    assert.equal(record.act, record.effectiveFrom >= '2026-04-01' ? 'IT-2025' : 'IT-1961', record.id);
    assert.equal(record.effectiveTo, record.act === 'IT-1961' ? '2026-03-31' : null, record.id);
  }
});

test('tax audit: business above Rs 1 crore, or Rs 10 crore when cash receipts and cash payments are each at most 5%; profession above Rs 50 lakh', () => {
  const limits = {
    business: { auditAbovePaise: 1 * CRORE, lowCash: { auditAbovePaise: 10 * CRORE, cashReceiptsMaxPercent: 5, cashPaymentsMaxPercent: 5 } },
    profession: { auditAbovePaise: 50 * LAKH }
  };
  const fy2025 = valueOn('audit-threshold.tax-audit', '2025-04-01');
  assert.deepEqual(fy2025.value, limits);
  assert.equal(fy2025.record.section, '44AB');
  assert.equal(fy2025.record.effectiveFrom, '2020-04-01');
  const fy2026 = valueOn('audit-threshold.tax-audit', '2026-04-01');
  assert.deepEqual(fy2026.value, { ...limits, nonAccountPayeeChequeIsCash: true });
  assert.equal(fy2026.record.section, '63(1)');
  assert.equal(rule('audit-threshold.tax-audit', '2020-03-31').error, 'RULE_NOT_IN_FORCE');
});

test('the Rs 75 lakh profession figure is the presumptive-scheme limit that exempts from audit, not a tax-audit threshold', () => {
  for (const fyStartDate of ['2025-04-01', '2026-04-01']) {
    assert.equal(Object.hasOwn(valueOn('audit-threshold.tax-audit', fyStartDate).value.profession, 'lowCash'), false);
  }
  const exemption = {
    business: { turnoverUpToPaise: 2 * CRORE, lowCash: { turnoverUpToPaise: 3 * CRORE, cashReceiptsMaxPercent: 5 } },
    profession: { grossReceiptsUpToPaise: 50 * LAKH, lowCash: { grossReceiptsUpToPaise: 75 * LAKH, cashReceiptsMaxPercent: 5 } },
    requiresPresumptiveProfitDeclared: true
  };
  const fy2025 = valueOn('audit-threshold.tax-audit.presumptive-exemption', '2025-04-01');
  assert.deepEqual(fy2025.value, exemption);
  assert.equal(fy2025.record.effectiveFrom, '2023-04-01');
  assert.equal(fy2025.record.section, '44AB proviso; 44AD(1); 44ADA(1)');
  const fy2026 = valueOn('audit-threshold.tax-audit.presumptive-exemption', '2026-04-01');
  assert.deepEqual(fy2026.value, exemption);
  assert.equal(fy2026.record.section, '63(2); 58(2) Table Sl. Nos. 1 and 3');
});

function withinPercent(partPaise, wholePaise, percent) {
  return partPaise * 100 <= wholePaise * percent;
}

function taxAuditRequired(fyStartDate, facts) {
  const limits = valueOn('audit-threshold.tax-audit', fyStartDate).value;
  const exemption = valueOn('audit-threshold.tax-audit.presumptive-exemption', fyStartDate).value;
  if (facts.kind === 'business') {
    if (facts.presumptiveDeclared) {
      const lowCash = withinPercent(facts.cashReceiptsPaise, facts.totalReceiptsPaise, exemption.business.lowCash.cashReceiptsMaxPercent);
      const limit = lowCash ? exemption.business.lowCash.turnoverUpToPaise : exemption.business.turnoverUpToPaise;
      if (facts.turnoverPaise <= limit) return false;
    }
    const lowCash = withinPercent(facts.cashReceiptsPaise, facts.totalReceiptsPaise, limits.business.lowCash.cashReceiptsMaxPercent)
      && withinPercent(facts.cashPaymentsPaise, facts.totalPaymentsPaise, limits.business.lowCash.cashPaymentsMaxPercent);
    return facts.turnoverPaise > (lowCash ? limits.business.lowCash.auditAbovePaise : limits.business.auditAbovePaise);
  }
  if (facts.presumptiveDeclared) {
    const lowCash = withinPercent(facts.cashReceiptsPaise, facts.grossReceiptsPaise, exemption.profession.lowCash.cashReceiptsMaxPercent);
    const limit = lowCash ? exemption.profession.lowCash.grossReceiptsUpToPaise : exemption.profession.grossReceiptsUpToPaise;
    if (facts.grossReceiptsPaise <= limit) return false;
  }
  return facts.grossReceiptsPaise > limits.profession.auditAbovePaise;
}

test('the recorded limits decide the audit finding cases: a Rs 70 lakh trader needs no audit', () => {
  const trader = (turnoverPaise, cashReceiptsPaise, cashPaymentsPaise) => ({
    kind: 'business', presumptiveDeclared: false, turnoverPaise, totalReceiptsPaise: turnoverPaise, cashReceiptsPaise, totalPaymentsPaise: turnoverPaise, cashPaymentsPaise
  });
  for (const fyStartDate of ['2025-04-01', '2026-04-01']) {
    assert.equal(taxAuditRequired(fyStartDate, trader(70 * LAKH, 20 * LAKH, 20 * LAKH)), false);
    assert.equal(taxAuditRequired(fyStartDate, trader(1 * CRORE, 50 * LAKH, 0)), false);
    assert.equal(taxAuditRequired(fyStartDate, trader(1 * CRORE + 1, 50 * LAKH, 0)), true);
    assert.equal(taxAuditRequired(fyStartDate, trader(9 * CRORE, 45 * LAKH, 45 * LAKH)), false);
    assert.equal(taxAuditRequired(fyStartDate, trader(9 * CRORE, 45 * LAKH + 1, 0)), true);
    assert.equal(taxAuditRequired(fyStartDate, trader(9 * CRORE, 0, 45 * LAKH + 1)), true);
    assert.equal(taxAuditRequired(fyStartDate, trader(10 * CRORE + 1, 0, 0)), true);
    const professional = (grossReceiptsPaise, cashReceiptsPaise, presumptiveDeclared) => ({ kind: 'profession', grossReceiptsPaise, cashReceiptsPaise, presumptiveDeclared });
    assert.equal(taxAuditRequired(fyStartDate, professional(50 * LAKH, 0, false)), false);
    assert.equal(taxAuditRequired(fyStartDate, professional(60 * LAKH, 0, false)), true);
    assert.equal(taxAuditRequired(fyStartDate, professional(60 * LAKH, 2 * LAKH, true)), false);
    assert.equal(taxAuditRequired(fyStartDate, professional(60 * LAKH, 10 * LAKH, true)), true);
    assert.equal(taxAuditRequired(fyStartDate, professional(80 * LAKH, 0, true)), true);
  }
});

const DELHI_2026 = [
  ['2026-01-26', 'Republic Day'],
  ['2026-03-04', 'Holi'],
  ['2026-03-21', 'Id-ul-Fitr'],
  ['2026-03-26', 'Ram Navami'],
  ['2026-03-31', 'Mahavir Jayanti'],
  ['2026-04-03', 'Good Friday'],
  ['2026-05-01', 'Budha Purnima'],
  ['2026-05-27', 'Id-ul-Zuha (Bakrid)'],
  ['2026-06-26', 'Muharram'],
  ['2026-08-15', 'Independence Day'],
  ['2026-08-26', 'Milad-un-Nabi or Id-e-Milad (Birthday of Prophet Mohammad)'],
  ['2026-09-04', 'Janmashtami (Vaishnva)'],
  ['2026-10-02', "Mahatma Gandhi's Birthday"],
  ['2026-10-20', 'Dussehra'],
  ['2026-11-08', 'Diwali (Deepavali)'],
  ['2026-11-24', "Guru Nanak's Birthday"],
  ['2026-12-25', 'Christmas Day']
];

const DELHI_2027 = [
  ['2027-01-26', 'Republic Day'],
  ['2027-03-10', 'Id-ul-Fitr'],
  ['2027-03-23', 'Holi'],
  ['2027-03-26', 'Good Friday'],
  ['2027-04-15', 'Ram Navami'],
  ['2027-04-19', 'Mahavir Jayanti'],
  ['2027-05-17', 'Id-ul-Zuha (Bakrid)'],
  ['2027-05-20', 'Budha Purnima'],
  ['2027-06-16', 'Muharram'],
  ['2027-08-15', 'Independence Day'],
  ['2027-08-15', "Milad-un-Nabi or Id-e-Milad (Prophet Mohammad's Birthday)"],
  ['2027-08-25', 'Janmashtami (Vaishnav)'],
  ['2027-10-02', "Mahatma Gandhi's Birthday"],
  ['2027-10-09', 'Dussehra (Vijaya Dashmi)'],
  ['2027-10-29', 'Diwali (Deepavali)'],
  ['2027-11-14', "Guru Nanak's Birthday"],
  ['2027-12-25', 'Christmas Day']
];

const NOT_COMPULSORY_OUTSIDE_DELHI = ['Holi', 'Ram Navami', 'Janmashtami (Vaishnva)'];
const NOT_COMPULSORY_OUTSIDE_DELHI_2027 = ['Holi', 'Ram Navami', 'Janmashtami (Vaishnav)'];
const MOON_SIGHTING = ['Id-ul-Fitr', 'Id-ul-Zuha (Bakrid)', 'Muharram', 'Milad-un-Nabi or Id-e-Milad (Birthday of Prophet Mohammad)'];
const MOON_SIGHTING_2027 = ['Id-ul-Fitr', 'Id-ul-Zuha (Bakrid)', 'Muharram', "Milad-un-Nabi or Id-e-Milad (Prophet Mohammad's Birthday)"];
const HOLIDAY_YEARS = { 2026: { memorandum: /F\.No\.12\/2\/2023-JCA dated 03\.07\.2025/, moon: MOON_SIGHTING }, 2027: { memorandum: /F\.No\.12\/2\/2023-JCA dated 16\.07\.2026/, moon: MOON_SIGHTING_2027 } };

test('holidays come only from the DoPT office memorandum for each year and hold one calendar year each', () => {
  assert.deepEqual(validateRules(HOLIDAY_RULES).problems, []);
  assert.deepEqual([...new Set(HOLIDAY_RULES.map((record) => record.id))].sort(), ['holiday.central-government.compulsory', 'holiday.central-government.delhi']);
  assert.deepEqual([...new Set(HOLIDAY_RULES.map((record) => record.effectiveFrom.slice(0, 4)))].sort(), ['2026', '2027']);
  for (const record of HOLIDAY_RULES) {
    const year = record.effectiveFrom.slice(0, 4);
    assert.deepEqual(record.attestations, []);
    assert.equal(record.effectiveFrom, `${year}-01-01`);
    assert.equal(record.effectiveTo, `${year}-12-31`);
    assert.match(record.source, HOLIDAY_YEARS[year].memorandum);
    const dates = record.value.holidays.map((holiday) => holiday.date);
    assert.deepEqual(dates, [...dates].sort());
    const entries = record.value.holidays.map((holiday) => `${holiday.date} ${holiday.name}`);
    assert.equal(new Set(entries).size, entries.length);
    for (const date of dates) assert.ok(isIsoDate(date) && date.startsWith(`${year}-`), date);
    assert.deepEqual(record.value.moonSightingMayChange, HOLIDAY_YEARS[year].moon);
    const names = record.value.holidays.map((holiday) => holiday.name);
    for (const name of record.value.moonSightingMayChange) assert.ok(names.includes(name), `${record.id} ${year}: ${name}`);
  }
  assert.equal(rule('holiday.central-government.delhi', '2028-01-01').error, 'RULE_NOT_IN_FORCE');
});

test('2027: the Delhi list is Annexure-I of the 16 July 2026 memorandum and the compulsory list its 14 holidays', () => {
  const delhi = valueOn('holiday.central-government.delhi', '2027-06-01').value;
  assert.deepEqual(delhi.holidays, DELHI_2027.map(([date, name]) => ({ date, name })));
  const compulsory = valueOn('holiday.central-government.compulsory', '2027-06-01').value;
  assert.deepEqual(compulsory.holidays, DELHI_2027.filter(([, name]) => !NOT_COMPULSORY_OUTSIDE_DELHI_2027.includes(name)).map(([date, name]) => ({ date, name })));
  assert.equal(compulsory.holidays.length, 14);
  assert.deepEqual(delhi.holidays.filter((holiday) => holiday.date === '2027-08-15').map((holiday) => holiday.name), ['Independence Day', "Milad-un-Nabi or Id-e-Milad (Prophet Mohammad's Birthday)"]);
  assert.equal(delhi.holidays.find((holiday) => holiday.name === 'Diwali (Deepavali)').date, '2027-10-29');
  assert.equal(valueOn('holiday.central-government.delhi', '2026-12-31').value.holidays.at(-1).date, '2026-12-25');
  assert.equal(valueOn('holiday.central-government.delhi', '2027-01-01').value.holidays[0].date, '2027-01-26');
});

test('the Delhi list is Annexure-I and the compulsory list is the 14 holidays every Central Government office observes', () => {
  const delhi = valueOn('holiday.central-government.delhi', '2026-09-21').value;
  assert.deepEqual(delhi.holidays, DELHI_2026.map(([date, name]) => ({ date, name })));
  const compulsory = valueOn('holiday.central-government.compulsory', '2026-09-21').value;
  assert.deepEqual(compulsory.holidays, DELHI_2026.filter(([, name]) => !NOT_COMPULSORY_OUTSIDE_DELHI.includes(name)).map(([date, name]) => ({ date, name })));
  assert.equal(compulsory.holidays.length, 14);
});

const GOLDEN = new URL('../golden/deadlines.json', import.meta.url);

function iso(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftMonth(year, month, offset) {
  const index = year * 12 + (month - 1) + offset;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function isPeriodEnd(periodEnd, period) {
  if (!isIsoDate(periodEnd)) return false;
  const [year, month, day] = periodEnd.split('-').map(Number);
  if (isIsoDate(iso(year, month, day + 1))) return false;
  if (period === 'month') return true;
  if (period === 'quarter') return month % 3 === 0;
  return period === 'year' && month === 3;
}

function resolveDueDate(input) {
  const { rule: id, periodEnd, stateCode = null, instalment = null } = input;
  const found = rule(id, periodEnd);
  if (!found.ok) return { error: found.error };
  const value = found.value;
  if (!isPeriodEnd(periodEnd, value.period)) return { error: 'PERIOD_END_INVALID' };
  const [year, month] = periodEnd.split('-').map(Number);
  if (value.onlyQuarterMonths && !value.onlyQuarterMonths.includes(((month - 1) % 3) + 1)) return { error: 'NOT_DUE_FOR_PERIOD' };
  let dueDate;
  if (value.instalments) {
    const entry = Number.isInteger(instalment) ? value.instalments[instalment - 1] : undefined;
    if (!entry) return { error: 'INSTALMENT_INVALID' };
    dueDate = iso(entry.month >= 4 ? year - 1 : year, entry.month, entry.day);
  } else {
    const timing = (value.overrides ?? []).find((override) => override.periodEndMonth === month) ?? value;
    let day = timing.day;
    if (value.dayByState) {
      if (stateCode === null) return { error: 'STATE_CODE_REQUIRED' };
      const group = value.dayByState.find((candidate) => candidate.states.some((state) => state.code === stateCode));
      if (!group) return { error: 'STATE_NOT_LISTED' };
      day = group.day;
    }
    const target = shiftMonth(year, month, timing.monthsAfterPeriodEnd);
    dueDate = iso(target.year, target.month, day);
    if (!isIsoDate(dueDate)) return { error: 'DAY_INVALID' };
  }
  const extension = rule(`${EXTENSION_PREFIX}${id.slice('due-date.'.length)}.${periodEnd}`, periodEnd);
  if (extension.ok) {
    const moved = extension.value.dueDates.find((entry) => entry.stateCodes === null || entry.stateCodes.includes(stateCode));
    if (moved) dueDate = moved.dueDate;
  }
  return { dueDate };
}

test('golden deadlines for FY 2026-27 (and the FY 2025-26 returns still open) pass against the registry', async () => {
  const result = await runGolden(GOLDEN, resolveDueDate);
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
  assert.ok(result.total >= 100, `only ${result.total} golden cases`);
});

test('the golden deadlines cover every due-date rule, a full year of each monthly return, and weekend days left unmoved', () => {
  const { cases } = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const covered = new Set(cases.map((goldenCase) => goldenCase.input.rule));
  for (const id of BASE_DUE_DATE_IDS.filter((candidate) => candidate !== 'due-date.rollover')) assert.ok(covered.has(id), id);
  for (const id of ['due-date.gst.gstr-1.monthly', 'due-date.gst.gstr-3b.monthly', 'due-date.gst.gstr-7', 'due-date.tds.deposit', 'due-date.pf.contribution']) {
    const periodEnds = cases.filter((goldenCase) => goldenCase.input.rule === id && goldenCase.input.periodEnd >= '2026-04-01' && goldenCase.input.periodEnd <= '2027-03-31').map((goldenCase) => goldenCase.input.periodEnd);
    assert.equal(new Set(periodEnds).size, 12, id);
  }
  for (const goldenCase of cases) {
    assert.ok(typeof goldenCase.citation === 'string' && goldenCase.citation.length > 10, goldenCase.name);
    const keys = Object.keys(goldenCase.expected);
    assert.ok(keys.length === 1 && (keys[0] === 'dueDate' || keys[0] === 'error'), goldenCase.name);
  }
  const dueDates = cases.map((goldenCase) => goldenCase.expected.dueDate);
  for (const weekendDay of ['2026-10-31', '2027-01-31', '2027-10-31']) assert.ok(dueDates.includes(weekendDay), weekendDay);
});
