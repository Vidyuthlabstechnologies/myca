import { rules } from './sprint-load.mjs';
import { form1040Amount } from './us-line-map.mjs';

export const ORIGINAL_FIGURES = Object.freeze({
  agi: { line: '1', label: 'Adjusted gross income (Form 1040 line 11; 11b from 2025)', negative: true },
  deduction: { line: '2', label: 'Standard or itemized deduction (line 12; 12e from 2025, with 12f from 2026)' },
  qbiDeduction: { line: '4a', label: 'Qualified business income deduction (line 13a; 13b from 2026)' },
  schedule1ADeduction: { line: '4b', label: 'Schedule 1-A deductions (line 13b; 13a from 2026)' },
  taxableIncome: { line: '5', label: 'Taxable income (line 15)' },
  tax: { line: '6', label: 'Tax (line 18)' },
  credits: { line: '7', label: 'Nonrefundable credits (line 21)' },
  otherTaxes: { line: '10', label: 'Other taxes (line 23)' },
  totalTax: { line: '11', label: 'Total tax (line 24; 24c from 2026)' },
  withholding: { line: '12', label: 'Federal tax withheld and excess social security (lines 25d and Schedule 3 line 11)' },
  estimatedPayments: { line: '13', label: 'Estimated tax payments (line 26)' },
  eic: { line: '14', label: 'Earned income credit (line 27; 27a from 2025)' },
  refundableCredits: { line: '15', label: 'Other refundable credits (lines 28, 29 and Schedule 3)' },
  refund: { line: '', label: 'Refund (line 35a)' },
  appliedToNextYear: { line: '', label: 'Applied to next year\'s estimated tax (line 36)' },
  amountOwed: { line: '', label: 'Amount owed (line 37)' },
});

export const LINE_TEXT = Object.freeze({
  1: 'Adjusted gross income',
  2: 'Itemized deductions or standard deduction',
  3: 'Subtract line 2 from line 1',
  '4a': 'Qualified business income deduction',
  '4b': 'Deductions for tips, overtime, car loan interest, and seniors from Schedule 1-A',
  5: 'Taxable income',
  6: 'Tax',
  7: 'Nonrefundable credits',
  8: 'Subtract line 7 from line 6',
  10: 'Other taxes',
  11: 'Total tax',
  12: 'Federal income tax withheld and excess social security and tier 1 RRTA tax withheld',
  13: 'Estimated tax payments, including amount applied from prior year\'s return',
  14: 'Earned income credit (EIC)',
  15: 'Refundable credits',
  16: 'Amount paid with extension, with the original return, and after it was filed',
  17: 'Total payments',
  18: 'Overpayment on original return or as previously adjusted by the IRS',
  19: 'Subtract line 18 from line 17',
  20: 'Amount you owe',
  21: 'Amount overpaid on this return',
  22: 'Amount of line 21 you want refunded to you',
  23: 'Amount of line 21 you want applied to next year\'s estimated tax',
  25: 'Your dependent children who lived with you more than half of the year',
  27: 'Other dependents',
});

