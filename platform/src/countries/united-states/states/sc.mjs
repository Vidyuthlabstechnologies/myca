import { whole, positive, rateOf, ratio, check, lineTable, byStatus, sum } from '../state-kit.mjs';

const OWNERS = ['taxpayer', 'spouse'];

const applyRatio = (amount, share, places) => Math.round((whole(amount) * Math.round(share * 10 ** places)) / 10 ** places);

function exactTax(amount, brackets) {
  let units = 0;
  brackets.forEach((band, index) => {
    const low = band.overCents / 100;
    const high = index + 1 < brackets.length ? brackets[index + 1].overCents / 100 : Infinity;
    if (amount > low) units += (Math.min(amount, high) - low) * band.rateBp;
  });
  return Math.floor((units + 5000) / 10000);
}

export function scTax(amount, rule) {
  const income = positive(amount);
  if (income >= rule.tableBelow) return Math.max(0, Math.round((income * rule.scheduleRateBp) / 10000 - rule.scheduleSubtract));
  const band = [...rule.tableBands].reverse().find((item) => income >= item.from);
  const low = band.from + Math.floor((income - band.from) / band.width) * band.width;
  return exactTax(low + band.width / 2, rule.brackets);
}

const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? positive(form.fields?.grossDistribution) : positive(form.fields?.taxableAmount));

function retirementByOwner(ctx) {
  const exception = ctx.answers.earlyDistributionException === true || ctx.answers.earlyDistributionException === 'yes';
  const out = { taxpayer: 0, spouse: 0 };
  for (const form of ctx.forms.filter((item) => item.kind === '1099-R')) {
    const code = String(form.fields?.distributionCode || '').toUpperCase();
    if (code.includes('1') && !exception) continue;
    out[ownerOf(form)] += taxableOf(form);
  }
  return out;
}

function filerOf(ctx, role) {
  return ctx.filers.find((item) => item.role === role) || null;
}

function retirementLines(ctx, filing, deductions, answers, sourcedShare, resident) {
  const own = retirementByOwner(ctx);
  const out = {};
  for (const role of OWNERS) {
    const filer = filerOf(ctx, role);
    if (!filer) {
      Object.assign(out, { [role]: { retirement: 0, military: 0, age65: 0 } });
      continue;
    }
    const income = Math.round(own[role] * sourcedShare);
    const military = Math.min(income, positive(role === 'spouse' ? answers.spouseMilitaryRetirement : answers.militaryRetirement));
    const older = filer.age !== null && filer.age >= 65;
    const cap = older ? deductions.retirement65 : deductions.retirementUnder65;
    const retirement = Math.min(Math.max(0, cap - military), Math.max(0, income - military));
    const age65 = older && resident ? Math.max(0, deductions.age65Deduction - retirement - military) : 0;
    out[role] = { retirement, military, age65 };
  }
  return out;
}

function longTermGain(ctx) {
  const scheduleD = ctx.federal.schedules?.D;
  if (scheduleD) return Math.max(0, Math.min(whole(scheduleD['15']), whole(scheduleD['16'])));
  return Math.max(0, whole(ctx.income.capitalGainDistributions));
}

function stateTaxAddback(ctx, deductions) {
  const scheduleA = ctx.federal.schedules?.A;
  if (!ctx.federal.summary.itemized || !scheduleA) return { amount: 0, worksheet: null };
  const line1 = whole(scheduleA['17']);
  const line2 = ctx.filingStatus === 'mfs' ? 0 : whole(ctx.federal.summary.standardDeduction);
  const line3 = Math.max(0, line1 - line2);
  const line4 = whole(scheduleA['5a']);
  const limit = ctx.filingStatus === 'mfs' ? deductions.saltLimit.mfs : deductions.saltLimit.other;
  const line5 = Math.max(0, limit - whole(scheduleA['5b']) - whole(scheduleA['5c']));
  const line6 = Math.min(line3, line4, line5);
  return { amount: line6, worksheet: lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6 }) };
}

