import { whole, positive, rateOf, ratio, check, lineTable, byStatus, bracketTax, sum } from '../state-kit.mjs';
import { incomeByOwner, splitByOwner, applyRatio } from './va-spouses.mjs';

const EARLY_CODES = /[1JS]/;
const COLUMNS = ['A', 'B'];

function statusOf(ctx) {
  if (ctx.filingStatus === 'mfj') return { key: 'mfj', box: 1 };
  if (ctx.filingStatus === 'mfs') return { key: 'mfs', box: 3 };
  if (ctx.filingStatus === 'hoh') return { key: 'hoh', box: 4 };
  if (ctx.filingStatus === 'qss') return ctx.dependents.length ? { key: 'hoh', box: 4, fromQss: true } : { key: 'single', box: 5, fromQss: true };
  return { key: 'single', box: 5 };
}

const formsOf = (ctx, kind) => (ctx.forms || []).filter((form) => form.kind === kind);
const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? positive(form.fields?.grossDistribution) : positive(form.fields?.taxableAmount));

function earlyDistributions(ctx) {
  const rows = formsOf(ctx, '1099-R').filter((form) => EARLY_CODES.test(String(form.fields?.distributionCode || '').toUpperCase()));
  return { taxpayer: sum(rows.filter((form) => ownerOf(form) === 'taxpayer'), taxableOf), spouse: sum(rows.filter((form) => ownerOf(form) === 'spouse'), taxableOf) };
}

function exemptions(ctx, status, rule) {
  const people = [...ctx.filers];
  if (ctx.filingStatus === 'mfs' && ctx.spouse) people.push(ctx.spouse);
  const older = people.filter((item) => item.age !== null && item.age >= 65).length;
  const blind = people.filter((item) => item.blind).length;
  const line7 = ctx.dependents.length;
  const line9 = line7 + older + blind;
  const line10 = line9 * rule.additionalExemption;
  const line11 = byStatus(rule.exemption, status.key);
  return { line7, older, blind, line9, line10, line11, line12: line10 + line11 };
}

function scheduleA(ctx, rule, readItemized, agi) {
  const parts = ctx.itemized;
  const line2a = parts.medicalPaid;
  const line2b = rateOf(Math.max(0, agi), rule.medicalFloorBasisPoints);
  const line2c = Math.max(0, line2a - line2b);
  const incomeOrSales = parts.generalSalesTax > 0 ? parts.generalSalesTax : parts.stateIncomeTaxes;
  const allTaxes = incomeOrSales + parts.realEstateTaxes + parts.personalPropertyTaxes;
  const itemizedRule = allTaxes > 0 ? readItemized() : null;
  if (allTaxes > 0 && !itemizedRule) return null;
  const line3a = itemizedRule ? Math.min(allTaxes, byStatus(itemizedRule.taxesCap, ctx.filingStatus)) : 0;
  const line3b = allTaxes > 0 ? Math.round((line3a * incomeOrSales) / allTaxes) : 0;
  const line3c = Math.max(0, line3a - line3b);
  const fedA = parts.federalScheduleA;
  const line4 = parts.mortgageInterest;
  const line5 = fedA ? whole(fedA['11']) + whole(fedA['12']) : Math.min(parts.charityCash, rateOf(Math.max(0, agi), 6000)) + Math.min(parts.charityNonCash, rateOf(Math.max(0, agi), 3000));
  const line6 = 0;
  const line7a = parts.otherItemized;
  const line7c = line7a;
  const line8 = line2c + line3c + line4 + line5 + line6 + line7c;
  return lineTable({ 1: agi, '2a': line2a, '2b': line2b, '2c': line2c, '3a': line3a, '3b': line3b, '3c': line3c, 4: line4, 5: line5, 6: line6, '7a': line7a, '7b': 0, '7c': line7c, 8: line8 });
}

function allocate(a, b, deduction, exemption, zero) {
  const total = deduction + exemption;
  if (!(a > 0 && b > 0)) return { combined: true, A: { deduction, exemption }, B: { deduction: 0, exemption: 0 } };
  let dA = Math.min(total, Math.max(0, a - zero));
  let rest = total - dA;
  let dB = Math.min(rest, Math.max(0, b - zero));
  rest -= dB;
  const moreA = Math.min(rest, Math.max(0, a - dA));
  dA += moreA;
  rest -= moreA;
  dB += rest;
  const deductionA = Math.min(deduction, dA);
  return { combined: false, A: { deduction: deductionA, exemption: dA - deductionA }, B: { deduction: deduction - deductionA, exemption: exemption - (dA - deductionA) } };
}

