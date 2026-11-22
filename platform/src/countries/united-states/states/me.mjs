import { whole, positive, ratio, check, lineTable, byStatus, rateOf } from '../state-kit.mjs';
import { incomeByOwner, applyRatio, OWNERS } from './va-spouses.mjs';

const formsOf = (ctx, kind) => (ctx.forms || []).filter((form) => form.kind === kind);
const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');

export function scheduleTax(amount, rows) {
  const taxable = Math.max(0, whole(amount));
  let band = rows[0];
  for (const row of rows) if (taxable * 100 >= row.overCents) band = row;
  return Math.round(band.baseTax + ((taxable - band.overCents / 100) * band.rateBp) / 10000);
}

function scheduleRows(rule, status) {
  const key = status === 'mfs' ? 'single' : status === 'qss' ? 'mfj' : status;
  return rule.brackets[key].map((band, index) => ({ ...band, baseTax: rule.scheduleBase[key][index] }));
}

function maineTax(rule, status, taxable) {
  const amount = Math.max(0, whole(taxable));
  const rows = scheduleRows(rule, status);
  if (amount < rule.table.below) {
    const first = rule.table.firstRows.find((row) => amount < row.below);
    if (first) return first.tax;
    const start = Math.floor(amount / rule.table.width) * rule.table.width;
    return scheduleTax(start + rule.table.width / 2, rows);
  }
  return scheduleTax(amount, rows);
}

function phaseoutRatio(amount, start, range) {
  const excess = whole(amount) - start;
  if (excess <= 0) return 0;
  return ratio(excess, range, { places: 4 });
}

function boxesOf(ctx, filers) {
  return filers.reduce((total, filer) => total + ((filer.age ?? 0) >= 65 ? 1 : 0) + (filer.blind ? 1 : 0), 0);
}

function socialSecurityByOwner(ctx) {
  const out = { taxpayer: 0, spouse: 0 };
  const rows = formsOf(ctx, 'SSA-1099');
  if (!rows.length) {
    out.taxpayer = whole(ctx.income.socialSecurityBenefits);
    return out;
  }
  for (const form of rows) out[ctx.filingStatus === 'mfj' ? ownerOf(form) : 'taxpayer'] += positive(form.fields?.netBenefits);
  return out;
}

function pensionWorksheet(ctx, filing, subtractions, byOwner, owners, agiForPhaseout, status) {
  const answers = filing.answers;
  const social = socialSecurityByOwner(ctx);
  let military = positive(answers.militaryRetirementPay);
  let ineligible = positive(answers.ineligiblePension);
  const start = byStatus(subtractions.pensionPhaseout.start, status);
  const range = byStatus(subtractions.pensionPhaseout.range, status);
  const p6 = phaseoutRatio(agiForPhaseout, start, range);
  const rows = {};
  let total = 0;
  for (const owner of owners) {
    let eligible = byOwner[owner].ira + byOwner[owner].pension;
    const p9 = Math.min(military, Math.max(0, eligible));
    military -= p9;
    eligible -= p9;
    const removed = Math.min(ineligible, Math.max(0, eligible));
    ineligible -= removed;
    const p1 = Math.max(0, eligible - removed);
    if (!p1 && !p9) continue;
    const p2 = subtractions.pensionMaximum;
    const p3 = social[owner];
    const p4 = Math.max(0, p2 - p3);
    const p5 = Math.min(p1, p4);
    const p7 = p6 ? Math.round(p5 * p6) : 0;
    const p8 = p5 - p7;
    const p10 = p8 + p9;
    rows[owner] = lineTable({ P1: p1, P2: p2, P3: p3, P4: p4, P5: p5, ...(p6 ? { P6: p6, P7: p7 } : {}), P8: p8, P9: p9, P10: p10 });
    total += p10;
  }
  return { rows, total };
}

function itemizedSchedule(ctx, rule) {
  const fedA = ctx.itemized.federalScheduleA;
  if (!ctx.itemized.federalItemized || !fedA) return null;
  const l1 = whole(fedA['17']);
  const l2a = whole(fedA['5e']);
  const l2d = whole(fedA['4']);
  const l2f = l2a + l2d;
  const l3b = whole(fedA['5b']);
  const l3c = whole(fedA['5c']);
  const l3e = l3b + l3c;
  const l4 = l1 - l2f + l3e;
  const l5 = rule.itemizedCap;
  const l6 = Math.min(l4, l5);
  const l7 = l2d + l6;
  return lineTable({ 1: l1, '2a': l2a, '2d': l2d, '2f': l2f, '3b': l3b, '3c': l3c, '3e': l3e, 4: l4, 5: l5, 6: l6, 7: l7 });
}