function earnedByOwner(ctx, filing, resident) {
  const out = { taxpayer: 0, spouse: 0 };
  for (const row of ctx.w2) {
    if (!resident && row.state !== 'SC') continue;
    out[row.owner] += !resident ? (row.stateWages === null ? row.wages : row.stateWages) : row.wages;
  }
  const businessShare = resident ? 1 : ratio(filing.sourced.businessIncome, ctx.income.businessIncome, { places: 6 });
  for (const item of ctx.federal.schedules?.C || []) out[item.owner === 'spouse' ? 'spouse' : 'taxpayer'] += Math.round(whole(item.netProfit ?? item.lines?.['31']) * businessShare);
  for (const item of ctx.federal.schedules?.SE || []) out[item.owner === 'spouse' ? 'spouse' : 'taxpayer'] -= Math.round(whole(item.deduction ?? item.lines?.['13']) * businessShare);
  const items = ctx.income.adjustmentItems;
  const spouseIra = Math.min(positive(filing.answers.spouseIraDeduction), items.ira);
  const compShare = resident ? 1 : ratio(whole(filing.sourced.wages) + whole(filing.sourced.businessIncome), ctx.income.wages + ctx.income.businessIncome, { places: 6 });
  out.taxpayer -= Math.round((items.ira - spouseIra) * compShare);
  out.spouse -= Math.round(spouseIra * compShare);
  const seOwner = (ctx.federal.schedules?.C || []).some((item) => item.owner === 'spouse') && !(ctx.federal.schedules?.C || []).some((item) => item.owner !== 'spouse') ? 'spouse' : 'taxpayer';
  out[seOwner] -= Math.round((items.seRetirement + items.seHealth) * businessShare);
  return out;
}

function scheduleNR(ctx, filing, deductions, taxYear2026, answers, retirement) {
  const income = ctx.income;
  const sourced = filing.sourced;
  const partYear = filing.residency === 'part-year';
  const A = { 1: income.wages, 2: income.taxableInterest, 3: income.ordinaryDividends, 4: income.stateRefundTaxable, 5: 0, 6: income.businessIncome, 7: income.capitalGain, 8: 0, 9: income.iraTaxable, 10: income.pensionTaxable, 11: 0, 12: 0, 13: income.unemployment, 14: income.socialSecurityTaxable, 15: income.otherIncome };
  const B = { 1: whole(sourced.wages), 2: whole(sourced.taxableInterest), 3: whole(sourced.ordinaryDividends), 4: 0, 5: 0, 6: whole(sourced.businessIncome), 7: whole(sourced.capitalGain), 8: 0, 9: whole(sourced.iraTaxable), 10: whole(sourced.pensionTaxable), 11: 0, 12: 0, 13: whole(sourced.unemployment), 14: 0, 15: whole(sourced.otherIncome) };
  A[16] = sum(Object.values(A));
  B[16] = sum(Object.values(B));
  const items = income.adjustmentItems;
  const byShare = (amount, part, total) => (whole(total) > 0 ? Math.round((whole(amount) * Math.max(0, whole(part))) / whole(total)) : 0);
  const comp = [B[1] + B[6], A[1] + A[6]];
  A[17] = items.educator; B[17] = Math.min(A[17], byShare(A[17], B[16], A[16]));
  A[18] = 0; B[18] = 0;
  A[19] = items.hsa; B[19] = Math.min(A[19], byShare(A[19], comp[0], comp[1]));
  A[20] = 0; B[20] = 0;
  A[21] = items.seTaxDeduction; B[21] = Math.min(A[21], byShare(A[21], B[6], A[6]));
  A[22] = items.seRetirement; B[22] = Math.min(A[22], byShare(A[22], B[6], A[6]));
  A[23] = items.seHealth; B[23] = Math.min(A[23], byShare(A[23], B[6], A[6]));
  A[24] = items.earlyWithdrawal; B[24] = Math.min(A[24], byShare(A[24], B[2], A[2]));
  A[25] = 0; B[25] = 0;
  A[26] = items.ira; B[26] = Math.min(A[26], byShare(A[26], comp[0], comp[1]));
  A[27] = items.studentLoan; B[27] = Math.min(A[27], byShare(A[27], B[16], A[16]));
  const listed = sum([17, 19, 21, 22, 23, 24, 26, 27].map((key) => A[key]));
  A[28] = Math.max(0, income.adjustments - listed); B[28] = Math.min(A[28], byShare(A[28], B[16], A[16]));
  A[29] = 0; B[29] = 0;
  A[30] = sum([17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29].map((key) => A[key]));
  B[30] = sum([17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29].map((key) => B[key]));
  A[31] = A[16] - A[30];
  B[31] = B[16] - B[30];
  const line32 = partYear ? positive(answers.scMunicipalInterest) : 0;
  const line33 = ctx.dependents.length * deductions.dependentExemption;
  const gainShare = A[7] > 0 ? Math.max(0, Math.min(1, B[7] / A[7])) : 0;
  const line34 = rateOf(Math.round(longTermGain(ctx) * gainShare), deductions.capitalGainBasisPoints);
  const r = retirement;
  const line36a = partYear ? r.taxpayer.age65 : 0;
  const line36b = partYear ? r.spouse.age65 : 0;
  const under6 = ctx.dependents.filter((item) => item.age !== null && item.age < 6).length;
  const line37 = partYear ? under6 * deductions.dependentExemption : 0;
  const line38 = positive(answers.collegeSavings);
  const line41 = whole(sourced.usObligationInterest);
  const line42 = line33 + line34 + r.taxpayer.retirement + r.spouse.retirement + r.taxpayer.military + r.spouse.military + line36a + line36b + line37 + line38 + line41;
  const line43 = line32 - line42;
  const line44 = B[31] + line43;
  const line45 = ratio(B[31], A[31], { places: 4 });
  let line46;
  let itemizedParts = null;
  if (taxYear2026) {
    line46 = sciad(ctx, deductions);
  } else if (ctx.federal.summary.itemized) {
    const addback = stateTaxAddback(ctx, deductions);
    itemizedParts = { partI: whole(ctx.federal.schedules?.A?.['17']), partII: addback.amount };
    line46 = Math.max(0, itemizedParts.partI - itemizedParts.partII);
  } else {
    line46 = Math.max(0, whole(ctx.federal.summary.standardDeduction) - byStatus(deductions.unadoptedStandardIncrease, ctx.filingStatus));
  }
  const line47 = applyRatio(line46, line45, 4);
  const line48 = line44 - line47;
  const lines = {};
  for (let key = 1; key <= 31; key += 1) {
    lines[`${key}A`] = A[key];
    lines[`${key}B`] = B[key];
  }
  Object.assign(lines, { 32: line32, 33: line33, 34: line34, '35a': r.taxpayer.retirement, '35b': r.spouse.retirement, '35c': 0, '35d': r.taxpayer.military, '35e': r.spouse.military, '35f': 0, '36a': line36a, '36b': line36b, 37: line37, 38: line38, 39: 0, 40: 0, 41: line41, 42: line42, 43: line43, 44: line44, 45: line45, 46: line46, 47: line47, 48: line48 });
  return { lines: lineTable(lines), proration: line45, taxable: Math.max(0, line48), stateIncome: B[31], grossIncome: B[16] - line33 - line34 - line36a - line36b - line37, itemizedParts };
}