const CHILDREN = new Set(['son', 'daughter', 'stepchild', 'foster_child', 'grandchild']);
const whole = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function addYears(date, years) {
  const [y, m, d] = date.split('-').map(Number);
  const day = m === 2 && d === 29 && !(((y + years) % 4 === 0 && (y + years) % 100 !== 0) || (y + years) % 400 === 0) ? 28 : d;
  return `${y + years}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function dependentCounts(people = []) {
  const rows = people.map((item) => ({ firstName: String(item.firstName || ''), lastName: String(item.lastName || ''), relationship: String(item.relationship || ''), livedWithYou: Number(item.months ?? 12) > 6 || Boolean(item.bornOrDiedInYear), ctc: Boolean(item.ctcEligible), odc: Boolean(item.odcEligible) && !item.ctcEligible }));
  const children = rows.filter((row) => CHILDREN.has(row.relationship) && row.livedWithYou).length;
  return { children, other: rows.length - children, list: rows };
}

export function figuresOf1040(data, people) {
  const n = (name) => whole(form1040Amount(data, name));
  const excessSocialSecurity = whole(data?.schedules?.['3']?.['11']);
  const dependents = dependentCounts(people || data?.dependents || []);
  return {
    filingStatus: data?.filingStatus || '',
    agi: n('agi'),
    deduction: n('deduction') + n('nonItemizerCharity'),
    qbiDeduction: n('qbiDeduction'),
    schedule1ADeduction: n('additionalDeductions'),
    taxableIncome: n('taxableIncome'),
    tax: n('taxBeforeCredits'),
    credits: n('totalCredits'),
    otherTaxes: n('otherTaxes'),
    totalTax: n('totalTax'),
    withholding: n('withholding') + excessSocialSecurity,
    estimatedPayments: n('estimatedPayments'),
    eic: n('earnedIncomeCredit'),
    refundableCredits: n('additionalChildTaxCredit') + n('aotcRefundable') + n('schedule3Payments') - excessSocialSecurity,
    refund: n('refund'),
    appliedToNextYear: n('appliedToNextYear'),
    amountOwed: n('owed'),
    dependents: { children: dependents.children, other: dependents.other },
    dependentNames: dependents.list.map((row) => `${row.firstName} ${row.lastName}`.trim()),
  };
}

function readRules(taxYear) {
  const onDate = `${taxYear}-12-31`;
  const amended = rules.rule('us.federal.individual.amended-return', onDate);
  const due = rules.rule('us.federal.individual.return-due', onDate);
  return { amended: amended.ok ? amended.value : null, due: due.ok ? due.value : null, used: [amended, due].filter((item) => item.ok).map((item) => `${item.record.id}@${item.record.effectiveFrom}`) };
}

function columns(a, c) {
  return { A: a, B: c - a, C: c };
}

export function form1040X({ taxYear, amendment = {}, amended, amendedDependents = [], today }) {
  const year = String(taxYear || '');
  if (!/^\d{4}$/.test(year)) return { ok: false, error: 'TAX_YEAR_INVALID' };
  if (!isDate(today)) return { ok: false, error: 'TODAY_REQUIRED' };
  const { amended: rule, due, used } = readRules(year);
  if (!rule || !due) return { ok: false, error: 'RULE_NOT_IN_FORCE', taxYear: year };
  const o = amendment.original || {};
  const c = amended || {};
  const checks = [];
  const add = (level, code, message, fix = '') => checks.push({ level, code, message, fix, step: 'amend' });
  const a = (key) => whole(o[key]);
  const k = (key) => whole(c[key]);

  const lines = {};
  lines['1'] = columns(a('agi'), k('agi'));
  lines['2'] = columns(a('deduction'), k('deduction'));
  lines['3'] = columns(lines['1'].A - lines['2'].A, lines['1'].C - lines['2'].C);
  lines['4a'] = columns(a('qbiDeduction'), k('qbiDeduction'));
  lines['4b'] = columns(a('schedule1ADeduction'), k('schedule1ADeduction'));
  lines['5'] = columns(lines['3'].A - lines['4a'].A - lines['4b'].A, Math.max(0, lines['3'].C - lines['4a'].C - lines['4b'].C));
  lines['6'] = columns(a('tax'), k('tax'));
  lines['7'] = columns(a('credits'), k('credits'));
  lines['8'] = columns(Math.max(0, lines['6'].A - lines['7'].A), Math.max(0, lines['6'].C - lines['7'].C));
  lines['10'] = columns(a('otherTaxes'), k('otherTaxes'));
  lines['11'] = columns(lines['8'].A + lines['10'].A, lines['8'].C + lines['10'].C);
  lines['12'] = columns(a('withholding'), k('withholding'));
  lines['13'] = columns(a('estimatedPayments'), k('estimatedPayments'));
  lines['14'] = columns(a('eic'), k('eic'));
  lines['15'] = columns(a('refundableCredits'), k('refundableCredits'));
  const paidAssumed = amendment.paidWithReturn === undefined || amendment.paidWithReturn === null;
  const line16 = Math.max(0, paidAssumed ? a('amountOwed') : whole(amendment.paidWithReturn));
  const line17 = lines['12'].C + lines['13'].C + lines['14'].C + lines['15'].C + line16;
  const line18 = a('refund') + a('appliedToNextYear');
  const line19 = line17 - line18;
  const totalTax = lines['11'].C;
  const line20 = totalTax > line19 ? totalTax - line19 : 0;
  const line21 = totalTax < line19 ? line19 - totalTax : 0;
  const line23 = Math.min(line21, Math.max(0, whole(amendment.applyToNextYear)));
  const line22 = line21 - line23;
  const single = { 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23 };

  if (o.taxableIncome !== undefined && o.taxableIncome !== null && lines['5'].A >= 0 && whole(o.taxableIncome) !== lines['5'].A) add('warning', 'AMENDED_ORIGINAL_TAXABLE_MISMATCH', `The original taxable income given (${whole(o.taxableIncome)}) is not line 1 less lines 2, 4a and 4b (${lines['5'].A}).`, 'Check the original figures against the return as filed.');
  if (o.totalTax !== undefined && o.totalTax !== null && whole(o.totalTax) !== lines['11'].A) add('warning', 'AMENDED_ORIGINAL_TOTAL_TAX_MISMATCH', `The original total tax given (${whole(o.totalTax)}) is not the tax less credits plus other taxes (${lines['11'].A}).`, 'Check the original figures against the return as filed.');
  if (paidAssumed && line16 > 0) add('warning', 'AMENDED_PAYMENT_ASSUMED', `Line 16 assumes the $${line16} owed on the original return was paid in full.`, 'Enter what you actually paid with the original return and after it, without interest or penalties.');

  const originalStatus = String(o.filingStatus || '');
  const status = String(c.filingStatus || '');
  const dueDate = `${Number(year) + 1}-${String(due.month).padStart(2, '0')}-${String(due.day).padStart(2, '0')}`;
  if (originalStatus === 'mfj' && status === 'mfs' && today > dueDate) add('error', 'AMENDED_JOINT_TO_SEPARATE', `A joint return cannot be changed to separate returns after the due date of the original return (${dueDate}).`, 'Keep the joint filing status on the amended return; an executor of a deceased spouse should ask a CPA.');

  const explanation = String(amendment.explanation || '').trim();
  if (!explanation) add('error', 'AMENDED_EXPLANATION_REQUIRED', 'Part II of Form 1040-X must say why you are amending and explain each change.', 'Write the explanation of changes.');

  const filedOn = amendment.originalFiledOn;
  let deadline = null;
  const claim = line21 > 0 || lines['11'].B < 0;
  if (!isDate(filedOn)) add('error', 'AMENDED_FILED_ON_REQUIRED', 'The date the original return was filed decides the deadline for a refund claim.', 'Enter the date the original return was filed.');
  else if (filedOn <= `${year}-12-31` || filedOn > today) add('error', 'AMENDED_FILED_ON_INVALID', `The original ${year} return can only have been filed after ${year} ended and not after today.`, 'Check the filing date.');
  else {
    const deemed = filedOn < dueDate ? dueDate : filedOn;
    const fromFiling = addYears(deemed, rule.refundYearsFromFiling);
    const paidOn = isDate(amendment.lastPaymentOn) && amendment.lastPaymentOn > `${year}-12-31` ? amendment.lastPaymentOn : null;
    const fromPayment = paidOn ? addYears(paidOn, rule.refundYearsFromPayment) : addYears(dueDate, rule.refundYearsFromPayment);
    deadline = { deemedFiledOn: deemed, fromFiling, fromPayment, refundClaimBy: fromFiling > fromPayment ? fromFiling : fromPayment };
    if (claim && today > deadline.refundClaimBy) add('error', 'AMENDED_CLAIM_TOO_LATE', `A refund or credit claim had to be filed by ${deadline.refundClaimBy}: ${rule.refundYearsFromFiling} years from filing (${fromFiling}) or ${rule.refundYearsFromPayment} years from paying the tax (${fromPayment}), whichever is later.`, 'A claim this late is refused unless a disaster postponement or financial disability applies; ask a CPA.');
    else if (claim && today > fromFiling) add('warning', 'AMENDED_REFUND_LIMITED', `More than ${rule.refundYearsFromFiling} years have passed since filing, so the refund is limited to the tax paid in the ${rule.refundYearsFromPayment} years before this claim (IRC 6511(b)(2)(B)).`, '');
  }
  if (line20 > 0) add('warning', 'AMENDED_TAX_DUE', `The amended return shows $${line20} more to pay. Interest runs from the original due date, so pay with the amended return.`, '');

  const currentPeriod = Number(today.slice(0, 4)) - 1;
  const tooOld = Number(year) < currentPeriod - rule.efilePriorPeriods;
  const notOpen = Number(year) > currentPeriod;
  const paperRule = Boolean(amendment.originalPaper) && isDate(filedOn) && filedOn.slice(0, 4) === today.slice(0, 4) && Number(year) < currentPeriod;
  const efile = { allowedByIrs: !tooOld && !notOpen && !paperRule, currentTaxPeriod: currentPeriod, maxElectronicAmendments: rule.efileMaxPerYear, transmittedByMyca: false, reason: notOpen ? `The ${year} filing season has not opened yet.` : tooOld ? `The IRS takes Form 1040-X electronically only for the current tax period (${currentPeriod}) and the ${rule.efilePriorPeriods} before it.` : paperRule ? 'A prior-year return first filed on paper during this processing year must be amended on paper.' : `The IRS takes Form 1040-X electronically for ${year}, up to ${rule.efileMaxPerYear} amended returns a year; MyCA does not transmit it yet, so print it or file it through a tax professional.` };
  if (!efile.allowedByIrs) add('warning', 'AMENDED_PAPER_ONLY', `${efile.reason} Mail the paper Form 1040-X with the corrected Form 1040 and changed schedules.`, '');

  const before = o.dependents || { children: 0, other: 0 };
  const after = dependentCounts(amendedDependents);
  const namesBefore = (o.dependentNames || []).map((name) => String(name).toLowerCase()).sort().join('|');
  const namesAfter = after.list.map((row) => `${row.firstName} ${row.lastName}`.trim().toLowerCase()).sort().join('|');
  const dependentsChanged = whole(before.children) !== after.children || whole(before.other) !== after.other || (Array.isArray(o.dependentNames) && namesBefore !== namesAfter);
  const partI = dependentsChanged ? { 25: columns(whole(before.children), after.children), 27: columns(whole(before.other), after.other), 30: after.list.map((row) => ({ firstName: row.firstName, lastName: row.lastName, relationship: row.relationship, livedWithYou: row.livedWithYou, childTaxCredit: row.ctc, creditForOtherDependents: row.odc })), listedAboveFour: after.list.length > 4 } : null;

  const changed = Object.values(lines).some((row) => row.B !== 0) || dependentsChanged || (originalStatus && status && originalStatus !== status);
  if (!changed) add('warning', 'AMENDED_NO_CHANGE', 'The corrected return shows no change from the original, so there is nothing to amend yet.', 'Change the return (forms, interview or profile) first.');

  return {
    ok: true,
    data: {
      taxYear: year,
      form: 'Form 1040-X (Rev. December 2025)',
      filingStatus: status,
      originalFilingStatus: originalStatus,
      source: amendment.source || 'entered',
      lines,
      lineText: LINE_TEXT,
      payments: single,
      refund: line22,
      appliedToNextYear: line23,
      owed: line20,
      partI,
      partII: explanation,
      deadline,
      dueDate,
      efile,
      checks,
      rulesUsed: used,
      notes: ['Columns A, B and C follow Form 1040-X (Rev. December 2025): A is the original return or as previously adjusted, B the net change, C the corrected amount. Line 9 and lines 24, 26, 28 and 29 are reserved.', 'Attach the corrected Form 1040 and every new or changed schedule. Interest and penalties are left off Form 1040-X; the IRS adjusts them.', 'Deadlines are not moved for weekends, holidays, disaster postponements or combat-zone service.'],
    },
  };
}