function deductionAfterPhaseout(amount, mainAgi, phaseouts, status) {
  const ratioValue = phaseoutRatio(mainAgi, byStatus(phaseouts.deduction.start, status), byStatus(phaseouts.deduction.range, status));
  return { ratio: ratioValue, amount: amount - Math.round(amount * ratioValue) };
}

function exemptionAfterPhaseout(amount, mainAgi, phaseouts, status) {
  const ratioValue = phaseoutRatio(mainAgi, byStatus(phaseouts.exemption.start, status), byStatus(phaseouts.exemption.range, status));
  return { ratio: ratioValue, amount: amount - Math.round(amount * ratioValue) };
}

function dependentCredit(ctx, credits, mainAgi, status) {
  const qualifying = ctx.dependents.filter((item) => item.ctcEligible || item.odcEligible);
  const young = qualifying.filter((item) => item.age !== null && item.age < credits.detc.youngUnder).length;
  const older = qualifying.length - young;
  const l2 = older * credits.detc.olderAmount;
  const l4 = young * credits.detc.youngAmount;
  const l5 = l2 + l4;
  const excess = whole(mainAgi) - byStatus(credits.detc.phaseoutStart, status);
  const l8 = excess > 0 ? Math.ceil(excess / credits.detc.step) * credits.detc.step : 0;
  const l9 = l8 / credits.detc.step;
  const l10 = l9 * credits.detc.stepReduction;
  const l11 = Math.max(0, l5 - l10);
  return lineTable({ 1: older, 2: l2, 3: young, 4: l4, 5: l5, 6: whole(mainAgi), 7: byStatus(credits.detc.phaseoutStart, status), 8: l8, 9: l9, 10: l10, 11: l11 });
}

function salesTaxFairness(table, status, count, income) {
  const row = byStatus(table, status);
  if (!row) return 0;
  const column = row.columnStarts.reduce((found, starts, index) => (count >= starts ? index : found), 0);
  const base = row.base[column];
  if (income <= row.upTo) return base;
  const bands = Math.ceil((income - row.upTo) / row.width);
  return Math.max(0, base - bands * row.step);
}