function sciad(ctx, deductions) {
  const table = deductions.sciad;
  const amount = byStatus(table.amount, ctx.filingStatus);
  const over = ctx.income.agi - byStatus(table.phaseStart, ctx.filingStatus);
  if (over <= 0) return amount;
  const fraction = over / byStatus(table.phaseRange, ctx.filingStatus);
  if (fraction >= 1) return 0;
  const reduction = Math.floor((amount * fraction) / table.roundDownTo) * table.roundDownTo;
  return amount - reduction;
}

function childCareCredit(ctx, answers, credits, proration, checks) {
  const expenses = positive(answers.careExpenses);
  if (!expenses) {
    if (positive(ctx.answers.childCareExpenses) > 0 && ctx.filingStatus !== 'mfs') checks.push(check('warning', 'SC_CHILD_CARE_EXPENSES', 'You paid child or dependent care: South Carolina gives 7% of the qualified expenses on federal Form 2441, which MyCA does not prepare, so no South Carolina credit is included yet.', 'Answer the federal Form 2441 expenses question once Form 2441 is done.'));
    return 0;
  }
  if (ctx.filingStatus === 'mfs') return 0;
  const persons = ctx.dependents.filter((item) => (item.age !== null && item.age < 13) || item.disabled).length;
  const maximum = persons >= 2 ? credits.childCareMaximum.twoOrMore : credits.childCareMaximum.one;
  return Math.min(maximum, rateOf(applyRatio(expenses, proration, 4), credits.childCareBasisPoints));
}

