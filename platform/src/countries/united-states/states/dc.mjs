import { whole, positive, ratio, check, lineTable, otherStateCreditLimit } from '../state-kit.mjs';

function scheduleTax(amount, bands) {
  const cents = whole(amount) * 100;
  if (cents <= 0) return 0;
  let units = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const over = bands[index].overCents;
    const next = index + 1 < bands.length ? bands[index + 1].overCents : Infinity;
    if (cents > over) units += (Math.min(cents, next) - over) * bands[index].rateBp;
  }
  return Math.floor((units + 500000) / 1000000);
}

function dcTax(amount, rule, table) {
  const taxable = whole(amount);
  if (taxable <= 0) return 0;
  if (taxable < table.below) return table.taxByRow[Math.floor(taxable / table.rowWidth)];
  return scheduleTax(taxable, rule.bands);
}

function standardDeduction(ctx, deductions) {
  const status = ctx.filingStatus;
  const base = deductions.standard[status] ?? deductions.standard.single;
  const unmarried = status === 'single' || status === 'hoh';
  const boxes = ctx.filers.filter((item) => item.age !== null && item.age >= 65).length + ctx.filers.filter((item) => item.blind).length;
  return { base, boxes, additional: boxes * (unmarried ? deductions.additional.unmarried : deductions.additional.married) };
}