function taxSchedule(columns, rule) {
  const [ta, tb] = columns;
  const net = ta > 0 && tb > 0 ? [ta, tb] : [Math.max(0, ta + tb), 0];
  const first = net.map((value) => Math.min(Math.max(0, value), rule.zeroBracket));
  const rest = net.map((value, index) => Math.max(0, value) - first[index]);
  const tax = bracketTax(net[0], rule.brackets) + bracketTax(net[1], rule.brackets);
  return { tax, rows: lineTable({ '1A': first[0], '1B': first[1], '2A': rest[0], '2B': rest[1], '3A': net[0], '3B': net[1], 4: tax }) };
}

function incomeColumns(ctx, filing, byOwner, early) {
  const income = ctx.income;
  const joint = ctx.filingStatus === 'mfj';
  const rentalTotal = whole(ctx.federal.schedules?.[1]?.['5']);
  const rental = splitByOwner(rentalTotal, { taxpayer: 0, spouse: 0 }, joint);
  const nonMsMuni = Math.max(0, income.taxExemptInterest - positive(filing.answers.mississippiBondInterest));
  const muni = splitByOwner(nonMsMuni, { taxpayer: byOwner.taxpayer.interest + byOwner.taxpayer.usInterest, spouse: byOwner.spouse.interest + byOwner.spouse.usInterest }, joint);
  const items = income.adjustmentItems;
  const owners = joint ? ['taxpayer', 'spouse'] : ['taxpayer'];
  const ownerEarly = joint ? early : { taxpayer: early.taxpayer + early.spouse, spouse: 0 };
  const adjustmentTotal = { 50: items.ira, 51: items.seRetirement, 52: items.earlyWithdrawal, 58: items.seHealth, 59: items.hsa, 61: items.seTaxDeduction };
  const guard = { taxpayer: positive(filing.answers.nationalGuardPay), spouse: joint ? positive(filing.answers.spouseNationalGuardPay) : 0 };
  const rows = {};
  for (const owner of owners) {
    const p = byOwner[owner];
    rows[owner] = { 38: p.wages, 39: p.business, 40: p.capitalGain, 41: rental[owner], 42: 0, 43: p.interest + muni[owner], 44: p.dividends, 45: 0, 46: ownerEarly[owner], 47: p.unemployment, 48: p.other };
  }
  return { rows, adjustmentTotal, guard, nonMsMuni };
}

function adjustmentRows(ctx, filing, columns, rule, byOwner) {
  const joint = ctx.filingStatus === 'mfj';
  const owners = joint ? ['taxpayer', 'spouse'] : ['taxpayer'];
  const weights = { taxpayer: Math.max(0, sumIncome(columns.rows.taxpayer)), spouse: joint ? Math.max(0, sumIncome(columns.rows.spouse)) : 0 };
  const macs = Math.min(positive(filing.answers.collegeSavingsContributions), byStatus(rule.collegeSavingsMaximum, ctx.filingStatus));
  const split = (value) => splitByOwner(value, weights, joint);
  const parts = { 50: split(columns.adjustmentTotal[50]), 51: split(columns.adjustmentTotal[51]), 52: split(columns.adjustmentTotal[52]), 57: split(macs), 58: split(columns.adjustmentTotal[58]), 59: split(columns.adjustmentTotal[59]), 61: split(columns.adjustmentTotal[61]) };
  const rows = {};
  for (const owner of owners) {
    const guard = Math.min(columns.guard[owner], rule.nationalGuardMaximum, Math.max(0, byOwner[owner].wages));
    rows[owner] = { 50: parts[50][owner], 51: parts[51][owner], 52: parts[52][owner], 53: 0, 54: 0, 55: guard, 56: 0, 57: parts[57][owner], 58: parts[58][owner], 59: parts[59][owner], 60: 0, 61: parts[61][owner], 62: 0, 63: 0, 64: 0 };
  }
  return rows;
}

const INCOME_LINES = [38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48];
const ADJUSTMENT_LINES = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64];
const sumIncome = (row) => INCOME_LINES.reduce((total, key) => total + whole(row[key]), 0);
const sumAdjustments = (row) => ADJUSTMENT_LINES.reduce((total, key) => total + whole(row[key]), 0);