function twoWageEarner(ctx, filing, credits, resident) {
  if (ctx.filingStatus !== 'mfj') return { amount: 0, earned: null };
  const earned = earnedByOwner(ctx, filing, resident);
  if (earned.taxpayer <= 0 || earned.spouse <= 0) return { amount: 0, earned };
  return { amount: rateOf(Math.min(credits.twoWageEarnerLimit, earned.taxpayer, earned.spouse), credits.twoWageEarnerBasisPoints), earned };
}

function otherStateCredit(filing, grossIncome, scTaxAmount) {
  const worksheets = [];
  for (const other of filing.otherStates || []) {
    const line1 = Math.max(0, grossIncome);
    const line2 = Math.min(line1, positive(other.income));
    const line3 = ratio(line2, line1, { places: 4 });
    const line5 = applyRatio(scTaxAmount, line3, 4);
    const line6 = positive(other.tax);
    const line7 = Math.min(line5, line6);
    worksheets.push({ state: other.state, 1: line1, 2: line2, 3: line3, 4: scTaxAmount, 5: line5, 6: line6, 7: line7 });
  }
  return worksheets;
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const deductions = reader.read('deductions');
  const credits = reader.read('credits');
  if (!rule || !deductions || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no South Carolina figures for ${ctx.taxYear}.` };
  const y2026 = rule.startsFrom === 'federal-agi';
  const answers = filing.answers;
  const income = ctx.income;
  const resident = filing.residency === 'full-year';
  const checks = [];
  const federalLines = ctx.federal.lines;
  const totalRetirement = income.iraTaxable + income.pensionTaxable;
  const retirementShare = resident ? 1 : totalRetirement > 0 ? Math.min(1, (whole(filing.sourced.iraTaxable) + whole(filing.sourced.pensionTaxable)) / totalRetirement) : 0;
  const retirement = retirementLines(ctx, filing, deductions, answers, retirementShare, filing.residency !== 'nonresident');
  const under6 = ctx.dependents.filter((item) => item.age !== null && item.age < 6).length;
  const municipal = positive(answers.scMunicipalInterest);
  if (income.taxExemptInterest > 0 && answers.scMunicipalInterest === undefined && filing.residency !== 'nonresident') checks.push(check('error', 'SC_MUNICIPAL_INTEREST', `Your federal return shows $${income.taxExemptInterest.toLocaleString('en-US')} of tax-exempt interest. South Carolina taxes interest on bonds of other states and their localities.`, 'Answer how much of it came from bonds issued outside South Carolina (0 if all South Carolina bonds).'));
  if (totalRetirement > 0 && answers.militaryRetirement === undefined) checks.push(check('info', 'SC_MILITARY_RETIREMENT', 'Military retirement is fully deductible in South Carolina and reduces the general retirement and age 65 deductions.', 'If any retirement income is military retirement, enter it in the South Carolina questions.'));
  if (answers.useTax === undefined) checks.push(check('warning', 'SC_USE_TAX', 'South Carolina asks for use tax on online or out-of-state purchases with no South Carolina sales tax, or a certification that none is due.', 'Answer the use tax question (0 if none).'));
  if (ctx.filers.some((item) => item.canBeClaimedAsDependent)) checks.push(check('warning', 'SC_DEPENDENT_FILER', 'Someone can claim you as a dependent; check the South Carolina deduction you are allowed with the SC1040 instructions.', ''));
  let nr = null;
  const lines = {};
  const schedules = {};
  let taxable;
  let stateIncome;
  let grossIncome;
  let proration = 1;
  if (!resident) {
    nr = scheduleNR(ctx, filing, deductions, y2026, answers, retirement);
    schedules.NR = nr.lines;
    proration = nr.proration;
    taxable = nr.taxable;
    stateIncome = nr.stateIncome;
    grossIncome = nr.grossIncome;
  }
  if (!y2026) {
    const federalTaxable = whole(federalLines['15']);
    const addback = resident ? stateTaxAddback(ctx, deductions) : { amount: 0, worksheet: null };
    const increase = !ctx.federal.summary.itemized ? Math.min(byStatus(deductions.unadoptedStandardIncrease, ctx.filingStatus), whole(ctx.federal.summary.standardDeduction)) : 0;
    const lineE = resident ? increase + whole(federalLines['13a']) + whole(federalLines['13b']) : 0;
    const a = addback.amount;
    const d = resident ? municipal : 0;
    const line2 = a + d + lineE;
    const line3 = federalTaxable + line2;
    const f = resident ? income.stateRefundTaxable : 0;
    const i = resident ? rateOf(longTermGain(ctx), deductions.capitalGainBasisPoints) : 0;
    const k = resident ? positive(answers.collegeSavings) : 0;
    const m = resident ? income.usObligationInterest : 0;
    const o = resident ? income.socialSecurityTaxable : 0;
    const r = resident ? Math.max(0, whole(federalLines['14']) - whole(federalLines['11'])) : 0;
    const t = resident ? under6 * deductions.dependentExemption : 0;
    const w = resident ? ctx.dependents.length * deductions.dependentExemption : 0;
    const p = resident ? { 1: retirement.taxpayer.retirement, 2: retirement.spouse.retirement, 4: retirement.taxpayer.military, 5: retirement.spouse.military } : { 1: 0, 2: 0, 4: 0, 5: 0 };
    const q = resident ? { 1: retirement.taxpayer.age65, 2: retirement.spouse.age65 } : { 1: 0, 2: 0 };
    const line4 = f + i + k + m + o + p[1] + p[2] + p[4] + p[5] + q[1] + q[2] + r + t + w;
    if (resident) {
      taxable = Math.max(0, line3 - line4);
      stateIncome = income.agi + d - f - m - o;
      grossIncome = income.totalIncome + d - (f + i + m + o + p[1] + p[2] + p[4] + p[5] + q[1] + q[2] + t + w);
      if (lineE) checks.push(check('info', 'SC_FEDERAL_CHANGES_ADDED_BACK', `South Carolina has not adopted the 2025 federal changes (One Big Beautiful Bill Act), so $${lineE.toLocaleString('en-US')} of federal deductions (standard deduction increase, senior, tips, overtime, car loan interest or qualified business income deduction) is added back on line e (SC Information Letter #26-4).`));
      if (addback.worksheet) schedules['State tax addback'] = addback.worksheet;
      const salt = whole(ctx.federal.schedules?.A?.['5e']);
      if (ctx.federal.summary.itemized && salt > (ctx.filingStatus === 'mfs' ? 5000 : 10000)) checks.push(check('warning', 'SC_SALT_LIMIT', 'South Carolina Information Letter #26-4 says South Carolina has not adopted the higher federal state and local tax deduction limit for 2025; the SC1040 instructions still use $40,000.', 'Ask a preparer whether to add back state and local taxes deducted above $10,000.'));
    }
    Object.assign(lines, { 1: federalTaxable, a, b: 0, c: 0, d, e: lineE, 2: line2, 3: line3, f, g: 0, h: 0, i, j: 0, k, l: 0, m, n: 0, o, 'p-1': p[1], 'p-2': p[2], 'p-3': 0, 'p-4': p[4], 'p-5': p[5], 'p-6': 0, 'q-1': q[1], 'q-2': q[2], r, s: 0, t, u: 0, v: 0, w, 4: line4, 5: taxable });
  } else {
    const line1 = Math.max(0, income.agi);
    const adj = {};
    adj.c1 = resident ? municipal : 0;
    adj.add = adj.c1;
    adj.a = resident ? Math.max(0, -income.agi) : 0;
    adj.b = resident ? ctx.dependents.length * deductions.dependentExemption : 0;
    adj.c = resident ? under6 * deductions.dependentExemption : 0;
    adj.d = resident ? income.socialSecurityTaxable : 0;
    adj.g1 = resident ? retirement.taxpayer.military : 0;
    adj.g2 = resident ? retirement.spouse.military : 0;
    adj.h1 = resident ? retirement.taxpayer.retirement : 0;
    adj.h2 = resident ? retirement.spouse.retirement : 0;
    adj.i1 = resident ? retirement.taxpayer.age65 : 0;
    adj.i2 = resident ? retirement.spouse.age65 : 0;
    adj.j = resident ? income.stateRefundTaxable : 0;
    adj.m = resident ? rateOf(longTermGain(ctx), deductions.capitalGainBasisPoints) : 0;
    adj.o = resident ? positive(answers.collegeSavings) : 0;
    adj.p = resident ? income.usObligationInterest : 0;
    adj.u = resident ? Math.min(deductions.pollWorkerMaximum, positive(answers.pollWorkerPay)) : 0;
    const subtractions = adj.a + adj.b + adj.c + adj.d + adj.g1 + adj.g2 + adj.h1 + adj.h2 + adj.i1 + adj.i2 + adj.j + adj.m + adj.o + adj.p + adj.u;
    const line4 = resident ? sciad(ctx, deductions) : 0;
    const line2 = adj.add;
    const line3 = line1 + line2;
    const line5 = subtractions;
    const line6 = line4 + line5;
    if (resident) {
      taxable = Math.max(0, line3 - line6);
      stateIncome = line3 - line5;
      grossIncome = income.totalIncome + adj.c1 - (adj.b + adj.c + adj.d + adj.g1 + adj.g2 + adj.h1 + adj.h2 + adj.i1 + adj.i2 + adj.j + adj.m + adj.p);
      if (line2 || line5) schedules.ADJ = lineTable({ '1c': adj.c1, '1total': line2, '2a': adj.a, '2b': adj.b, '2c': adj.c, '2d': adj.d, '2g-1': adj.g1, '2g-2': adj.g2, '2h-1': adj.h1, '2h-2': adj.h2, '2i-1': adj.i1, '2i-2': adj.i2, '2j': adj.j, '2m': adj.m, '2o': adj.o, '2p': adj.p, '2u': adj.u, '2total': line5 });
    }
    Object.assign(lines, { 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: taxable });
  }
  const tax = scTax(taxable, rule);
  const eitcAllowed = resident;
  const federalEic = whole(federalLines['27']);
  const eitcRaw = eitcAllowed ? rateOf(federalEic, credits.eitcBasisPoints) : 0;
  const eitc = credits.eitcMaximum === null ? eitcRaw : Math.min(credits.eitcMaximum, eitcRaw);
  if (!resident && federalEic) checks.push(check('info', 'SC_EITC_RESIDENTS_ONLY', 'The South Carolina earned income tax credit is only for full-year residents.'));
  const childCare = childCareCredit(ctx, answers, credits, proration, checks);
  if (!resident && childCare) checks.push(check('warning', 'SC_CHILD_CARE_NONRESIDENT', 'A part-year resident or nonresident cannot take the South Carolina child care credit if the home state gives no such credit to nonresidents.', 'Remove the care expenses answer if your other state gives no such credit.'));
  const twoWage = twoWageEarner(ctx, filing, credits, resident);
  if (twoWage.earned && ctx.income.adjustmentItems.ira > 0 && answers.spouseIraDeduction === undefined) checks.push(check('warning', 'SC_TWO_WAGE_IRA', 'The two wage earner credit subtracts each spouse\'s own IRA deduction from that spouse\'s earned income; MyCA has treated all of it as yours.', 'Answer how much of the IRA deduction is your spouse\'s.'));
  const worksheets = resident ? otherStateCredit(filing, grossIncome, tax) : [];
  if (filing.residency === 'part-year') checks.push(check('warning', 'SC_PART_YEAR_OTHER_STATE_CREDIT', 'As a part-year resident you may claim the SC1040TC credit for tax paid to another state on income taxed by both while you lived in South Carolina; MyCA does not work it out for part-year residents.', 'Work out the SC1040TC worksheet with the other state\'s return.'));
  const otherState = sum(worksheets, (item) => item[7]);
  let room = tax;
  const take = (amount) => {
    const used = Math.min(room, positive(amount));
    room -= used;
    return used;
  };
  const items = [];
  const push = (code, label, amount) => {
    const used = take(amount);
    if (used) items.push({ code, label, amount: used });
    return used;
  };
  let tcTotal;
  let line14;
  let usedOther;
  if (y2026) {
    const l10 = push('SC_EITC', 'South Carolina earned income tax credit', eitc);
    const l11 = push('SC_CHILD_CARE', 'Child and dependent care credit', childCare);
    const l12 = push('SC_TWO_WAGE_EARNER', 'Two wage earner credit', twoWage.amount);
    usedOther = push('SC_OTHER_STATE', 'Credit for taxes paid to another state (SC1040TC)', otherState);
    tcTotal = usedOther;
    line14 = l10 + l11 + l12 + tcTotal;
    Object.assign(lines, { '8a': tax, '8b': 0, '8c': 0, '8d': 0, 9: tax, 10: l10, 11: l11, 12: l12, 13: tcTotal, 14: line14, 15: tax - line14 });
  } else {
    const l11 = push('SC_CHILD_CARE', 'Child and dependent care credit', childCare);
    const l12 = push('SC_TWO_WAGE_EARNER', 'Two wage earner credit', twoWage.amount);
    usedOther = push('SC_OTHER_STATE', 'Credit for taxes paid to another state (SC1040TC)', otherState);
    const usedEitc = push('SC_EITC', 'South Carolina earned income tax credit (TC-60)', eitc);
    tcTotal = usedOther + usedEitc;
    line14 = l11 + l12 + tcTotal;
    Object.assign(lines, { 6: tax, 7: 0, 8: 0, 9: 0, 10: tax, 11: l11, 12: l12, 13: tcTotal, 14: line14, 15: tax - line14 });
  }
  if (tcTotal) schedules.SC1040TC = lineTable({ 1: usedOther, ...(y2026 ? {} : { '060': tcTotal - usedOther }), 16: tcTotal, 17: tax, 18: tcTotal });
  for (const sheet of worksheets) schedules[`SC1040TC worksheet ${sheet.state}`] = lineTable({ 1: sheet[1], 2: sheet[2], 3: sheet[3], 4: sheet[4], 5: sheet[5], 6: sheet[6], 7: sheet[7] });
  if (twoWage.earned) schedules['Two wage earner worksheet'] = lineTable({ '5a': twoWage.earned.taxpayer, '5b': twoWage.earned.spouse, 6: Math.max(0, Math.min(credits.twoWageEarnerLimit, twoWage.earned.taxpayer, twoWage.earned.spouse)), 7: twoWage.amount });
  const afterCredits = tax - line14;
  const useTax = positive(answers.useTax);
  const payments = filing.payments;
  Object.assign(lines, { 16: payments.withheld, 17: payments.estimated, 18: payments.extension, 26: useTax });
  return {
    form: 'SC1040',
    lines: lineTable(lines),
    schedules,
    stateIncome,
    taxableIncome: taxable,
    taxBeforeCredits: tax,
    nonrefundableCredits: items,
    otherStateCredit: usedOther,
    otherTaxes: useTax ? [{ code: 'SC_USE_TAX', label: 'Use tax', amount: useTax }] : [],
    totalTax: afterCredits + useTax,
    refundableCredits: [],
    checks,
  };
}