function childlessEitc(ctx, credits, earned) {
  const rules = credits.childless;
  const agi = ctx.income.agi;
  if (earned <= 0 || earned > rules.incomeLimit || agi > rules.incomeLimit) return { amount: 0, reason: 'income' };
  if (ctx.filers.some((item) => item.canBeClaimedAsDependent)) return { amount: 0, reason: 'dependent' };
  if (!ctx.filers.some((item) => item.age !== null && item.age >= rules.minAge && item.age <= rules.maxAge)) return { amount: 0, reason: 'age' };
  const income = ctx.income;
  const investment = income.taxableInterest + income.taxExemptInterest + income.ordinaryDividends + Math.max(0, income.capitalGain);
  if (investment > rules.investmentIncomeLimit) return { amount: 0, reason: 'investment' };
  const tentativeUnits = earned < rules.earnedCap ? earned * rules.rateBp : rules.maximum * 10000;
  const line4 = Math.max(earned, agi);
  const reductionUnits = line4 < rules.phaseoutStart ? 0 : (line4 - rules.phaseoutStart) * rules.phaseoutRateBp;
  return { amount: Math.max(0, Math.round((tentativeUnits - reductionUnits) / 10000)), reason: '' };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const table = reader.read('tax-table');
  const deductions = reader.read('deductions');
  const credits = reader.read('credits');
  if (!rule || !table || !deductions || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no District of Columbia figures for ${ctx.taxYear}.` };
  const checks = [];
  if (filing.residency === 'nonresident') {
    checks.push(check('info', 'DC_NONRESIDENT_NOT_TAXED', 'The District does not tax the income of nonresidents. If DC tax was withheld, Form D-40B (Nonresident Request for Refund) gets it back.'));
    return {
      form: 'D-40B',
      lines: lineTable({ withheld: filing.payments.withheld }),
      schedules: {},
      stateIncome: 0,
      taxableIncome: 0,
      taxBeforeCredits: 0,
      nonrefundableCredits: [],
      otherStateCredit: 0,
      otherTaxes: [],
      totalTax: 0,
      refundableCredits: [],
      checks,
      notes: ['Nonresidents of the District owe no DC income tax; only a refund of DC tax withheld is claimed.'],
    };
  }
  const answers = filing.answers;
  const income = ctx.income;
  const partYear = filing.residency === 'part-year';
  const sourced = filing.sourced;
  const status = ctx.filingStatus;
  const days = filing.residentDays;
  const dayFactor = partYear ? ratio(days, ctx.daysInYear, { places: 4 }) : 1;
  const line4 = income.agi;
  const exempt = income.taxExemptInterest;
  const dcBond = answers.dcBondInterest;
  if (exempt > 0 && (dcBond === undefined || dcBond === null)) checks.push(check('warning', 'DC_BOND_INTEREST_ASSUMED', 'All of your tax-exempt interest was treated as interest on bonds of other states, which the District taxes from 2025 (Schedule I, Calculation A). Interest on DC bonds is not added.', 'Say how much of your tax-exempt interest is from DC or U.S. territory bonds.'));
  const otherStateBonds = Math.max(0, exempt - Math.min(exempt, positive(dcBond)));
  const line6 = partYear ? Math.round(otherStateBonds * filing.share) : otherStateBonds;
  const line5 = 0;
  const line7 = line4 + line5 + line6;
  const line8 = partYear ? Math.max(0, line4 - filing.sourcedAgi) : 0;
  const pick = (key) => (partYear ? whole(sourced[key]) : whole(income[key]));
  const line9 = pick('stateRefundTaxable');
  const line10 = pick('socialSecurityTaxable');
  const line13 = pick('unemployment');
  const calcB1 = pick('usObligationInterest');
  const line14 = calcB1;
  const line15 = line8 + line9 + line10 + line13 + line14;
  const line16 = line7 - line15;
  const std = standardDeduction(ctx, deductions);
  let line17 = 'standard';
  let line18;
  let calc = null;
  if (ctx.itemized.federalItemized && ctx.itemized.federalScheduleA) {
    line17 = 'itemized';
    const scheduleA = ctx.itemized.federalScheduleA;
    const over = status === 'mfs' ? deductions.itemizedLimit.over.mfs : deductions.itemizedLimit.over.other;
    const share = (amount) => (partYear ? Math.round(whole(amount) * dayFactor) : whole(amount));
    const total = ctx.itemized.federalAllowed;
    const resident = share(total);
    const salt = share(scheduleA['7']);
    const realEstate = share(scheduleA['5b']);
    const before = resident - salt + realEstate;
    let allowed = before;
    let limit = {};
    if (line16 > over) {
      const protectedPart = share(scheduleA['4']);
      const excess = line16 - over;
      const reduction = Math.round((excess * deductions.itemizedLimit.rateBp) / 10000);
      const rest = Math.max(0, before - protectedPart - reduction);
      allowed = protectedPart + rest;
      limit = { g: protectedPart, h: before - protectedPart, i: line16, j: over, k: excess, l: reduction, m: rest, n: allowed };
    }
    calc = partYear
      ? { name: 'D', lines: lineTable({ a: total, b: resident, c: salt, d: resident - salt, e: realEstate, f: 0, g: before, ...Object.fromEntries(Object.entries(limit).map(([key, value]) => [`limit.${key}`, value])) }) }
      : { name: 'F', lines: lineTable({ a: total, b: salt, c: total - salt, d: realEstate, e: 0, f: before, ...limit }) };
    line18 = allowed;
    if (partYear) checks.push(check('warning', 'DC_ITEMIZED_PRORATED', 'Itemized deductions for the part of the year you lived in DC were estimated by the days you lived there (Calculation D wants the amounts actually paid while a resident).', 'Check the resident-period amounts on Calculation D.'));
  } else {
    const full = std.base + std.additional;
    line18 = partYear ? Math.round(full * dayFactor) : full;
  }
  const line19 = Math.max(0, line16 - line18);
  const line20 = dcTax(line19, rule, table);
  const line21 = Math.round((positive(answers.federalChildCareCredit) * credits.childCareBp * (partYear ? dayFactor : 1)) / 10000);
  let otherState = 0;
  const calcK = [];
  for (const other of filing.otherStates || []) {
    const credit = otherStateCreditLimit({ residentTax: line20, residentIncome: line16, doubleTaxedIncome: other.income, otherStateTax: other.tax });
    calcK.push({ state: other.state, income: positive(other.income), dcAgi: line16, dcTax: line20, otherTax: positive(other.tax), credit });
    otherState += credit;
  }
  const line22 = otherState;
  const line23 = line21 + line22;
  const line24 = Math.max(0, line20 - line23);
  const line25 = 0;
  const line26 = line24 + line25;
  const federalEic = whole(ctx.federal.lines['27']);
  const eicSchedule = ctx.federal.schedules?.EIC;
  const children = whole(eicSchedule?.qualifyingChildren);
  const earned = whole(eicSchedule?.earnedIncome ?? (income.wages + Math.max(0, income.businessIncome)));
  const line27d = children > 0 ? Math.round(((federalEic * credits.eitcWithChildBp) / 10000) * dayFactor) : 0;
  const childless = children > 0 ? { amount: 0 } : childlessEitc(ctx, credits, earned);
  const line27e = children > 0 ? 0 : Math.round(childless.amount * dayFactor);
  const ptc = credits.propertyTaxCredit;
  const claimed = positive(answers.propertyTaxCredit);
  const oldest = Math.max(...ctx.filers.map((item) => item.age ?? 0));
  const agiLimit = oldest >= 70 ? ptc.agiLimitAge70 : ptc.agiLimit;
  let line28 = 0;
  if (claimed) {
    if (line4 > agiLimit) checks.push(check('warning', 'DC_SCHEDULE_H_INCOME', `The property tax credit (Schedule H) is not allowed when federal AGI is above $${agiLimit.toLocaleString('en-US')}, so it is left out.`));
    else {
      line28 = Math.min(claimed, ptc.maximum);
      if (claimed > ptc.maximum) checks.push(check('info', 'DC_SCHEDULE_H_MAXIMUM', `The property tax credit is limited to $${ptc.maximum.toLocaleString('en-US')}.`));
      checks.push(check('info', 'DC_SCHEDULE_H', 'Attach Schedule H with the property tax or rent figures behind the credit you entered.'));
    }
  }
  const line29 = 0;
  const line30 = line27d + line27e + line28 + line29;
  if (!children && earned > 0 && childless.amount === 0 && federalEic === 0 && childless.reason === 'age') checks.push(check('info', 'DC_EITC_AGE', 'The DC EITC for workers without a qualifying child needs you (or your spouse) to be 25 to 64 at the end of the year.'));
  checks.push(check('info', 'DC_HEALTH_COVERAGE', 'MyCA assumes everyone on the return had qualifying health coverage all year (Line 25 is $0). Without it, Schedule HSR adds a shared responsibility payment.'));
  const lines = lineTable({
    a: income.wages, b: income.businessIncome, c: income.capitalGain, d: 0, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: 0, 12: 0, 13: line13, 14: line14, 15: line15, 16: line16,
    17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 24: line24, 25: line25, 26: line26,
    '27a': children, '27b': earned, '27c': children > 0 ? federalEic : 0, '27d': line27d, '27e': line27e, 28: line28, 29: line29, 30: line30,
    31: filing.payments.withheld, 32: filing.payments.estimated, 33: filing.payments.extension,
  });
  const schedules = {
    I: lineTable({ 'A.otherStateBonds': line6, 'A.9': line6, 'B.1': calcB1, 'B.16': line14 }),
    ...(calc ? { [`Calculation ${calc.name}`]: calc.lines } : {}),
    ...(partYear && !calc ? { 'Calculation C': lineTable({ a: std.base + std.additional, b: days, c: dayFactor, d: line18 }) } : {}),
    ...(!calc && std.boxes ? { 'S Calculation G-1': lineTable({ boxes: std.boxes, additional: std.additional }) } : {}),
    ...(calcK.length ? { 'Calculation K': calcK, U: lineTable({ '1a.2': line22, '1a.7': line22 }) } : {}),
  };
  const used21 = Math.min(line20, line21);
  const used22 = Math.min(line20 - used21, line22);
  return {
    form: 'D-40',
    lines,
    schedules,
    stateIncome: line16,
    taxableIncome: line19,
    taxBeforeCredits: line20,
    nonrefundableCredits: [
      ...(used21 ? [{ code: 'DC_CHILD_CARE', label: 'Child and dependent care credit', amount: used21 }] : []),
      ...(used22 ? [{ code: 'DC_OTHER_STATE', label: 'Tax paid to another state', amount: used22 }] : []),
    ],
    otherStateCredit: used22,
    otherTaxes: [],
    totalTax: line26,
    refundableCredits: [
      ...(line27d + line27e ? [{ code: 'DC_EITC', label: 'DC earned income tax credit', amount: line27d + line27e }] : []),
      ...(line28 ? [{ code: 'DC_PROPERTY_TAX', label: 'Property tax credit (Schedule H)', amount: line28 }] : []),
    ],
    checks,
  };
}

const RESIDENT_LABELS = Object.freeze({
  a: 'Wages, salaries, unemployment compensation and tips',
  b: 'Business income or loss',
  c: 'Capital gain or loss',
  d: 'Rental real estate, royalties, partnerships, etc.',
  4: 'Federal adjusted gross income',
  5: 'Franchise tax deducted on federal forms',
  6: 'Other additions from DC Schedule I, Calculation A',
  7: 'Total income and additions',
  8: 'Part-year residents: income received while a nonresident',
  9: 'Taxable refunds of state and local income tax',
  10: 'Taxable social security and tier 1 railroad retirement',
  11: 'Income taxed on a DC franchise or fiduciary return',
  12: 'DC and federal government survivor benefits',
  13: 'Unemployment insurance benefits',
  14: 'Other subtractions from DC Schedule I, Calculation B',
  15: 'Total subtractions from DC income',
  16: 'DC adjusted gross income',
  17: 'Deduction type',
  18: 'DC deduction amount',
  19: 'DC taxable income',
  20: 'Tax',
  21: 'Credit for child and dependent care expenses',
  22: 'Non-refundable credits from DC Schedule U',
  23: 'Total non-refundable credits',
  24: 'Tax after non-refundable credits',
  25: 'DC health care shared responsibility',
  26: 'Total tax and DC health care shared responsibility',
  '27a': 'Number of qualified EITC children',
  '27b': 'Earned income amount',
  '27c': 'Federal EITC (filers with qualifying children)',
  '27d': 'DC EITC for filers with qualifying children',
  '27e': 'DC EITC for filers without qualifying children',
  28: 'Property tax credit (Schedule H)',
  29: 'Refundable credits from DC Schedule U',
  30: 'Total refundable credits',
  31: 'DC income tax withheld',
  32: 'Estimated tax payments',
  33: 'Tax paid with Form FR-127 extension',
});

const NONRESIDENT_LABELS = Object.freeze({ withheld: 'DC income tax withheld to be refunded' });

const labels = (taxYear, residency) => (residency === 'nonresident' ? NONRESIDENT_LABELS : RESIDENT_LABELS);

export const STATE = Object.freeze({
  code: 'DC',
  name: 'District of Columbia',
  built: true,
  forms: Object.freeze({ resident: 'D-40', partYear: 'D-40 (part-year)', nonresident: 'D-40B' }),
  questions: Object.freeze([
    Object.freeze({ id: 'dcBondInterest', when: Object.freeze({ residency: ['full-year', 'part-year'], has: ['taxExemptInterest'] }), kind: 'amount', text: 'Tax-exempt interest from District of Columbia or U.S. territory bonds', help: 'From 2025 the District taxes interest on bonds of other states (Schedule I, Calculation A); DC and territory bond interest stays exempt. Enter 0 if none.' }),
    Object.freeze({ id: 'federalChildCareCredit', when: Object.freeze({ residency: ['full-year', 'part-year'] }), kind: 'amount', text: 'Federal child and dependent care credit (Form 2441 line 11)', help: 'DC gives 32% of it on Line 21.' }),
    Object.freeze({ id: 'propertyTaxCredit', when: Object.freeze({ residency: ['full-year', 'part-year'] }), kind: 'amount', text: 'Property tax credit from your DC Schedule H (homeowner or renter)', help: 'Work it out on Schedule H with your property tax or rent; the credit is at most $1,425 and is refundable.' }),
  ]),
  labels,
  notCovered: Object.freeze([
    'Schedule I additions and subtractions other than other-state bond interest and U.S. obligation interest (for example DC 529 contributions, DC and federal survivor benefits, and income taxed on a DC franchise or fiduciary return)',
    'Working out the Schedule H property tax credit itself (MyCA uses the amount you enter)',
    'Schedule ELC Keep Child Care Affordable Tax Credit, Schedule N non-custodial parent EITC and the other Schedule U credits',
    'Schedule HSR health care shared responsibility payment',
    'Married filing separately on the same return (Calculation J) and the D-30 unincorporated business franchise tax',
    'Credit for tax paid to another state on a part-year return',
  ]),
  compute,
});
