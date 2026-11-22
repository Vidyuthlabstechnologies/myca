import { whole, positive, ratio, check, lineTable, sum } from '../state-kit.mjs';

const COUNTIES = Object.freeze(['allegany', 'anne-arundel', 'baltimore-city', 'baltimore-county', 'calvert', 'caroline', 'carroll', 'cecil', 'charles', 'dorchester', 'frederick', 'garrett', 'harford', 'howard', 'kent', 'montgomery', 'prince-georges', 'queen-annes', 'st-marys', 'somerset', 'talbot', 'washington', 'wicomico', 'worcester']);
const JOINT_TABLE = new Set(['mfj', 'hoh', 'qss']);

function unitsOn(cents, bands) {
  let units = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const over = bands[index].overCents;
    const next = index + 1 < bands.length ? bands[index + 1].overCents : Infinity;
    if (cents > over) units += (Math.min(cents, next) - over) * bands[index].rateBp;
  }
  return units;
}

const unitsToDollars = (units) => Math.floor((units + 500000) / 1000000);
const exactTax = (amount, bands) => (whole(amount) > 0 ? unitsToDollars(unitsOn(whole(amount) * 100, bands)) : 0);

function tableTax(amount, bands, below) {
  const taxable = whole(amount);
  if (taxable <= 0) return 0;
  if (taxable >= below) return exactTax(taxable, bands);
  if (taxable < 50) return 0;
  const midpointCents = taxable < 75 ? 6250 : taxable < 100 ? 8750 : Math.floor(taxable / 50) * 5000 + 2500;
  return unitsToDollars(unitsOn(midpointCents, bands));
}

const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const formsOf = (ctx, kind) => (ctx.forms || []).filter((form) => form.kind === kind);
const taxableOf = (form) => positive(form.fields?.taxableAmount ?? form.fields?.grossDistribution);

function monthsResident(filing) {
  if (filing.residency === 'full-year') return 12;
  const from = /^\d{4}-\d{2}/.test(filing.from) ? filing.from : `${filing.taxYear}-01-01`;
  const to = /^\d{4}-\d{2}/.test(filing.to) ? filing.to : `${filing.taxYear}-12-31`;
  const months = (Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7))) - (Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7))) + 1;
  return Math.min(12, Math.max(0, months));
}

function exemptions(ctx, rule, agi) {
  const table = JOINT_TABLE.has(ctx.filingStatus) ? rule.exemptionByAgi.joint : rule.exemptionByAgi.other;
  const row = table.find((item) => agi <= item.agiUpTo);
  const each = row ? row.amount : 0;
  const dependentFiler = ctx.filers.some((item) => item.canBeClaimedAsDependent);
  const a = dependentFiler ? 0 : ctx.filers.length;
  const b = ctx.filers.filter((item) => item.age !== null && item.age >= 65).length + ctx.filers.filter((item) => item.blind).length;
  const c = ctx.dependents.length + ctx.dependents.filter((item) => item.age !== null && item.age >= 65).length;
  return { a, b, c, each, total: (a + c) * each + b * rule.ageOrBlindExemption };
}

function localRate(local, county, status, taxable) {
  if (county === 'anne-arundel') return { kind: 'anne-arundel', eicBp: local.anneArundel.eicRateBp, bands: JOINT_TABLE.has(status) ? local.anneArundel.joint : local.anneArundel.other };
  if (county === 'frederick') {
    const rows = JOINT_TABLE.has(status) ? local.frederick.joint : local.frederick.other;
    const row = rows.find((item) => item.upTo === null || taxable <= item.upTo);
    return { kind: 'flat', bp: row.rateBp, eicBp: row.rateBp };
  }
  const bp = local.flatRatesBp[county];
  return bp === undefined ? null : { kind: 'flat', bp, eicBp: bp };
}

function localTaxOn(rate, taxable, below) {
  if (!rate || taxable <= 0) return 0;
  if (rate.kind === 'anne-arundel') return tableTax(taxable, rate.bands, below);
  return unitsToDollars(whole(taxable) * 100 * rate.bp);
}