const PAYMENT_LABELS = Object.freeze({
  11: 'Child and dependent care credit',
  12: 'Two wage earner credit',
  13: 'Other nonrefundable credits (SC1040TC)',
  14: 'Total nonrefundable credits',
  16: 'SC income tax withheld',
  17: 'Estimated tax payments',
  18: 'Amount paid with extension',
  26: 'Use tax due on online, mail-order or out-of-state purchases',
});

const LABELS_2025 = Object.freeze({
  ...PAYMENT_LABELS,
  1: 'Federal taxable income',
  a: 'State tax addback, if itemizing on federal return',
  b: 'Out-of-state losses',
  c: 'Expenses related to National Guard and Reserve income',
  d: 'Interest on obligations of states other than South Carolina',
  e: 'Other additions to income',
  2: 'Total additions',
  3: 'Line 1 plus line 2',
  f: 'State tax refund, if included on your federal return',
  g: 'Total and permanent disability retirement income',
  h: 'Out-of-state income or gain',
  i: '44% of net capital gains held for more than one year',
  j: 'Volunteer deductions',
  k: 'Contributions to the SC College Investment Program',
  l: 'Active trade or business income deduction',
  m: 'Interest income from obligations of the US government',
  n: 'Certain nontaxable National Guard or Reserve pay',
  o: 'Social Security and railroad retirement taxed federally',
  'p-1': 'Retirement deduction: taxpayer',
  'p-2': 'Retirement deduction: spouse',
  'p-3': 'Retirement deduction: surviving spouse',
  'p-4': 'Military retirement deduction: taxpayer',
  'p-5': 'Military retirement deduction: spouse',
  'p-6': 'Military retirement deduction: surviving spouse',
  'q-1': 'Age 65 and older deduction: taxpayer',
  'q-2': 'Age 65 and older deduction: spouse',
  r: 'Negative amount of federal taxable income',
  s: 'Subsistence allowance',
  t: 'Dependents under the age of 6 on December 31',
  u: 'Consumer Protection Services',
  v: 'Other subtractions',
  w: 'South Carolina dependent exemption',
  4: 'Total subtractions',
  5: 'South Carolina income subject to tax',
  6: 'Tax on your South Carolina income subject to tax',
  7: 'Tax on lump sum distribution',
  8: 'Tax on active trade or business income',
  9: 'Tax on excess withdrawals from catastrophe savings accounts',
  10: 'Total South Carolina tax',
  15: 'Line 10 minus line 14',
});