function nrhColumns(ctx, filing, owner, byOwner, share) {
  const resident = filing.residency === 'full-year';
  const nonresident = filing.residency === 'nonresident';
  const own = byOwner[owner];
  const income = ctx.income;
  const maineWages = ctx.w2.filter((row) => row.state === 'ME' && (row.owner === 'spouse' ? 'spouse' : 'taxpayer') === owner).reduce((total, row) => total + (row.stateWages === null ? row.wages : row.stateWages), 0);
  const hasMaineW2 = ctx.w2.some((row) => row.state === 'ME');
  const A = { '1a': income.wages, '1b': income.taxableInterest + income.ordinaryDividends, '1c': income.iraTaxable, '1d': income.pensionTaxable, '1e': income.socialSecurityTaxable, '1f': income.capitalGain, '1g': income.businessIncome, '1h': 0, '1i': income.unemployment + income.otherIncome };
  const B = { '1a': own.wages, '1b': own.interest + own.usInterest + own.dividends, '1c': own.ira, '1d': own.pension, '1e': own.socialSecurityTaxable, '1f': own.capitalGain, '1g': own.business, '1h': 0, '1i': own.unemployment + own.other };
  const maineOf = (key, value) => {
    if (resident) return value;
    if (key === '1a') return hasMaineW2 || nonresident ? Math.min(value, maineWages) : Math.round(value * share);
    return nonresident ? 0 : Math.round(value * share);
  };
  const C = Object.fromEntries(Object.entries(B).map(([key, value]) => [key, value - maineOf(key, value)]));
  for (const column of [A, B, C]) column['1j'] = ['1a', '1b', '1c', '1d', '1e', '1f', '1g', '1h', '1i'].reduce((total, key) => total + column[key], 0);
  return { A, B, C };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const phaseouts = reader.read('phaseouts');
  const subtractions = reader.read('subtractions');
  const credits = reader.read('credits');
  if (!rule || !phaseouts || !subtractions || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Maine figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const resident = filing.residency === 'full-year';
  const nonresident = filing.residency === 'nonresident';
  const share = filing.residency === 'part-year' ? filing.share : nonresident ? 0 : 1;
  const sourced = filing.sourced;
  const checks = [];
  const notes = [];
  const byOwner = incomeByOwner(ctx);
  const nrh = ctx.filingStatus === 'mfj' && answers.nrhElectSingle === true;
  const nrhOwner = answers.nrhFiler === 'spouse' ? 'spouse' : 'taxpayer';
  const status = nrh ? 'single' : ctx.filingStatus;
  const filers = nrh ? ctx.filers.filter((item) => item.role === nrhOwner) : ctx.filers;
  if (answers.nrhElectSingle === true && ctx.filingStatus !== 'mfj') checks.push(check('warning', 'ME_NRH_NOT_JOINT', 'Schedule NRH is only for a married couple who filed a joint federal return; it was ignored.'));

  const line13 = filers.filter((item) => !item.canBeClaimedAsDependent).length;
  const line13a = ctx.dependents.filter((item) => item.ctcEligible || item.odcEligible).length;

  const muni = Math.max(0, income.taxExemptInterest - positive(answers.maineMunicipalInterest));
  const s1a = lineTable({ 1: muni, 11: muni });
  const beneficiaries = Math.max(1, positive(answers.maine529Beneficiaries));
  const contributions = positive(answers.maine529Contributions);
  const college = income.agi <= byStatus(subtractions.college529.agiLimit, ctx.filingStatus) ? Math.min(contributions, subtractions.college529.perBeneficiary * beneficiaries) : 0;
  if (contributions && income.agi > byStatus(subtractions.college529.agiLimit, ctx.filingStatus)) checks.push(check('info', 'ME_529_AGI_LIMIT', 'The Maine deduction for 529 plan contributions is not allowed at your federal adjusted gross income.'));
  const owners = nrh ? [nrhOwner] : ctx.filingStatus === 'mfj' ? OWNERS : ['taxpayer'];
  const ownIncome = nrh ? byOwner : { taxpayer: ctx.filingStatus === 'mfj' ? byOwner.taxpayer : { ...byOwner.taxpayer, ira: income.iraTaxable, pension: income.pensionTaxable }, spouse: byOwner.spouse };

  let nrhSchedule = null;
  let line14;
  let line15a;
  let line15b;
  let s1s;
  let pension;
  if (nrh) {
    const columns = nrhColumns(ctx, filing, nrhOwner, byOwner, share);
    const { A, B, C } = columns;
    const l2B = ratio(B['1j'], A['1j'], { places: 4 });
    const l2C = ratio(C['1j'], B['1j'], { places: 4 });
    A['2'] = l2B;
    A['3'] = income.adjustments;
    B['3'] = applyRatio(A['3'], l2B, 4);
    C['3'] = applyRatio(B['3'], l2C, 4);
    for (const column of [A, B, C]) column['4'] = column['1j'] - column['3'];
    pension = pensionWorksheet(ctx, filing, subtractions, byOwner, [nrhOwner], A['4'], 'mfj');
    const pensionAll = pensionWorksheet(ctx, filing, subtractions, byOwner, OWNERS, A['4'], 'mfj');
    const usOwn = byOwner[nrhOwner].usInterest;
    A['5a'] = muni;
    B['5a'] = applyRatio(muni, l2B, 4);
    A['5b'] = income.usObligationInterest + income.socialSecurityTaxable + pensionAll.total + college;
    B['5b'] = usOwn + byOwner[nrhOwner].socialSecurityTaxable + pension.total + applyRatio(college, l2B, 4);
    const nonMaineShare = resident ? 0 : nonresident ? 1 : 1 - share;
    C['5a'] = Math.round(B['5a'] * nonMaineShare);
    C['5b'] = Math.round(B['5b'] * nonMaineShare);
    for (const column of [A, B, C]) column['6'] = column['4'] + column['5a'] - column['5b'];
    B['7'] = ratio(B['6'], A['6'], { places: 4 });
    C['7'] = C['6'] <= 0 ? 0 : ratio(C['6'], B['6'], { places: 4 });
    nrhSchedule = { A, B, C };
    line14 = B['4'];
    line15a = B['5a'];
    line15b = B['5b'];
    s1s = lineTable({ 1: usOwn, 3: byOwner[nrhOwner].socialSecurityTaxable, 4: pension.total, 8: applyRatio(college, l2B, 4), 27: line15b });
    if (!resident) checks.push(check('warning', 'ME_NRH_SOURCE_SPLIT', 'Schedule NRH column C (your non-Maine income) was worked out from your Maine W-2 wages and, for other income, the days you lived in Maine; check it against what you actually earned in Maine.'));
    if (byOwner.assumed.length) checks.push(check('info', 'ME_NRH_INCOME_SPLIT', `Schedule NRH needs your own share of the joint income; ${byOwner.assumed.join(', ')} had no owner on the forms and was split equally, as the instructions say for unearned income.`));
  } else {
    line14 = income.agi;
    pension = pensionWorksheet(ctx, filing, subtractions, ownIncome, owners, income.agi, ctx.filingStatus);
    s1s = lineTable({ 1: income.usObligationInterest, 2: income.stateRefundTaxable, 3: income.socialSecurityTaxable, 4: pension.total, 8: college, 27: income.usObligationInterest + income.stateRefundTaxable + income.socialSecurityTaxable + pension.total + college });
    line15a = s1a['11'];
    line15b = s1s['27'];
  }
  const line16 = line14 + line15a - line15b;
  const mainAgi = line16;

  const standardBase = byStatus(rule.standardDeduction, status);
  const married = ['mfj', 'mfs', 'qss'].includes(status);
  const boxes = boxesOf(ctx, filers);
  const standard = standardBase + boxes * (married ? rule.additionalStandard.married : rule.additionalStandard.unmarried);
  let schedule2 = itemizedSchedule(ctx, rule);
  let itemizedAmount = schedule2 ? schedule2['7'] : 0;
  if (schedule2 && nrh) {
    const a = applyRatio(schedule2['2d'], nrhSchedule.B['7'], 4);
    const b = applyRatio(schedule2['4'], nrhSchedule.B['7'], 4);
    const c = Math.min(b, rule.itemizedCap);
    itemizedAmount = a + c;
    schedule2 = { ...schedule2, nrh: lineTable({ a, b, c, d: itemizedAmount }) };
  }
  const itemizing = Boolean(schedule2) && itemizedAmount > standard;
  const beforePhaseout = itemizing ? itemizedAmount : standard;
  const deduction = deductionAfterPhaseout(beforePhaseout, mainAgi, phaseouts, status);
  const line17 = deduction.amount;
  const exemptionBase = line13 * rule.exemption;
  const exemption = exemptionAfterPhaseout(exemptionBase, mainAgi, phaseouts, status);
  const line18 = exemption.amount;
  const line19 = Math.max(0, line16 - line17 - line18);
  const baseTax = maineTax(rule, status, line19);
  const surchargeRule = rule.surcharge || null;
  const surcharge = surchargeRule ? rateOf(Math.max(0, line19 - byStatus(surchargeRule.over, status)), surchargeRule.rateBp) : 0;
  const line20 = baseTax + surcharge;

  let scheduleNr = null;
  let line7 = 0;
  let line21 = 0;
  if (nrh) {
    line7 = nrhSchedule.C['7'];
    line21 = applyRatio(line20, line7, 4);
    nrhSchedule.lines = lineTable({ 8: line17, 9: line18, 10: line20, 11: line21 });
  } else if (!resident) {
    const l1a = income.totalIncome;
    const l1b = filing.sourcedAgi + whole(sourced.adjustments);
    const l1c = l1a - l1b;
    const l2 = l1c < 0 ? 0 : l1b < 0 && l1c > 0 ? 1 : ratio(l1c, l1a, { places: 4 });
    const l3 = applyRatio(income.adjustments, l2, 4);
    const l4 = l1c - l3;
    const l5a = nonresident ? line15a : line15a - Math.round(line15a * share);
    const pensionAll = income.iraTaxable + income.pensionTaxable;
    const pensionMaine = whole(sourced.iraTaxable) + whole(sourced.pensionTaxable);
    const pensionNonMaine = pensionAll > 0 ? Math.round(s1s['4'] * Math.max(0, Math.min(1, (pensionAll - pensionMaine) / pensionAll))) : 0;
    const l5b = (income.usObligationInterest - whole(sourced.usObligationInterest)) + (income.socialSecurityTaxable - whole(sourced.socialSecurityTaxable)) + pensionNonMaine + (nonresident ? college : college - Math.round(college * share));
    const l5c = l5a - l5b;
    const l6 = l4 + l5c;
    line7 = l6 <= 0 ? 0 : l6 > line16 ? 1 : ratio(l6, line16, { places: 4 });
    const l8 = line20;
    line21 = applyRatio(l8, line7, 4);
    scheduleNr = lineTable({ '1a': l1a, '1b': l1b, '1c': l1c, 2: l2, 3: l3, 4: l4, '5a': l5a, '5b': l5b, '5c': l5c, 6: l6, 7: line7, 8: l8, 9: line21 });
  }
  const line20a = 0;
  const line22 = Math.max(0, line20 + line20a - line21);
  const maineShare = nrh ? nrhSchedule.B['7'] * (1 - line7) : 1 - line7;
  const prorate = (amount) => (resident && !nrh ? amount : Math.round(amount * Math.round(maineShare * 10000) / 10000));

  const detc = dependentCredit(ctx, credits, mainAgi, status);
  const detcAmount = prorate(detc['11']);
  if (!resident || nrh) detc['12'] = detcAmount;
  const careFederal = whole(ctx.federal.schedules?.[3]?.['2']);
  const care4 = rateOf(careFederal, credits.childCareBp);
  const care5 = nonresident ? 0 : Math.min(care4, credits.childCareRefundableMaximum);
  const care5a = nonresident ? 0 : prorate(care5);
  const care6 = Math.max(0, care4 - care5);
  const care6a = prorate(care6);
  const careSheet = care4 ? lineTable({ 2: careFederal, 4: care4, ...(nonresident ? {} : { 5: care5 }), ...(!resident || nrh ? { '5a': care5a } : {}), 6: care6, ...(!resident || nrh ? { '6a': care6a } : {}) }) : null;
  const federalEic = whole(ctx.federal.lines['27']);
  const hasChild = whole(ctx.federal.schedules?.EIC?.qualifyingChildren) > 0;
  const eitc2 = hasChild ? rateOf(federalEic, credits.eitcWithChildBp) : 0;
  const eitc3 = hasChild ? 0 : rateOf(federalEic, credits.eitcNoChildBp);
  const eitc4 = prorate(eitc2 + eitc3);
  const eitcSheet = federalEic ? lineTable({ 1: federalEic, ...(hasChild ? { 2: eitc2 } : { 3: eitc3 }), ...(!resident || nrh ? { 4: eitc4 } : {}) }) : null;

  const otherRows = [];
  let a14 = 0;
  if (resident && !nrh) {
    for (const other of filing.otherStates) {
      const l1 = line16;
      const l2d = Math.max(0, whole(other.income));
      const l3 = l2d >= l1 ? 1 : ratio(l2d, l1, { places: 4 });
      const l4a = applyRatio(line20, l3, 4);
      const l4b = positive(other.tax);
      const l5 = Math.min(l4a, l4b);
      otherRows.push({ state: other.state, lines: lineTable({ 1: l1, '2a': l2d, '2d': l2d, 3: l3, '4a': l4a, '4b': l4b, 5: l5 }) });
      a14 += l5;
    }
    if (otherRows.length) checks.push(check('info', 'ME_OTHER_STATE_RETURN', 'Enclose a copy of the income tax return filed with the other state with the credit worksheet.'));
  }
  const a1 = nonresident ? 0 : detcAmount;
  const a2 = nonresident ? 0 : care5a;
  const a4 = nonresident ? 0 : eitc4;
  const a9 = a1 + a2 + a4;
  const a10 = nonresident ? detcAmount : 0;
  const a11 = care6a;
  const a13 = nonresident ? eitc4 : 0;
  const a21 = a10 + a11 + a13 + a14;
  const a22 = line22;
  const a23 = Math.min(a21, a22);
  const scheduleA = lineTable({ 1: a1, 2: a2, 4: a4, 9: a9, 10: a10, 11: a11, 13: a13, 14: a14, 21: a21, 22: a22, 23: a23 });
  const line23 = a23;
  const line24 = Math.max(0, line22 - line23);

  let ptfc = null;
  let line25d = 0;
  let line25e = 0;
  const canFairness = status !== 'mfs' && !nonresident;
  if (canFairness) {
    const l2a = nrh ? nrhSchedule.B['1j'] : income.totalIncome;
    const l2b = nrh ? Math.max(0, socialSecurityByOwner(ctx)[nrhOwner] - byOwner[nrhOwner].socialSecurityTaxable) : Math.max(0, income.socialSecurityBenefits - income.socialSecurityTaxable);
    const l2c = nrh ? applyRatio(income.taxExemptInterest, nrhSchedule.A['2'], 4) : income.taxExemptInterest;
    const l2d = Math.max(0, -income.capitalGain) + Math.max(0, -income.businessIncome);
    const l3 = l2a + l2b + l2c + l2d;
    const l4 = positive(answers.propertyTaxPaid);
    const l5a = positive(answers.rentPaid);
    const l5c = answers.rentIncludesUtilities === true ? (answers.utilitiesInRent !== undefined ? Math.min(l5a, positive(answers.utilitiesInRent)) : rateOf(l5a, credits.ptfc.rentBp)) : 0;
    const l5d = l5a - l5c;
    const l5e = rateOf(l5d, credits.ptfc.rentBp);
    const l6 = l4 + l5e;
    const older = filers.some((item) => (item.age ?? 0) >= 65);
    const column = Math.min(2, line13a);
    const l8 = older ? credits.ptfc.olderBenefitBase : byStatus(credits.ptfc.benefitBase, status)[column];
    const l9 = Math.min(l6, l8);
    const l10 = rateOf(l3, credits.ptfc.incomeBp);
    const l11 = Math.max(0, l9 - l10);
    const l12 = older ? credits.ptfc.olderMaximum : credits.ptfc.maximum;
    const l13 = Math.min(l11, l12);
    const l14a = answers.disabledVeteran === true ? l13 : 0;
    const l15 = l13 + l14a;
    const l16 = l6 > 0 ? Math.min(l15, l6) : 0;
    const dependentFiler = filers.some((item) => item.canBeClaimedAsDependent);
    const l17 = dependentFiler ? 0 : salesTaxFairness(credits.stfc, status, line13a, l3);
    const l17a = resident && !nrh ? null : Math.round(l17 * Math.round((nrh ? 1 - nrhSchedule.C['7'] : 1 - line7) * 10000) / 10000);
    line25d = l16;
    line25e = l17a === null ? l17 : l17a;
    ptfc = l6 > 0 || l17 > 0 ? lineTable({ '2a': l2a, '2b': l2b, '2c': l2c, '2d': l2d, 3: l3, ...(l6 > 0 ? { 4: l4, '5a': l5a, '5c': l5c, '5d': l5d, '5e': l5e, 6: l6, 8: l8, 9: l9, 10: l10, 11: l11, 12: l12, 13: l13, '14a': l14a, 15: l15, 16: l16 } : {}), 17: l17, ...(l17a === null ? {} : { '17a': l17a }) }) : null;
    if (!resident && l6 > 0) checks.push(check('info', 'ME_PTFC_RESIDENT_PERIOD', 'For the property tax fairness credit enter only the property tax and rent you paid on your Maine home while you were a Maine resident.'));
  }
  const line25a = filing.payments.withheld;
  const line25b = filing.payments.estimated + filing.payments.extension;
  const line25c = a9;
  const line25f = line25a + line25b + line25c + line25d + line25e;

  if (positive(answers.militaryRetirementPay) && !pension.total) checks.push(check('warning', 'ME_MILITARY_PENSION_NOT_FOUND', 'Military retirement pay is deducted only to the extent it is in federal adjusted gross income on Form 1040 lines 4b or 5b; none was found.'));
  if (whole(ctx.federal.schedules?.[2]?.['8']) > 0 && pension.total) checks.push(check('warning', 'ME_EARLY_DISTRIBUTION_PENSION', 'Retirement distributions taken early (federal additional tax on Schedule 2 line 8) are not eligible for the Maine pension income deduction.', 'Enter them as pension income that is not eligible.'));
  if (!federalEic && ctx.dependents.length === 0 && income.wages > 0 && income.agi < 20000) checks.push(check('info', 'ME_EITC_CHILDLESS', 'Maine allows its earned income credit to filers aged 18 or older without qualifying children who cannot claim the federal credit; MyCA does not prepare the pro forma federal worksheet for it.'));
  if (careFederal) checks.push(check('info', 'ME_CHILD_CARE_STAR5', 'The Maine child care credit is 50% instead of 25% of the federal credit for expenses paid to a Star 5 child care program; MyCA used 25%.'));

  const lines = lineTable({ 13: line13, '13a': line13a, 14: line14, '15a': line15a, '15b': line15b, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, '20a': line20a, 21: line21, 22: line22, 23: line23, 24: line24, '25a': line25a, '25b': line25b, '25c': line25c, '25d': line25d, '25e': line25e, '25f': line25f });
  const nonrefundable = [
    ...(a10 ? [{ code: 'ME_DETC', label: 'Dependent exemption tax credit', amount: a10 }] : []),
    ...(a11 ? [{ code: 'ME_CHILD_CARE', label: 'Child care credit', amount: a11 }] : []),
    ...(a13 ? [{ code: 'ME_EITC', label: 'Earned income tax credit', amount: a13 }] : []),
    ...(a14 ? [{ code: 'ME_OTHER_STATE', label: 'Credit for income tax paid to other jurisdictions', amount: a14 }] : []),
  ];
  const usedCredits = (() => {
    let left = a23;
    return nonrefundable.map((item) => {
      const amount = Math.min(item.amount, left);
      left -= amount;
      return { ...item, amount };
    }).filter((item) => item.amount > 0);
  })();
  const refundable = [
    ...(a1 ? [{ code: 'ME_DETC', label: 'Dependent exemption tax credit', amount: a1 }] : []),
    ...(a2 ? [{ code: 'ME_CHILD_CARE', label: 'Child care credit (refundable part)', amount: a2 }] : []),
    ...(a4 ? [{ code: 'ME_EITC', label: 'Earned income tax credit', amount: a4 }] : []),
    ...(line25d ? [{ code: 'ME_PTFC', label: 'Property tax fairness credit', amount: line25d }] : []),
    ...(line25e ? [{ code: 'ME_STFC', label: 'Sales tax fairness credit', amount: line25e }] : []),
  ];
  if (surcharge) notes.push(`Line 20 includes the 2% income tax surcharge of $${surcharge.toLocaleString('en-US')} on Maine taxable income above the threshold.`);
  if (nrh) notes.push(`You elected to file single in Maine with Schedule NRH as the ${nrhOwner}; your spouse files their own Maine return if they have Maine-source income.`);
  return {
    form: nrh ? '1040ME with Schedule NRH' : resident ? '1040ME' : '1040ME with Schedule NR',
    lines,
    schedules: {
      '1A': s1a,
      '1S': s1s,
      ...(Object.keys(pension.rows).length ? { 'pension-deduction': pension.rows } : {}),
      ...(schedule2 ? { 2: schedule2 } : {}),
      ...(scheduleNr ? { NR: scheduleNr } : {}),
      ...(nrhSchedule ? { NRH: nrhSchedule } : {}),
      phaseout: lineTable({ deductionRatio: deduction.ratio, deductionBefore: beforePhaseout, exemptionRatio: exemption.ratio, exemptionBefore: exemptionBase, itemized: itemizing ? 1 : 0, ...(surcharge ? { surcharge } : {}) }),
      A: scheduleA,
      ...(detc['5'] ? { 'dependent-exemption-credit': detc } : {}),
      ...(careSheet ? { 'child-care-credit': careSheet } : {}),
      ...(eitcSheet ? { 'earned-income-credit': eitcSheet } : {}),
      ...(otherRows.length ? { 'other-state-credit': otherRows } : {}),
      ...(ptfc ? { PTFC: ptfc } : {}),
    },
    stateIncome: resident && !nrh ? line16 : nrh ? nrhSchedule.B['6'] - nrhSchedule.C['6'] : line16 - (scheduleNr ? scheduleNr['6'] : 0),
    taxableIncome: line19,
    taxBeforeCredits: line20,
    nonrefundableCredits: [...(line21 ? [{ code: 'ME_NONRESIDENT_CREDIT', label: 'Nonresident credit (Schedule NR)', amount: line21 }] : []), ...usedCredits],
    otherStateCredit: Math.min(a14, a23),
    otherTaxes: [],
    totalTax: line24,
    refundableCredits: refundable,
    checks,
    notes,
  };
}

export const STATE = Object.freeze({
  code: 'ME',
  name: 'Maine',
  built: true,
  forms: Object.freeze({ resident: '1040ME', partYear: '1040ME with Schedule NR', nonresident: '1040ME with Schedule NR' }),
  questions: Object.freeze([
    Object.freeze({ id: 'maineMunicipalInterest', when: { has: ['taxExemptInterest'] }, kind: 'amount', text: 'Tax-exempt interest from Maine state or local bonds (including Maine-bond fund dividends)', help: 'Interest from other states\' bonds is added back on Schedule 1A; Maine bond interest is not. Enter 0 if none.' }),
    Object.freeze({ id: 'militaryRetirementPay', when: { has: ['retirementIncome'] }, kind: 'amount', text: 'Military retirement pay included in your federal pension income', help: 'Fully deducted on Schedule 1S line 4 (worksheet line P9).' }),
    Object.freeze({ id: 'ineligiblePension', when: { has: ['retirementIncome'] }, kind: 'amount', text: 'Pension or IRA income that is not eligible for the Maine pension deduction', help: 'For example distributions taken early with a federal penalty, or amounts already excluded. Enter 0 if none.' }),
    Object.freeze({ id: 'maine529Contributions', kind: 'amount', text: 'Contributions to 529 college savings plans in the year', help: 'Deductible up to $1,000 per beneficiary when federal AGI is under the limit.' }),
    Object.freeze({ id: 'maine529Beneficiaries', when: { answer: { id: 'maine529Contributions' } }, kind: 'count', text: 'Number of 529 plan beneficiaries you contributed for', help: 'The $1,000 limit applies per beneficiary.' }),
    Object.freeze({ id: 'propertyTaxPaid', when: { residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'] }, kind: 'amount', text: 'Property tax you paid in the year on your Maine home (while a Maine resident)', help: 'For the refundable property tax fairness credit on Schedule PTFC/STFC line 4.' }),
    Object.freeze({ id: 'rentPaid', when: { residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'] }, kind: 'amount', text: 'Rent you paid in the year for your Maine home (while a Maine resident)', help: 'Schedule PTFC/STFC line 5a. Do not include rent paid by a government program.' }),
    Object.freeze({ id: 'rentIncludesUtilities', when: { residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'] }, kind: 'yesno', text: 'Did the rent include heat, utilities or furniture?', help: 'If yes and you do not know the amount, 15% of the rent is removed.' }),
    Object.freeze({ id: 'utilitiesInRent', when: { residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'], answer: { id: 'rentIncludesUtilities', in: [true] } }, kind: 'amount', text: 'The part of the rent that was for heat, utilities or furniture, if known', help: 'Leave blank to use 15% of the rent.' }),
    Object.freeze({ id: 'disabledVeteran', when: { residency: ['full-year', 'part-year'], filingStatus: ['single', 'mfj', 'hoh', 'qss'] }, kind: 'yesno', text: 'Are you or your spouse a veteran rated 100% permanently and totally disabled by the VA?', help: 'Doubles the property tax fairness credit.' }),
    Object.freeze({ id: 'nrhElectSingle', when: { filingStatus: ['mfj'] }, kind: 'yesno', text: 'Married filing jointly federally, with one spouse not a Maine resident: do you elect to file single in Maine (Schedule NRH)?', help: 'Only the spouse with Maine income files, using their own share of the joint income.' }),
    Object.freeze({ id: 'nrhFiler', when: { filingStatus: ['mfj'], answer: { id: 'nrhElectSingle', in: [true] } }, kind: 'choice', options: Object.freeze(['taxpayer', 'spouse']), text: 'With Schedule NRH, which spouse files the Maine return?', help: 'The return uses only this spouse\'s income.' }),
  ]),
  labels: Object.freeze({
    13: 'Total number of exemptions',
    '13a': 'Total number of qualifying children and dependents',
    14: 'Federal adjusted gross income',
    '15a': 'Income addition modifications (Schedule 1A)',
    '15b': 'Income subtraction modifications (Schedule 1S)',
    16: 'Maine adjusted gross income',
    17: 'Deduction',
    18: 'Exemption',
    19: 'Taxable income',
    20: 'Income tax',
    '20a': 'Tax credit recapture amounts',
    21: 'Nonresident credit (Schedule NR or NRH)',
    22: 'Total tax',
    23: 'Nonrefundable tax credits (Schedule A)',
    24: 'Net tax',
    '25a': 'Maine income tax withheld',
    '25b': 'Estimated tax and extension payments',
    '25c': 'Refundable tax credits (Schedule A)',
    '25d': 'Property tax fairness credit',
    '25e': 'Sales tax fairness credit',
    '25f': 'Total payments and credits',
  }),
  notCovered: Object.freeze([
    'Schedule 1A and 1S items other than out-of-state bond interest, U.S. bond interest, state refunds, Social Security, the pension deduction and 529 contributions (for example bonus depreciation, military pay and pass-through items)',
    'Maine earned income credit for childless filers aged 18 to 24 or ITIN filers without a federal credit',
    'Star 5 child care credit at 50%, adult dependent care credit and the student loan repayment tax credit',
    'Business credits on Schedule A (historic rehabilitation, Dirigo, seed capital, research and others)',
    'Minimum tax recapture (line 20a), use tax (line 30), casual rental tax and voluntary contributions',
    'Safe harbor residents, Worksheets A to C for Schedule NR and Schedule NRH income other than wages',
    'Underpayment penalty (Form 2210ME)',
  ]),
  compute,
});