function sourcedColumn(ctx, filing, early, nonMsMuni) {
  const s = filing.sourced;
  const partYear = filing.residency === 'part-year';
  const share = partYear ? filing.share : 0;
  const rentalTotal = whole(ctx.federal.schedules?.[1]?.['5']);
  const earlyTotal = early.taxpayer + early.spouse;
  return { 38: whole(s.wages), 39: whole(s.businessIncome), 40: whole(s.capitalGain), 41: partYear ? Math.round(rentalTotal * share) : 0, 42: 0, 43: whole(s.taxableInterest) - whole(s.usObligationInterest) + (partYear ? Math.round(nonMsMuni * share) : 0), 44: whole(s.ordinaryDividends), 45: 0, 46: partYear ? Math.round(earlyTotal * share) : 0, 47: whole(s.unemployment), 48: whole(s.otherIncome) };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const credits = reader.read('credits');
  if (!rule || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Mississippi figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const resident = filing.residency === 'full-year';
  const joint = ctx.filingStatus === 'mfj';
  const status = statusOf(ctx);
  const checks = [];
  const notes = [];
  if (status.fromQss) checks.push(check('warning', 'MS_NO_QUALIFYING_SURVIVING_SPOUSE', `Mississippi has no qualifying surviving spouse status; MyCA used ${status.key === 'hoh' ? 'Head of Family' : 'Single'}.`, 'Confirm a dependent lived with you all year if Head of Family is used.'));
  if (status.key === 'hoh' && ctx.dependents.length === 0) checks.push(check('error', 'MS_HEAD_OF_FAMILY_DEPENDENT', 'Head of Family in Mississippi needs a dependent living in your home for the entire year.', 'Add the dependent or file as Single.'));
  const byOwner = incomeByOwner(ctx);
  const early = earlyDistributions(ctx);
  const columns = incomeColumns(ctx, filing, byOwner, early);
  const adjustments = adjustmentRows(ctx, filing, columns, rule, byOwner);
  const owners = joint ? ['taxpayer', 'spouse'] : ['taxpayer'];
  const exemption = exemptions(ctx, status, rule);
  const line15Total = ctx.filingStatus === 'mfs' ? Math.round(exemption.line12 / 2) : exemption.line12;
  const totalAgi = owners.reduce((total, owner) => total + sumIncome(columns.rows[owner]) - sumAdjustments(adjustments[owner]), 0);
  const scheduleAResult = scheduleA(ctx, rule, () => reader.read('itemized'), income.agi);
  if (!scheduleAResult) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Mississippi Schedule A figures for ${ctx.taxYear}.` };
  const standard = byStatus(rule.standardDeduction, status.key);
  const itemize = answers.itemize === 'itemized' || (answers.itemize !== 'standard' && scheduleAResult['8'] > standard);
  const deduction = itemize ? scheduleAResult['8'] : standard;
  if (ctx.filingStatus === 'mfs') checks.push(check('warning', 'MS_SEPARATE_RETURNS_ITEMIZE', 'On Mississippi separate returns, if one spouse itemizes the other must itemize too.', 'Make sure both returns use the same deduction method.'));
  if (income.taxExemptInterest > 0 && answers.mississippiBondInterest === undefined) checks.push(check('warning', 'MS_MUNICIPAL_INTEREST', 'Interest on bonds of other states and their cities is taxable in Mississippi; MyCA treated all your tax-exempt interest as from outside Mississippi.', 'Give the part from Mississippi bonds.'));
  const pensionExempt = income.iraTaxable + income.pensionTaxable - early.taxpayer - early.spouse;
  if (pensionExempt > 0) notes.push(`Retirement income of $${pensionExempt.toLocaleString('en-US')} and Social Security are exempt in Mississippi and left off line 46; only early distributions (1099-R codes 1, J or S) are taxed.`);

  const lines = {};
  const page2 = {};
  let stateIncome;
  let taxable;
  let allocation;
  let schedule;
  let prorationLines = null;
  if (resident) {
    const agiByOwner = Object.fromEntries(owners.map((owner) => [owner, sumIncome(columns.rows[owner]) - sumAdjustments(adjustments[owner])]));
    allocation = allocate(agiByOwner.taxpayer, joint ? agiByOwner.spouse : 0, deduction, line15Total, rule.zeroBracket);
    for (const [index, owner] of owners.entries()) {
      const column = COLUMNS[index];
      for (const key of INCOME_LINES) page2[`${key}${column}`] = whole(columns.rows[owner][key]);
      page2[`49${column}`] = sumIncome(columns.rows[owner]);
      for (const key of ADJUSTMENT_LINES) page2[`${key}${column}`] = whole(adjustments[owner][key]);
      page2[`65${column}`] = sumAdjustments(adjustments[owner]);
      page2[`66${column}`] = agiByOwner[owner];
    }
    const agiA = allocation.combined ? totalAgi : agiByOwner.taxpayer;
    const agiB = allocation.combined ? 0 : agiByOwner.spouse || 0;
    Object.assign(lines, { '13A': agiA, '13B': agiB, '14A': allocation.A.deduction, '14B': allocation.B.deduction, '15A': allocation.A.exemption, '15B': allocation.B.exemption });
    lines['16A'] = Math.max(0, agiA - allocation.A.deduction - allocation.A.exemption);
    lines['16B'] = Math.max(0, agiB - allocation.B.deduction - allocation.B.exemption);
    stateIncome = totalAgi;
  } else {
    const totalRow = {};
    for (const key of [...INCOME_LINES, ...ADJUSTMENT_LINES]) totalRow[key] = owners.reduce((total, owner) => total + whole((INCOME_LINES.includes(key) ? columns.rows : adjustments)[owner][key]), 0);
    const msRow = sourcedColumn(ctx, filing, early, columns.nonMsMuni);
    const line50Total = sumIncome(totalRow);
    const line50Ms = sumIncome(msRow);
    const adjustmentRatio = ratio(line50Ms, line50Total, { places: 4 });
    for (const key of ADJUSTMENT_LINES) msRow[key] = applyRatio(totalRow[key], adjustmentRatio, 4);
    const line67Total = line50Total - sumAdjustments(totalRow);
    const line67Ms = line50Ms - sumAdjustments(msRow);
    const shift = (key) => key + 1;
    for (const key of INCOME_LINES) Object.assign(page2, { [`${shift(key)}total`]: totalRow[key], [`${shift(key)}ms`]: msRow[key] });
    Object.assign(page2, { '50total': line50Total, '50ms': line50Ms });
    for (const key of ADJUSTMENT_LINES) Object.assign(page2, { [`${shift(key)}total`]: totalRow[key], [`${shift(key)}ms`]: msRow[key] });
    Object.assign(page2, { '66total': sumAdjustments(totalRow), '66ms': sumAdjustments(msRow), '67total': line67Total, '67ms': line67Ms });
    const line13c = line67Ms <= 0 ? 0 : ratio(line67Ms, line67Total, { places: 4 });
    const line14b = applyRatio(deduction, line13c, 4);
    const line15b = applyRatio(line15Total, line13c, 4);
    prorationLines = lineTable({ '13a': line67Ms, '13b': line67Total, '13c': line13c, '14a': deduction, '14b': line14b, '15a': line15Total, '15b': line15b });
    let msA = line67Ms;
    let msB = 0;
    if (joint) {
      const msWagesByOwner = { taxpayer: sum(ctx.w2.filter((row) => row.state === 'MS' && row.owner === 'taxpayer'), (row) => (row.stateWages === null ? row.wages : row.stateWages)), spouse: sum(ctx.w2.filter((row) => row.state === 'MS' && row.owner === 'spouse'), (row) => (row.stateWages === null ? row.wages : row.stateWages)) };
      const weights = msWagesByOwner.taxpayer + msWagesByOwner.spouse > 0 ? msWagesByOwner : { taxpayer: Math.max(0, sumIncome(columns.rows.taxpayer)), spouse: Math.max(0, sumIncome(columns.rows.spouse)) };
      const split = splitByOwner(line67Ms, weights, true);
      msA = split.taxpayer;
      msB = split.spouse;
      page2['68A'] = msA;
      page2['68B'] = msB;
    }
    allocation = allocate(msA, msB, line14b, line15b, rule.zeroBracket);
    const agiA = allocation.combined ? line67Ms : msA;
    const agiB = allocation.combined ? 0 : msB;
    Object.assign(lines, prorationLines, { '16A': agiA, '16B': agiB, '17A': allocation.A.deduction, '17B': allocation.B.deduction, '18A': allocation.A.exemption, '18B': allocation.B.exemption });
    lines['19A'] = Math.max(0, agiA - allocation.A.deduction - allocation.A.exemption);
    lines['19B'] = Math.max(0, agiB - allocation.B.deduction - allocation.B.exemption);
    stateIncome = line67Ms;
    if (filing.residency === 'part-year' && itemize) checks.push(check('info', 'MS_PART_YEAR_ITEMIZED', 'Part-year residents may itemize only expenses paid while a Mississippi resident; MyCA used the full Schedule A before the ratio.', 'Reduce Schedule A to the expenses paid while a resident if they differ.'));
  }
  const taxableA = resident ? lines['16A'] : lines['19A'];
  const taxableB = resident ? lines['16B'] : lines['19B'];
  schedule = taxSchedule([taxableA, taxableB], rule);
  taxable = Math.max(0, schedule.rows['3A'] + schedule.rows['3B']);
  const taxDue = schedule.tax;
  if (joint && !allocation.combined) notes.push('Combined return: each spouse\'s income is in its own column and the standard or itemized deduction and the exemption are divided between the columns so that both use the $10,000 taxed at 0%.');

  let otherStateCredit = 0;
  const form80160 = [];
  if (resident && filing.otherStates.length) {
    const reported = answers.otherStateTaxableIncome;
    const otherTotal = reported === undefined ? filing.otherStates.reduce((total, other) => total + positive(other.income), 0) : positive(reported);
    if (reported === undefined) checks.push(check('warning', 'MS_OTHER_STATE_TAXABLE_INCOME', 'Form 80-160 applies Mississippi rates to the taxable income reported to the other state; MyCA used the other state\'s income because its taxable income was not given.', 'Give the taxable income from the other state\'s return.'));
    const incomeEverywhere = filing.otherStates.reduce((total, other) => total + positive(other.income), 0);
    const line6A = Math.min(otherTotal, rule.zeroBracket);
    const line7A = Math.max(0, otherTotal - line6A);
    const line7B = bracketTax(otherTotal, rule.brackets);
    let line10 = 0;
    for (const other of filing.otherStates) {
      const share = ratio(positive(other.income), incomeEverywhere, { places: 4 });
      const line8 = applyRatio(line7B, share, 4);
      const line9 = positive(other.tax);
      const allowed = Math.min(line8, line9);
      line10 += allowed;
      form80160.push({ state: other.state, lines: lineTable({ 1: positive(other.income), 5: share, 8: line8, 9: line9, 10: allowed }) });
    }
    otherStateCredit = Math.min(line10, taxDue);
    form80160.push({ state: 'total', lines: lineTable({ '4': otherTotal, '6A': line6A, '7A': line7A, '7B': line7B, 10: line10, 11: taxDue, 12: otherStateCredit }) });
    checks.push(check('info', 'MS_FORM_80_160', 'Attach Form 80-160 and a complete copy of the other state\'s return; withholding statements are not proof of tax paid.'));
  }
  const federalCare = whole(ctx.federal.schedules?.[3]?.['2']);
  const careCredit = federalCare > 0 && income.agi <= credits.dependentCareAgiLimit ? rateOf(federalCare, credits.dependentCareBasisPoints) : 0;
  const afterOtherState = Math.max(0, taxDue - otherStateCredit);
  const otherCredits = Math.min(careCredit, afterOtherState);
  const netTax = Math.max(0, afterOtherState - otherCredits);
  const useTax = positive(answers.useTax);
  if (answers.useTax === undefined) checks.push(check('info', 'MS_USE_TAX', 'Mississippi consumer use tax (7%) is due on out-of-state purchases with no sales tax paid.', 'Answer the use tax question (0 if none).'));
  const totalTax = netTax + useTax;
  const withheld = filing.payments.withheld;
  const estimated = filing.payments.estimated + filing.payments.extension;
  const payments = withheld + estimated;
  if (resident) {
    Object.assign(lines, { 7: exemption.line7, 9: exemption.line9, 10: exemption.line10, 11: exemption.line11, 12: exemption.line12, 17: taxDue, 18: otherStateCredit, 19: otherCredits, 20: netTax, 21: useTax, 22: 0, 23: totalTax, 24: withheld, 25: estimated, 26: 0, 27: 0, 28: payments, 29: Math.max(0, payments - totalTax), 35: Math.max(0, totalTax - payments) });
  } else {
    Object.assign(lines, { 7: exemption.line7, 9: exemption.line9, 10: exemption.line10, 11: exemption.line11, 12: exemption.line12, 20: taxDue, 21: otherCredits, 22: netTax, 23: useTax, 24: 0, 25: totalTax, 26: withheld, 27: estimated, 28: 0, 29: 0, 30: payments, 31: Math.max(0, payments - totalTax), 36: Math.max(0, totalTax - payments) });
  }
  lines.filingStatus = status.box;
  return {
    form: resident ? '80-105' : '80-205',
    lines: lineTable(lines),
    schedules: {
      'page-2': lineTable(page2),
      'tax-computation': schedule.rows,
      ...(itemize ? { '80-108-A': scheduleAResult } : {}),
      ...(form80160.length ? { '80-160': form80160 } : {}),
      ...(careCredit ? { '80-401': lineTable({ code44: otherCredits, federalCredit: federalCare }) } : {}),
    },
    stateIncome,
    taxableIncome: taxable,
    taxBeforeCredits: taxDue,
    nonrefundableCredits: [...(otherStateCredit ? [{ code: 'MS_OTHER_STATE', label: 'Credit for tax paid to another state', amount: otherStateCredit }] : []), ...(otherCredits ? [{ code: 'MS_DEPENDENT_CARE', label: 'Dependent care credit', amount: otherCredits }] : [])],
    otherStateCredit,
    otherTaxes: useTax ? [{ code: 'MS_USE_TAX', label: 'Consumer use tax', amount: useTax }] : [],
    totalTax,
    refundableCredits: [],
    checks,
    notes,
  };
}

export const STATE = Object.freeze({
  code: 'MS',
  name: 'Mississippi',
  built: true,
  forms: Object.freeze({ resident: '80-105', partYear: '80-205', nonresident: '80-205' }),
  questions: Object.freeze([
    Object.freeze({ id: 'mississippiBondInterest', kind: 'amount', text: 'Tax-exempt interest from Mississippi state or local bonds', help: 'Interest on bonds of other states and their cities is taxable in Mississippi; Mississippi bond interest is not. Enter 0 if none.' }),
    Object.freeze({ id: 'itemize', kind: 'choice', options: ['automatic', 'standard', 'itemized'], text: 'Standard or itemized deduction on the Mississippi return', help: 'Mississippi lets you itemize even if you took the federal standard deduction. Automatic picks the larger.' }),
    Object.freeze({ id: 'nationalGuardPay', kind: 'amount', text: 'Your National Guard or Reserve pay included in wages', help: 'Up to $15,000 is excluded on line 55.' }),
    Object.freeze({ id: 'spouseNationalGuardPay', kind: 'amount', text: 'Your spouse\'s National Guard or Reserve pay included in wages', help: 'Up to $15,000 per person is excluded.' }),
    Object.freeze({ id: 'collegeSavingsContributions', kind: 'amount', text: 'Contributions to a Mississippi Affordable College Savings (MACS) account in the year', help: 'Deductible up to $20,000 on a joint return and $10,000 otherwise.' }),
    Object.freeze({ id: 'otherStateTaxableIncome', kind: 'amount', text: 'Taxable income reported on your other state return(s)', help: 'Form 80-160 applies Mississippi rates to this amount to limit the credit for tax paid to another state.' }),
    Object.freeze({ id: 'useTax', kind: 'amount', text: 'Mississippi consumer use tax owed on out-of-state purchases', help: '7% of purchases used in Mississippi on which no sales tax was paid. Enter 0 if none.' }),
  ]),
  notCovered: Object.freeze([
    'Farm income (line 42), alimony (lines 45 and 53), moving expenses, MPACT, catastrophe, first-time home buyer, health savings and ABLE account deductions other than the federal HSA deduction',
    'Schedule N items such as net operating losses and gambling winnings, and Mississippi K-1 income that differs from federal',
    'Rental income of nonresidents and income-by-owner splits other than by the forms\' owner',
    'Form 80-401 business and charitable credits other than the dependent care credit',
    'Credit for tax paid on an electing pass-through entity return (Form 80-161) and the catastrophe savings tax',
    'Underpayment interest (Form 80-320), refund contributions and the Married - Spouse Died filing status',
  ]),
  compute,
});