function pensionExclusion(ctx, filing, rule) {
  const months = monthsResident(filing);
  const people = ctx.filers.map((person) => {
    const pension = sum(formsOf(ctx, '1099-R').filter((form) => !form.fields?.iraSepSimple && ownerOf(form) === person.role), taxableOf);
    const socialSecurity = sum(formsOf(ctx, 'SSA-1099').filter((form) => ownerOf(form) === person.role), (form) => positive(form.fields?.netBenefits));
    const qualifies = person.age !== null && person.age >= rule.pensionAge && pension > 0;
    const full = qualifies ? Math.min(pension, Math.max(0, rule.pensionExclusionMax - socialSecurity)) : 0;
    return { role: person.role, pension, socialSecurity, exclusion: Math.round((full * months) / 12) };
  });
  return { people, total: people.reduce((total, item) => total + item.exclusion, 0), months };
}

function earnedByOwner(ctx, role) {
  return sum(ctx.w2.filter((row) => row.owner === role), (row) => row.wages);
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const std = reader.read('standard-deduction');
  const subs = reader.read('subtractions');
  const credits = reader.read('credits');
  const poverty = reader.read('poverty-levels');
  const local = reader.read('local-tax');
  if (!rule || !std || !subs || !credits || !poverty || !local) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Maryland figures for ${ctx.taxYear}.` };
  if (filing.residency === 'nonresident') return nonresident(ctx, filing, rule, std);
  const answers = filing.answers;
  const income = ctx.income;
  const partYear = filing.residency === 'part-year';
  const sourced = filing.sourced;
  const checks = [];
  const status = ctx.filingStatus;
  const dependentFiler = ctx.filers.some((item) => item.canBeClaimedAsDependent);
  const schedule = JOINT_TABLE.has(status) && !dependentFiler ? rule.scheduleII : rule.scheduleI;
  const line1 = income.agi;
  const earned = whole(ctx.federal.schedules?.EIC?.earnedIncome ?? (income.wages + Math.max(0, income.businessIncome)));
  const exemptInterest = income.taxExemptInterest;
  const bondAnswer = answers.nonMarylandBondInterest;
  const nonMdInterest = bondAnswer === undefined || bondAnswer === null ? exemptInterest : Math.min(positive(bondAnswer), exemptInterest);
  if (exemptInterest > 0 && (bondAnswer === undefined || bondAnswer === null)) checks.push(check('warning', 'MD_BOND_INTEREST_ASSUMED', 'All of your tax-exempt interest was treated as interest on bonds of other states, which Maryland taxes (Line 2). Interest on Maryland bonds is not added.', 'Say how much of your tax-exempt interest is from bonds of states other than Maryland.'));
  const line2 = partYear ? Math.round(nonMdInterest * filing.share) : nonMdInterest;
  const line6 = line2;
  const line7 = line1 + line6;
  const line8 = partYear ? whole(sourced.stateRefundTaxable) : income.stateRefundTaxable;
  const careDependents = ctx.dependents.filter((item) => item.age !== null && item.age < 13).length;
  const careLimit = careDependents >= 2 ? subs.childCareLimit.twoOrMore : subs.childCareLimit.one;
  const careEarned = status === 'mfj' && !income.businessIncome ? Math.min(earnedByOwner(ctx, 'taxpayer'), earnedByOwner(ctx, 'spouse')) : earned;
  const line9 = Math.min(positive(answers.childCareExpenses), careLimit, Math.max(0, careEarned));
  const pension = pensionExclusion(ctx, filing, subs);
  const line10a = pension.total;
  const line11 = partYear ? whole(sourced.socialSecurityTaxable) : income.socialSecurityTaxable;
  const line12 = partYear ? Math.max(0, line1 - filing.sourcedAgi) : 0;
  const usInterest = partYear ? whole(sourced.usObligationInterest) : income.usObligationInterest;
  const before = exemptions(ctx, rule, line1);
  const after = exemptions(ctx, rule, line1 - usInterest);
  const exemptionAdjustment = Math.max(0, after.total - before.total);
  const line13 = usInterest + exemptionAdjustment;
  let line14 = 0;
  if (status === 'mfj') {
    const given = answers.twoIncomeLowerSpouse;
    if (given !== undefined && given !== null) line14 = Math.min(subs.twoIncomeMax, positive(given));
    else {
      const share = (role) => earnedByOwner(ctx, role) + sum(formsOf(ctx, '1099-R').filter((form) => ownerOf(form) === role), taxableOf) - (pension.people.find((item) => item.role === role)?.exclusion || 0);
      line14 = Math.min(subs.twoIncomeMax, Math.max(0, Math.min(share('taxpayer'), share('spouse'))));
      const counted = income.wages + income.pensionTaxable + income.iraTaxable;
      if (line1 - counted > 0) checks.push(check('warning', 'MD_TWO_INCOME_SPLIT', 'The two-income subtraction counted only each spouse\'s W-2 wages and 1099-R income; interest, dividends, gains and business income were not split between you.', 'Give the smaller spouse\'s Maryland income to get the exact subtraction (up to $1,200).'));
    }
  }
  const line15 = line8 + line9 + line10a + line11 + line12 + line13 + line14;
  const line16 = line7 - line15;
  const factor = partYear ? ratio(line16, line1, { places: 6 }) : 1;
  const prorate = (amount) => (partYear ? Math.round(amount * factor) : amount);
  const standard = JOINT_TABLE.has(status) && !dependentFiler ? std.joint : std.other;
  let line17a = 0;
  let line17b = 0;
  let line17c = 0;
  let itemizedNet = 0;
  const scheduleA = ctx.itemized.federalScheduleA;
  if (ctx.itemized.federalItemized && scheduleA) {
    line17a = ctx.itemized.federalAllowed;
    const incomeTaxes = ctx.itemized.generalSalesTax ? 0 : whole(scheduleA['5a']);
    const allowedShare = whole(scheduleA['5d']) > 0 ? Math.min(1, whole(scheduleA['5e']) / whole(scheduleA['5d'])) : 0;
    line17b = Math.min(Math.round(incomeTaxes * allowedShare), status === 'mfs' ? rule.incomeTaxDeductionCap.mfs : rule.incomeTaxDeductionCap.other);
    const over = status === 'mfs' ? rule.itemizedPhaseout.over.mfs : rule.itemizedPhaseout.over.other;
    line17c = Math.round((Math.max(0, line1 - over) * rule.itemizedPhaseout.rateBp) / 10000);
    itemizedNet = Math.max(0, line17a - line17b - line17c);
  }
  const itemize = itemizedNet > standard;
  const line17 = prorate(itemize ? itemizedNet : standard);
  if (ctx.itemized.federalItemized && !itemize) checks.push(check('info', 'MD_STANDARD_BETTER', 'You itemized on your federal return, but the Maryland standard deduction is larger than your Maryland itemized deductions, so the standard deduction is used.'));
  const line18 = line16 - line17;
  const line19 = prorate(before.total);
  const line20 = Math.max(0, line18 - line19);
  let line20a = 0;
  if (line1 > rule.capitalGainSurtax.agiOver) {
    const gain = Math.max(0, partYear ? whole(sourced.capitalGain) : income.capitalGain);
    line20a = Math.max(0, gain - positive(answers.capitalGainNotSubject));
    if (gain > 0) checks.push(check('info', 'MD_502CG', 'Federal AGI is above $350,000, so the 2% additional tax applies to net capital gain on Form 502CG. Gains from your main home and other excluded items come off if you enter them.'));
  }
  const line21 = tableTax(line20, schedule, rule.tableBelow);
  const line21b = Math.round((line20a * rule.capitalGainSurtax.rateBp) / 10000);
  const stateTax = line21 + line21b;
  const county = answers.county;
  const rate = COUNTIES.includes(county) ? localRate(local, county, status, line20) : null;
  if (!rate) checks.push(check('error', 'MD_COUNTY_REQUIRED', 'Maryland local income tax depends on the county (or Baltimore City) where you lived on December 31 (or on your last day as a Maryland resident). Without it the local tax is left at $0.', 'Answer the county question.'));
  const line28 = localTaxOn(rate, line20, rule.tableBelow);
  const federalEic = whole(ctx.federal.lines['27']);
  const eic = partYear ? federalEic * factor : federalEic;
  const hasChild = whole(ctx.federal.schedules?.EIC?.qualifyingChildren) > 0;
  const married = status === 'mfj' || status === 'mfs';
  const halfMethod = married || hasChild;
  const line22 = Math.round((eic * (halfMethod ? credits.eicHalfBp : credits.eicFullBp)) / 10000);
  const refundableEic = halfMethod ? Math.max(0, Math.round((eic * credits.refundableEicBp) / 10000) - stateTax) : Math.max(0, line22 - stateTax);
  const householdSize = ctx.filers.length + ctx.dependents.length;
  const povertyLevel = poverty.base + poverty.perPerson * Math.max(0, householdSize - 1);
  const povertyEligible = !dependentFiler && (halfMethod ? stateTax > line22 : stateTax >= line22) && Math.max(line7, earned) < povertyLevel && earned > 0;
  const line23 = povertyEligible ? prorate(Math.round((earned * credits.povertyCreditBp) / 10000)) : 0;
  const senior = credits.seniorCredit;
  const seniors = ctx.filers.filter((item) => item.age !== null && item.age >= senior.age).length;
  let seniorCredit = 0;
  if (seniors > 0) {
    if (JOINT_TABLE.has(status) && line1 <= senior.joint.agiUpTo) seniorCredit = status === 'mfj' && seniors < 2 ? senior.joint.one : senior.joint.both;
    else if (!JOINT_TABLE.has(status) && line1 <= senior.single.agiUpTo) seniorCredit = senior.single.amount;
  }
  const partA = [];
  for (const other of filing.otherStates || []) {
    const p1 = line20;
    const p2 = Math.min(p1, positive(other.income));
    const p3 = p1 - p2;
    const p4 = tableTax(p3, schedule, rule.tableBelow);
    const p9 = stateTax;
    const p10 = Math.max(0, p9 - p4);
    const p11 = line28;
    const p12 = localTaxOn(rate, p3, rule.tableBelow);
    const p13 = Math.max(0, p11 - p12);
    const p14 = p10 + p13;
    const p15 = positive(other.tax);
    const p16 = Math.min(p14, p15);
    const p17 = Math.min(p10, p16);
    const p18 = p16 - p17;
    partA.push({ state: other.state, lines: lineTable({ 1: p1, 2: p2, 3: p3, 4: p4, 9: p9, 10: p10, 11: p11, 12: p12, 13: p13, 14: p14, 15: p15, 16: p16, 17: p17, 18: p18 }) });
  }
  const otherStateState = partA.reduce((total, item) => total + item.lines['17'], 0);
  const otherStateLocal = partA.reduce((total, item) => total + item.lines['18'], 0);
  if (partA.length) checks.push(check('info', 'MD_502CR_PART_A', 'Credit for tax paid to another state is on Form 502CR Part A, split between state and local tax. Attach the other state\'s return.'));
  const line24 = otherStateState + seniorCredit;
  const line26 = line22 + line23 + line24;
  const line27 = Math.max(0, stateTax - line26);
  let room = stateTax;
  const take = (amount) => {
    const used = Math.min(room, amount);
    room -= used;
    return used;
  };
  const usedEic = take(line22);
  const usedPoverty = take(line23);
  const usedOther = take(otherStateState);
  const usedSenior = take(seniorCredit);
  const eicBp = rate ? rate.eicBp : 0;
  const line29 = Math.round((eic * credits.localEicMultiplier * eicBp) / 10000);
  const line30 = line23 > 0 ? prorate(Math.round((earned * eicBp) / 10000)) : 0;
  const line31 = otherStateLocal;
  const line32 = line29 + line30 + line31;
  const line33 = Math.max(0, line28 - line32);
  const line34 = line27 + line33;
  const ctc = credits.childTaxCredit;
  const ctcChildren = ctx.dependents.filter((item) => item.age !== null && (item.age < ctc.underAge || (item.disabled && item.age < ctc.disabledUnderAge))).length;
  const perChild = line1 <= ctc.agiThreshold ? ctc.perChild : Math.max(0, ctc.perChild - ctc.reductionPer * Math.ceil((line1 - ctc.agiThreshold) / ctc.reductionStep));
  const childTaxCredit = ctcChildren * perChild;
  if (ctx.dependents.some((item) => item.disabled && item.age !== null && item.age >= ctc.underAge && item.age < ctc.disabledUnderAge)) checks.push(check('info', 'MD_CTC_DISABILITY', 'A child aged 6 to 16 counts for the Maryland child tax credit only with a disability assessment attached to Form 502CR.'));
  if (exemptionAdjustment) checks.push(check('info', 'MD_502SU_HH', 'U.S. obligation interest lowered your income for the exemption chart, so the extra exemption is subtracted on Form 502SU line hh.'));
  const line41 = filing.payments.withheld + filing.payments.localWithheld;
  const line43 = filing.payments.estimated + filing.payments.extension;
  const countyName = county ? county.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : 'local';
  const lines = lineTable({
    1: line1, '1a': income.wages, '1b': earned, '1c': income.capitalGain, '1d': income.pensionTaxable + income.iraTaxable,
    2: line2, 6: line6, 7: line7, 8: line8, 9: line9, '10a': line10a, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: line16,
    '17a': line17a, '17b': line17b, '17c': line17c, 17: line17, 18: line18, 19: line19, 20: line20, '20a': line20a, 21: line21, '21b': line21b,
    22: line22, 23: line23, 24: line24, 26: line26, 27: line27, 28: line28, 29: line29, 30: line30, 31: line31, 32: line32, 33: line33, 34: line34, 40: line34,
    41: line41, 43: line43, 44: refundableEic, 45: childTaxCredit,
  });
  const schedules = {
    exemptions: lineTable({ A: before.a, B: before.b, C: before.c, each: before.each, D: before.total }),
    ...(line10a ? { '13A': { people: pension.people, months: pension.months } } : {}),
    ...(line13 ? { '502SU': lineTable({ ab: usInterest, hh: exemptionAdjustment, total: line13 }) } : {}),
    ...(partYear ? { '26A': lineTable({ 1: line16, 2: line1, 3: factor }) } : {}),
    ...(line24 || childTaxCredit || partA.length ? { '502CR': { partA, M: seniorCredit, AA14: line24, BB1: line31, CC8: childTaxCredit, CC10: childTaxCredit } } : {}),
    local: { county: county || '', rateBp: rate ? (rate.kind === 'flat' ? rate.bp : null) : null, tax: line28 },
  };
  return {
    form: '502',
    lines,
    schedules,
    stateIncome: line16,
    taxableIncome: line20,
    taxBeforeCredits: stateTax,
    nonrefundableCredits: [
      ...(usedEic ? [{ code: 'MD_EIC', label: 'Maryland earned income credit', amount: usedEic }] : []),
      ...(usedPoverty ? [{ code: 'MD_POVERTY', label: 'Poverty level credit', amount: usedPoverty }] : []),
      ...(usedOther ? [{ code: 'MD_502CR_A', label: 'Tax paid to another state (state part)', amount: usedOther }] : []),
      ...(usedSenior ? [{ code: 'MD_SENIOR', label: 'Senior tax credit', amount: usedSenior }] : []),
    ],
    otherStateCredit: usedOther + Math.min(line31, Math.max(0, line28 - line29 - line30)),
    otherTaxes: line33 ? [{ code: 'MD_LOCAL_TAX', label: `Local income tax (${countyName}) after local credits`, amount: line33 }] : [],
    totalTax: line34,
    refundableCredits: [
      ...(refundableEic ? [{ code: 'MD_REFUNDABLE_EIC', label: 'Refundable earned income credit', amount: refundableEic }] : []),
      ...(childTaxCredit ? [{ code: 'MD_CTC', label: 'Maryland child tax credit', amount: childTaxCredit }] : []),
    ],
    localPayments: filing.payments.localWithheld,
    checks,
  };
}

function nonresident(ctx, filing, rule, std) {
  const income = ctx.income;
  const checks = [];
  const status = ctx.filingStatus;
  const dependentFiler = ctx.filers.some((item) => item.canBeClaimedAsDependent);
  const schedule = JOINT_TABLE.has(status) && !dependentFiler ? rule.scheduleII : rule.scheduleI;
  const line17 = income.agi;
  const line20 = 0;
  const line21 = line17 + line20;
  const line24 = 0;
  const line25 = line21 - line24;
  const agiFactor = line25 <= 0 ? 0 : ratio(line25, line17, { places: 6 });
  const line26a = JOINT_TABLE.has(status) && !dependentFiler ? std.joint : std.other;
  let line26e = 0;
  const scheduleA = ctx.itemized.federalScheduleA;
  let line26b = 0;
  let line26c = 0;
  let line26d = 0;
  if (ctx.itemized.federalItemized && scheduleA) {
    line26b = ctx.itemized.federalAllowed;
    const incomeTaxes = ctx.itemized.generalSalesTax ? 0 : whole(scheduleA['5a']);
    const allowedShare = whole(scheduleA['5d']) > 0 ? Math.min(1, whole(scheduleA['5e']) / whole(scheduleA['5d'])) : 0;
    line26c = Math.min(Math.round(incomeTaxes * allowedShare), status === 'mfs' ? rule.incomeTaxDeductionCap.mfs : rule.incomeTaxDeductionCap.other);
    line26d = Math.round((Math.max(0, line17 - (status === 'mfs' ? rule.itemizedPhaseout.over.mfs : rule.itemizedPhaseout.over.other)) * rule.itemizedPhaseout.rateBp) / 10000);
    line26e = Math.max(0, line26b - line26c - line26d);
  }
  const itemize = line26e > line26a;
  const deduction = itemize ? line26e : line26a;
  const line26 = Math.round(deduction * agiFactor);
  const line27 = line25 - line26;
  const ex = exemptions(ctx, rule, line17);
  const line28 = ex.total;
  const line30 = Math.round(line28 * agiFactor);
  const line31 = Math.max(0, line27 - line30);
  const nr1 = line31;
  const nr2 = tableTax(nr1, schedule, rule.tableBelow);
  const nr3 = line17;
  const nr4 = line21;
  const nr8 = Math.max(0, filing.sourcedAgi);
  const nr6b = Math.max(0, nr4 - nr8);
  const nr7 = nr6b;
  const nr9 = nr8 <= 0 ? 0 : ratio(nr8, nr3, { places: 6 });
  const nr10 = Math.round(deduction * nr9);
  const nr11 = nr8 - nr10;
  const nr12 = Math.round(line28 * nr9);
  const nr13 = Math.max(0, nr11 - nr12);
  const nr15 = nr13 <= 0 ? 0 : ratio(nr13, nr1, { places: 6 });
  const nr16 = Math.round(nr2 * nr15);
  const nr17 = nr13 > 0 ? Math.round((nr13 * rule.specialNonresidentRateBp) / 10000) : 0;
  const line32e = nr16 + nr17;
  checks.push(check('info', 'MD_SPECIAL_NONRESIDENT_TAX', 'As a nonresident you pay the 2.25% special nonresident tax instead of a county tax. If your home county or city taxes Maryland residents\' wages, Form 515 applies instead, which MyCA does not prepare.'));
  const lines = lineTable({ 17: line17, 20: line20, 21: line21, 24: line24, 25: line25, '26a': line26a, '26b': line26b, '26c': line26c, '26d': line26d, '26e': line26e, 26: line26, 27: line27, 28: line28, 29: agiFactor, 30: line30, 31: line31, '32a': nr16, '32b': nr17, '32e': line32e, 36: 0, 37: line32e, 43: line32e, 44: filing.payments.withheld, 46: filing.payments.estimated + filing.payments.extension });
  return {
    form: '505',
    lines,
    schedules: { '505NR': lineTable({ 1: nr1, 2: nr2, 3: nr3, 4: nr4, '6a': 0, '6b': nr6b, 7: nr7, 8: nr8, 9: nr9, [itemize ? '10b' : '10a']: nr10, 11: nr11, 12: nr12, 13: nr13, 14: nr2, 15: nr15, 16: nr16, 17: nr17 }), exemptions: lineTable({ A: ex.a, B: ex.b, C: ex.c, each: ex.each, D: ex.total }) },
    stateIncome: nr8,
    taxableIncome: nr13,
    taxBeforeCredits: line32e,
    nonrefundableCredits: [],
    otherStateCredit: 0,
    otherTaxes: [],
    totalTax: line32e,
    refundableCredits: [],
    localPayments: filing.payments.localWithheld,
    checks,
  };
}

const FORM_502_LABELS = Object.freeze({
  1: 'Adjusted gross income from your federal return',
  '1a': 'Wages, salaries and/or tips',
  '1b': 'Earned income',
  '1c': 'Capital gain or (loss)',
  '1d': 'Taxable pensions, IRAs, annuities',
  2: 'Tax-exempt interest on non-Maryland state and local bonds',
  6: 'Total additions',
  7: 'Total federal adjusted gross income and Maryland additions',
  8: 'Taxable refunds of state and local income taxes',
  9: 'Child and dependent care expenses',
  '10a': 'Pension exclusion (worksheet 13A)',
  11: 'Taxable Social Security and RR benefits',
  12: 'Income received during period of nonresidence',
  13: 'Subtractions from Form 502SU',
  14: 'Two-income subtraction',
  15: 'Total subtractions',
  16: 'Maryland adjusted gross income',
  '17a': 'Total federal itemized deductions',
  '17b': 'State and local income taxes',
  '17c': 'Itemized deduction phaseout amount',
  17: 'Deduction amount',
  18: 'Net income',
  19: 'Exemption amount',
  20: 'Taxable net income',
  '20a': 'Net capital gain subject to additional tax (Form 502CG)',
  21: 'Maryland tax',
  '21b': 'Additional tax on net capital gain income',
  22: 'Earned income credit',
  23: 'Poverty level credit',
  24: 'Other income tax credits for individuals (Form 502CR)',
  26: 'Total credits',
  27: 'Maryland tax after credits',
  28: 'Local tax',
  29: 'Local earned income credit',
  30: 'Local poverty level credit',
  31: 'Local tax credit (Form 502CR, Part BB)',
  32: 'Total local credits',
  33: 'Local tax after credits',
  34: 'Total Maryland and local tax',
  40: 'Total Maryland income tax, local income tax and contributions',
  41: 'Total Maryland and local tax withheld',
  43: 'Estimated tax payments and payment with an extension request',
  44: 'Refundable earned income credit',
  45: 'Refundable income tax credits (Form 502CR, Part CC)',
});

const FORM_505_LABELS = Object.freeze({
  17: 'Adjusted gross income',
  20: 'Total additions',
  21: 'Total federal adjusted gross income and Maryland additions',
  24: 'Total subtractions',
  25: 'Maryland AGI before subtracting non-Maryland income',
  '26a': 'Standard deduction',
  '26b': 'Total federal itemized deductions',
  '26c': 'State and local income taxes',
  '26d': 'Itemized deduction phaseout amount',
  '26e': 'Net itemized deductions',
  26: 'Deduction amount (times the AGI factor)',
  27: 'Net income',
  28: 'Total exemption amount',
  29: 'AGI factor',
  30: 'Maryland exemption allowance',
  31: 'Taxable net income',
  '32a': 'Maryland tax (Form 505NR, line 16)',
  '32b': 'Special nonresident tax (Form 505NR, line 17)',
  '32e': 'Total Maryland tax',
  36: 'Total credits',
  37: 'Maryland tax after credits',
  43: 'Total Maryland income tax and contributions',
  44: 'Total Maryland tax withheld',
  46: 'Estimated tax payments and payments with an extension request',
});

const marylandLabels = (taxYear, residency, form) => (form === '505' ? FORM_505_LABELS : FORM_502_LABELS);

export const STATE = Object.freeze({
  code: 'MD',
  name: 'Maryland',
  built: true,
  forms: Object.freeze({ resident: '502', partYear: '502 (part-year, Instruction 26)', nonresident: '505 with 505NR' }),
  questions: Object.freeze([
    Object.freeze({ id: 'county', when: { residency: ['full-year', 'part-year'] }, kind: 'choice', options: COUNTIES, text: 'Maryland county (or Baltimore City) where you lived on December 31, or on your last day as a Maryland resident', help: 'Sets the local income tax rate on Form 502. Use the county of your home address, not where you work.' }),
    Object.freeze({ id: 'nonMarylandBondInterest', when: { residency: ['full-year', 'part-year'], has: ['taxExemptInterest'] }, kind: 'amount', text: 'Tax-exempt interest from bonds of states other than Maryland (and their cities and agencies)', help: 'Maryland adds this to income (Form 502 Line 2). Enter 0 if all your tax-exempt interest is from Maryland bonds.' }),
    Object.freeze({ id: 'childCareExpenses', when: { residency: ['full-year', 'part-year'] }, kind: 'amount', text: 'Child and dependent care expenses you paid so you could work (federal Form 2441 line 6 before the dollar limit)', help: 'Subtracted on Line 9, up to $3,000 for one child or $6,000 for two or more.' }),
    Object.freeze({ id: 'twoIncomeLowerSpouse', when: { residency: ['full-year', 'part-year'], filingStatus: ['mfj'] }, kind: 'amount', text: 'Joint return: Maryland income of the spouse with the smaller income', help: 'Used for the two-income subtraction of up to $1,200 (Worksheet 13D). Leave empty to let MyCA use each spouse\'s W-2 and 1099-R income.' }),
    Object.freeze({ id: 'capitalGainNotSubject', when: { residency: ['full-year', 'part-year'], has: ['capitalGains'] }, kind: 'amount', text: 'Federal AGI above $350,000: capital gain that Form 502CG excludes from the 2% additional tax', help: 'For example the gain on your main home or gains inside a retirement account. Leave empty if none.' }),
  ]),
  labels: marylandLabels,
  notCovered: Object.freeze([
    'Additions and subtractions other than non-Maryland bond interest, state refunds, child care expenses, the pension exclusion for filers 65 or older, Social Security, U.S. obligation interest, the 502SU exemption adjustment and the two-income subtraction (for example military, police and fire retirement, the ranger pension exclusion, and 529 or ABLE contributions)',
    'The pension exclusion for filers under 65 who are totally disabled',
    'Form 502CR credits other than tax paid to other states, the senior tax credit and the child tax credit (child and dependent care, long-term care, student loan debt relief and others)',
    'Homeowners\' and renters\' property tax credits, which are separate applications (HTC and RTC)',
    'The poverty level credit on the nonresident Form 505, and Form 515 for residents of localities that tax Maryland residents',
    'Credit for tax paid to another state on a part-year return, and separate Maryland returns of spouses who filed jointly',
    'Business tax credits (Form 500CR), contributions to the checkoff funds and the underpayment penalty (Form 502UP)',
  ]),
  compute,
});