const LABELS_2026 = Object.freeze({
  ...PAYMENT_LABELS,
  1: 'Federal adjusted gross income',
  2: 'Additions from Schedule ADJ',
  3: 'Line 1 plus line 2',
  4: 'South Carolina income adjusted deduction (SCIAD)',
  5: 'Subtractions from Schedule ADJ',
  6: 'Total subtractions',
  7: 'South Carolina income subject to tax',
  '8a': 'Tax on your South Carolina income subject to tax',
  '8b': 'Tax on lump sum distribution',
  '8c': 'Tax on active trade or business income',
  '8d': 'Tax on excess withdrawals from catastrophe savings accounts',
  9: 'Total South Carolina tax',
  10: 'South Carolina earned income tax credit',
  15: 'Line 9 minus line 14',
});

export const STATE = Object.freeze({
  code: 'SC',
  name: 'South Carolina',
  labels: (taxYear) => (Number(taxYear) >= 2026 ? LABELS_2026 : LABELS_2025),
  built: true,
  forms: Object.freeze({ resident: 'SC1040', partYear: 'SC1040 with Schedule NR', nonresident: 'SC1040 with Schedule NR' }),
  questions: Object.freeze([
    Object.freeze({ id: 'scMunicipalInterest', when: { has: ['taxExemptInterest'] }, kind: 'amount', text: 'Tax-exempt interest from bonds of states and localities other than South Carolina', help: 'Part of the tax-exempt interest on your federal return; South Carolina taxes it. For a mutual fund use the out-of-state share. Part-year residents: the part received while a resident. Enter 0 if none.' }),
    Object.freeze({ id: 'collegeSavings', kind: 'amount', text: 'Contributions to the SC College Investment Program (Future Scholar) or SC Tuition Prepayment Program', help: 'Deducted in full on the South Carolina return.' }),
    Object.freeze({ id: 'militaryRetirement', when: { has: ['retirementIncome'] }, kind: 'amount', text: 'Your military retirement income included in your federal income', help: 'Fully deductible; it reduces your general retirement and age 65 deductions.' }),
    Object.freeze({ id: 'spouseMilitaryRetirement', when: { has: ['spouse', 'retirementIncome'] }, kind: 'amount', text: 'Your spouse\'s military retirement income included in federal income', help: 'Joint returns only.' }),
    Object.freeze({ id: 'careExpenses', when: { filingStatus: ['single', 'mfj', 'hoh', 'qss'] }, kind: 'amount', text: 'Qualified child and dependent care expenses from federal Form 2441 (line 6)', help: 'South Carolina gives a credit of 7% of this amount, up to $210 for one child or $420 for two or more.' }),
    Object.freeze({ id: 'spouseIraDeduction', when: { filingStatus: ['mfj'] }, kind: 'amount', text: 'Part of the federal IRA deduction that is for your spouse\'s IRA', help: 'Used for the two wage earner credit on a joint return.' }),
    Object.freeze({ id: 'pollWorkerPay', when: { residency: ['full-year'] }, kind: 'amount', text: 'Pay received as a poll worker (2026 and later)', help: 'Up to $2,500 is subtracted on Schedule ADJ line u.' }),
    Object.freeze({ id: 'useTax', kind: 'amount', text: 'South Carolina use tax owed on online or out-of-state purchases', help: 'Purchases with no South Carolina sales tax, at your county\'s sales tax rate. Enter 0 to certify none is due.' }),
  ]),
  notCovered: Object.freeze([
    'Out-of-state losses and out-of-state rental or business income (lines b and h, 2026 Schedule ADJ a and l)',
    'National Guard and Reserve pay and retirement, subsistence allowance, volunteer and consumer protection deductions',
    'Total and permanent disability retirement income and surviving spouse retirement deductions (p-3, p-6)',
    'Active trade or business income at the 3% rate (I-335), lump-sum distribution tax (SC4972) and catastrophe savings accounts',
    'Business and other nonrefundable credits on SC1040TC other than the credit for taxes paid to another state and the EITC',
    'Refundable credits on line 22 (tuition, classroom teacher, parental, milk and anhydrous ammonia credits)',
    'Credit for taxes paid to another state for part-year residents',
    'Underpayment penalty (SC2210) and check-off contributions',
  ]),
  compute,
});
